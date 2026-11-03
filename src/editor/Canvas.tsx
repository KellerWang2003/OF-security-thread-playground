import { runAction } from '../cloud/notices'
import { Maximize, Minus, Plus, Share } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IconButton, Panel } from '../components/controls'
import { NoteView } from '../components/NoteView'
import { driftWithin, useCutDrift } from '../lib/continuous'
import { clamp } from '../lib/frames'
import { lensState } from '../lib/lens'
import { playbackPlan } from '../lib/moves'
import { usePanelWidth } from '../lib/panelWidth'
import { playbackLens, playbackTilt } from '../lib/pattern'
import { usePatternOffsets } from '../lib/patternOffset'
import { type Guide, snapBox } from '../lib/snap'
import { updateNote } from '../lib/store'
import type { Note } from '../lib/types'
import { lengthIn, useLengthUnit } from '../lib/units'
import { isPlaced, type PlacedLayer } from '../lib/layers'
import { type PlacedBox, moveBox } from '../lib/placed'
import { setTilt, springToFlat, useTilt, useTiltLoop } from '../tilt/tilt'
import { EdgeMarks, NeighbourRing } from './ContinuousView'
import { addImageFrames, type NoteRef } from './frameActions'
import { placeLayer, type Layer } from './layerActions'
import { PlacingBox } from './PlacingBox'
import { WindowEditor } from './WindowEditor'
import { useElementSize } from './useElementSize'

/** CSS pixels per millimetre at 100% zoom, so 100% is roughly true size */
const PX_PER_MM = 96 / 25.4
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
/** Room kept clear of the floating panels when fitting notes into view: the Banknotes panel is 224 px wide */
const FIT = { left: 260, right: 284, top: 48, bottom: 128 }
/** How close, in screen px, a moving banknote's edge or centre must come to another's to snap to it */
const SNAP_PX = 6
/** How long a pan or zoom pauses before banknotes are redrawn at the new view */
const COMMIT_MS = 120
/** Background dot spacing at `scale` px per mm */
const gridStep = (scale: number) => scale * (scale * 10 < 12 ? 50 : 10)

/** Zoom level and where the canvas origin (0, 0 mm) sits on screen, in px */
interface View {
  zoom: number
  x: number
  y: number
}

type Gesture =
  | { mode: 'pan'; startX: number; startY: number; view: View; onBackground: boolean }
  | { mode: 'move'; noteId: string; startX: number; startY: number; noteX: number; noteY: number }
  /** `moved` once the drag passes a few px: a plain click leaves the tilt where it is, and picks the banknote */
  | { mode: 'tilt'; noteId: string; startX: number; startY: number; start: number; startSide: number; moved: boolean }
  | { mode: 'thread'; noteId: string; startX: number; startY: number; startPosition: number; alongMm: number }
  /** A placed layer (the watermark, magnetic ink) moves only once the drag passes a few px, so a click just picks it */
  | { mode: 'placed'; layer: PlacedLayer; noteId: string; startX: number; startY: number; original: PlacedBox; moved: boolean }

function fitView(notes: Note[], size: { width: number; height: number }): View {
  // A widened right panel takes more room
  const FIT_INSETS = { ...FIT, right: Math.max(FIT.right, usePanelWidth.getState().width + 36) }
  const minX = Math.min(...notes.map((n) => n.x))
  const minY = Math.min(...notes.map((n) => n.y))
  const maxX = Math.max(...notes.map((n) => n.x + n.widthMm))
  const maxY = Math.max(...notes.map((n) => n.y + n.heightMm))
  const zoom = clamp(
    Math.min(
      (size.width - FIT_INSETS.left - FIT_INSETS.right) / ((maxX - minX) * PX_PER_MM),
      (size.height - FIT_INSETS.top - FIT_INSETS.bottom) / ((maxY - minY) * PX_PER_MM),
    ),
    MIN_ZOOM,
    MAX_ZOOM,
  )
  const scale = zoom * PX_PER_MM
  return {
    zoom,
    x: FIT_INSETS.left + (size.width - FIT_INSETS.left - FIT_INSETS.right) / 2 - ((minX + maxX) / 2) * scale,
    y: FIT_INSETS.top + (size.height - FIT_INSETS.top - FIT_INSETS.bottom) / 2 - ((minY + maxY) / 2) * scale,
  }
}

/**
 * Every note of the project on one zoomable canvas. Scroll or drag the background to pan, pinch or
 * ⌘/Ctrl-scroll to zoom, drag a note's label to move it, its thread, watermark or magnetic ink to move that across
 * it, and the note itself to tilt.
 */
export function Canvas({
  projectId,
  notes,
  selectedId,
  layer = 'note',
  onSelect,
  onSelectLayer,
  focus,
  editingWindows = false,
  selectedWindowId,
  onWindowSelect,
  onExitWindows,
  placing,
  onExitPlacing,
  onExport,
  onEditWindow,
  onEditThread,
}: {
  projectId: string
  notes: Note[]
  selectedId: string | undefined
  /** The selected banknote's part that is picked, outlined on the canvas: the banknote itself, its thread, watermark or magnetic ink */
  layer?: Layer
  /** Selects a banknote itself, or nothing */
  onSelect: (noteId: string | undefined) => void
  /** A press on a banknote's thread, watermark or magnetic ink picks that layer only */
  onSelectLayer: (noteId: string, layer: Layer) => void
  /** Centres the canvas on a note whenever the token changes */
  focus?: { noteId: string; token: number }
  editingWindows?: boolean
  selectedWindowId?: string
  onWindowSelect: (id: string | undefined) => void
  onExitWindows?: () => void
  /** The selected banknote's layer being placed: the banknote shows flat (its watermark clear) with the layer's box to drag */
  placing?: PlacedLayer
  onExitPlacing?: () => void
  /** Export, at the end of the corner bar after the zoom controls; left out while the thread editor is open */
  onExport?: () => void
  /** A click on a thread window opens it for editing */
  onEditWindow?: (noteId: string, windowId: string) => void
  /** A double-click on a thread, or the Edit thread button under the picked one, opens the thread editor; left out while it is open */
  onEditThread?: (noteId: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const size = useElementSize(ref)
  const [view, setView] = useState<View>()
  const gesture = useRef<Gesture | null>(null)
  const [activeMode, setActiveMode] = useState<Gesture['mode']>()
  const [dropping, setDropping] = useState(false)
  const [guides, setGuides] = useState<Guide[]>([])
  // What a click would pick under the pointer, outlined lightly: a banknote itself (or its label), its thread, watermark or magnetic ink
  const [hover, setHover] = useState<{ noteId: string; part: Layer }>()
  // Not the angles themselves: each NoteView follows the tilt on its own, so the canvas doesn't re-render
  // every animation frame while tilting or playing
  const source = useTilt((s) => s.source)
  // Scrubbing the timeline shows the banknotes flat, as Thread Studio's thread lies flat (Keller); a drag, the pad or play turns them again
  const scrubbing = source === 'timeline'
  const perspective = useTilt((s) => s.perspective)
  const sheen = useTilt((s) => s.sheen)
  const frameNumbers = useTilt((s) => s.frameNumbers)

  const selected = notes.find((n) => n.id === selectedId)
  const reference = selected ?? notes.at(0)
  // A thread mixing ridge angles plays each tilt at its fastest section's cycle
  const lens = useMemo(() => (reference ? playbackLens(reference) : undefined), [reference])
  const loopLens = lens ?? lensState({ cycleDeg: 30, transition: 0 })
  const plan = useMemo(() => playbackPlan(reference ? playbackTilt(reference) : { cycleDeg: 30, transition: 0 }, loopLens), [reference, loopLens])
  useTiltLoop(plan, loopLens.viewDeg)
  const offsets = usePatternOffsets((s) => s.offsets)
  const drifts = useCutDrift((s) => s.drifts)
  const unit = useLengthUnit((s) => s.unit)

  // Until the first pan or zoom, the view simply fits every note
  const current = view ?? (size && notes.length ? fitView(notes, size) : undefined)
  const scale = current ? current.zoom * PX_PER_MM : 0

  /**
   * Panning and zooming move the drawn canvas as one layer (a CSS transform on `content`) instead of
   * re-rendering every banknote on each wheel step; the view is committed, and banknotes redrawn sharp
   * at the new zoom, once the gesture pauses. `viewRef` is always the view on screen.
   */
  const content = useRef<HTMLDivElement>(null)
  const live = useRef<View>(undefined)
  const commitTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const committed = useRef(current)
  committed.current = current
  const viewRef = useRef(current)
  viewRef.current = live.current ?? current

  const showView = (v: View) => {
    const base = committed.current
    const element = ref.current
    if (!base || !content.current || !element) return setView(v)
    live.current = v
    viewRef.current = v
    clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(commitView, COMMIT_MS)
    // A trackpad sends several wheel events per frame: draw only the latest, once a frame
    if (!frame.current) frame.current = requestAnimationFrame(drawLive)
  }
  const frame = useRef(0)
  const drawLive = () => {
    frame.current = 0
    const v = live.current
    const base = committed.current
    const element = ref.current
    if (!v || !base || !content.current || !element) return
    const k = v.zoom / base.zoom
    content.current.style.transform = `translate(${v.x - base.x * k}px, ${v.y - base.y * k}px) scale(${k})`
    content.current.style.willChange = 'transform'
    const s = v.zoom * PX_PER_MM
    const g = gridStep(s)
    element.style.backgroundSize = `${g}px ${g}px`
    element.style.backgroundPosition = `${v.x}px ${v.y}px`
    // Labels stay their usual size while the layer scales
    for (const label of content.current.querySelectorAll<HTMLElement>('[data-note-label], [data-keep-size]')) label.style.transform = k === 1 ? '' : `scale(${1 / k})`
  }
  /** Ends a live pan or zoom: React draws the view for real */
  const commitView = () => {
    clearTimeout(commitTimer.current)
    const v = live.current
    if (v) setView(v)
  }
  /** A jump (zoom buttons, fit, focus) replaces any live view straight away */
  const jumpTo = (v: View) => {
    clearTimeout(commitTimer.current)
    live.current = undefined
    setView(v)
  }
  // Once React has drawn the committed view, the layer goes back to no transform, in the same frame
  useLayoutEffect(() => {
    if (live.current && current && live.current !== current) return
    live.current = undefined
    cancelAnimationFrame(frame.current)
    frame.current = 0
    if (content.current) {
      content.current.style.transform = ''
      content.current.style.willChange = ''
      for (const label of content.current.querySelectorAll<HTMLElement>('[data-note-label], [data-keep-size]')) label.style.transform = ''
    }
    if (ref.current && current) {
      const g = gridStep(current.zoom * PX_PER_MM)
      ref.current.style.backgroundSize = `${g}px ${g}px`
      ref.current.style.backgroundPosition = `${current.x}px ${current.y}px`
    }
  })
  useEffect(() => () => {
    clearTimeout(commitTimer.current)
    cancelAnimationFrame(frame.current)
  }, [])

  const zoomAround = (factor: number, cx: number, cy: number) => {
    const v = viewRef.current
    if (!v) return
    const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM)
    const k = zoom / v.zoom
    jumpTo({ zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k })
  }

  const showViewRef = useRef(showView)
  showViewRef.current = showView

  // Wheel needs a non-passive listener so the page itself never scrolls or zooms
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = viewRef.current
      if (!v) return
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch arrives as ctrl + wheel
        const rect = element.getBoundingClientRect()
        // Mouse wheels send big steps, trackpad pinches small ones; cap each step so neither jumps
        const zoom = clamp(v.zoom * Math.exp(-clamp(e.deltaY, -40, 40) * 0.01), MIN_ZOOM, MAX_ZOOM)
        const k = zoom / v.zoom
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        showViewRef.current({ zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k })
      } else {
        showViewRef.current({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!focus || !size) return
    const note = notes.find((n) => n.id === focus.noteId)
    const v = viewRef.current
    if (!note || !v) return
    const s = v.zoom * PX_PER_MM
    jumpTo({
      zoom: v.zoom,
      x: size.width / 2 - (note.x + note.widthMm / 2) * s,
      y: size.height / 2 - (note.y + note.heightMm / 2) * s,
    })
    // Only when a new focus is requested, not when notes or the size change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.token])

  // Editing windows or placing a layer pauses playback but leaves the view where it is, so you edit at the zoom you chose
  useEffect(() => {
    if (!(editingWindows || placing) || !selected) return
    setTilt({ source: 'slider', target: useTilt.getState().angle, targetX: useTilt.getState().angleX })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingWindows, placing, selectedId])

  // Every way a gesture can end comes through here, so a tilt drag always springs back the same way
  const endGesture = () => {
    const g = gesture.current
    if (g?.mode === 'tilt' && g.moved && useTilt.getState().springBack) springToFlat()
    if (g?.mode === 'pan') commitView()
    gesture.current = null
    setActiveMode(undefined)
    setGuides([])
  }
  const endGestureRef = useRef(endGesture)
  endGestureRef.current = endGesture

  // Switching apps or windows mid-drag can swallow the release
  useEffect(() => {
    const onBlur = () => endGestureRef.current()
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  const noteAt = (target: EventTarget, attribute: 'data-note-label' | 'data-note-body') =>
    (target as HTMLElement).closest(`[${attribute}]`)?.getAttribute(attribute) ?? undefined

  /** A placed layer the pointer is on, on the banknote or its placing box */
  const placedAt = (target: EventTarget) => {
    const layer = (target as HTMLElement).closest('[data-placed]')?.getAttribute('data-placed') ?? undefined
    return isPlaced(layer) ? layer : undefined
  }

  /** Follows the pointer between gestures; the window editor and placing box count as the part they edit */
  const hoverOver = (target: EventTarget) => {
    const element = target as HTMLElement
    const noteId = noteAt(target, 'data-note-label') ?? noteAt(target, 'data-note-body')
    const part: Layer = element.closest('[data-thread], [data-window-editor]') ? 'thread' : placedAt(target) ?? 'note'
    setHover((h) => (!noteId ? undefined : h?.noteId === noteId && h.part === part ? h : { noteId, part }))
  }

  const grid = gridStep(scale)
  // Selection outlines step back while banknotes play or are dragged, so they never get in the way of the motion
  const quiet = source === 'wobble' || activeMode === 'tilt' || activeMode === 'move'

  return (
    <div
      ref={ref}
      className={cn(
        'relative flex-1 touch-none overflow-hidden select-none',
        dropping ? 'bg-muted' : 'bg-muted/40',
        activeMode === 'pan' && 'cursor-grabbing',
        activeMode === 'placed' && 'cursor-move',
      )}
      style={
        current
          ? {
              backgroundImage: 'radial-gradient(circle, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1.2px)',
              backgroundSize: `${grid}px ${grid}px`,
              backgroundPosition: `${current.x}px ${current.y}px`,
            }
          : undefined
      }
      onPointerDown={(e) => {
        const v = viewRef.current
        // Only the left and middle buttons drag; a right-click's menu would swallow the release
        if (!v || e.button > 1) return
        setHover(undefined)
        // A click on the banknote outside the thread's windows (or the placed layer's box) ends editing and tilts as usual
        if (editingWindows && noteAt(e.target, 'data-note-body') === selectedId) onExitWindows?.()
        if (placing && noteAt(e.target, 'data-note-body') === selectedId) onExitPlacing?.()
        // Freeze the fitted view, or moving a note would refit the canvas under the pointer. A live pan or
        // zoom is committed first, so drags measure in the scale on screen.
        if (live.current) commitView()
        else if (!view) setView(v)
        e.currentTarget.setPointerCapture(e.pointerId)
        const labelId = noteAt(e.target, 'data-note-label')
        const bodyId = noteAt(e.target, 'data-note-body')
        const note = notes.find((n) => n.id === (labelId ?? bodyId))
        const onThread = !labelId && (e.target as HTMLElement).closest('[data-thread]') !== null
        const onPlaced = labelId ? undefined : placedAt(e.target)
        const placed = onPlaced && note?.[onPlaced]
        if (e.button === 1 || !note) {
          gesture.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, view: v, onBackground: !note }
        } else if (onThread && e.button === 0) {
          // The thread moves across the banknote, along the axis its position is measured on
          onSelectLayer(note.id, 'thread')
          const rect = (e.target as HTMLElement).closest('[data-note-body]')?.firstElementChild?.getBoundingClientRect()
          const horizontal = note.thread.direction === 'horizontal'
          const alongMm = rect
            ? horizontal
              ? ((e.clientX - rect.left) / rect.width) * note.widthMm
              : ((e.clientY - rect.top) / rect.height) * note.heightMm
            : -1
          gesture.current = { mode: 'thread', noteId: note.id, startX: e.clientX, startY: e.clientY, startPosition: note.thread.positionMm, alongMm }
        } else if (onPlaced && placed && e.button === 0) {
          // The watermark or magnetic ink moves around the banknote, as the thread moves across it. Picking it shows its
          // box, whose corners resize it.
          onSelectLayer(note.id, onPlaced)
          gesture.current = { mode: 'placed', layer: onPlaced, noteId: note.id, startX: e.clientX, startY: e.clientY, original: placed, moved: false }
        } else if (labelId) {
          onSelect(note.id)
          gesture.current = { mode: 'move', noteId: note.id, startX: e.clientX, startY: e.clientY, noteX: note.x, noteY: note.y }
        } else {
          // A press picks another banknote itself; on the selected one only a click does (on release), so tilting it
          // by dragging keeps its layer in the panel
          if (note.id !== selectedId) onSelect(note.id)
          const s = useTilt.getState()
          const start = s.source === 'drag' ? s.target : s.angle
          const startSide = s.source === 'drag' ? s.targetX : s.angleX
          gesture.current = { mode: 'tilt', noteId: note.id, startX: e.clientX, startY: e.clientY, start, startSide, moved: false }
          setTilt({ source: 'drag', target: start, targetX: startSide })
        }
        setActiveMode(gesture.current.mode)
      }}
      onPointerMove={(e) => {
        const g = gesture.current
        if (!g) return hoverOver(e.target)
        // A release that never reached us: stop following the pointer
        if (e.buttons === 0) {
          endGesture()
          return
        }
        const dx = e.clientX - g.startX
        const dy = e.clientY - g.startY
        if (g.mode === 'pan') {
          showView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy })
        } else if (g.mode === 'thread') {
          updateNote(projectId, g.noteId, (n) => {
            const horizontal = n.thread.direction === 'horizontal'
            const across = horizontal ? n.heightMm : n.widthMm
            const half = n.thread.widthMm / 2
            const positionMm = clamp(Math.round((g.startPosition + (horizontal ? dy : dx) / scale) * 2) / 2, half, across - half)
            return positionMm === n.thread.positionMm ? n : { ...n, thread: { ...n.thread, positionMm } }
          })
        } else if (g.mode === 'placed') {
          if (!g.moved && Math.hypot(dx, dy) < 3) return
          g.moved = true
          // From where the press found it, in 0.5 mm steps, kept on the banknote
          const note = notes.find((n) => n.id === g.noteId)
          const box = note?.[g.layer]
          const next = note && moveBox(g.original, dx / scale, dy / scale, note)
          if (box && next && (next.xMm !== box.xMm || next.yMm !== box.yMm)) placeLayer({ projectId, noteId: g.noteId }, g.layer, next)
        } else if (g.mode === 'move') {
          const round = (mm: number) => Math.round(mm * 2) / 2
          const rawX = g.noteX + dx / scale
          const rawY = g.noteY + dy / scale
          const moving = notes.find((n) => n.id === g.noteId)
          // Edges and centres snap to the other banknotes; hold ⌘/Ctrl to place freely on the 0.5 mm grid
          const snapped =
            moving && !(e.metaKey || e.ctrlKey)
              ? snapBox(
                  { x: rawX, y: rawY, width: moving.widthMm, height: moving.heightMm },
                  notes.filter((n) => n.id !== g.noteId).map((n) => ({ x: n.x, y: n.y, width: n.widthMm, height: n.heightMm })),
                  SNAP_PX / scale,
                )
              : undefined
          const x = snapped && snapped.guides.some((d) => d.axis === 'x') ? snapped.x : round(rawX)
          const y = snapped && snapped.guides.some((d) => d.axis === 'y') ? snapped.y : round(rawY)
          setGuides(snapped?.guides ?? [])
          updateNote(projectId, g.noteId, (n) => (n.x === x && n.y === y ? n : { ...n, x, y }))
        } else {
          if (!g.moved && Math.hypot(dx, dy) < 3) return
          g.moved = true
          // About 160 px of drag tilts the note 30°; past one cycle the frames loop. Both directions always
          // tilt, unless locked on the tilt pad.
          const limit = loopLens.viewDeg
          const { lockX, lockY } = useTilt.getState()
          setTilt({
            target: lockY ? g.start : clamp(g.start - (dy * 30) / 160, -limit, limit),
            targetX: lockX ? g.startSide : clamp(g.startSide + (dx * 30) / 160, -limit, limit),
          })
        }
      }}
      onPointerUp={(e) => {
        const g = gesture.current
        // A click on a window, without dragging, opens it for resizing
        if (g?.mode === 'thread' && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 3) {
          const note = notes.find((n) => n.id === g.noteId)
          const section = note?.thread.windows.enabled
            ? note.thread.windows.sections.find((s) => g.alongMm >= s.startMm && g.alongMm <= s.endMm)
            : undefined
          if (note && section) onEditWindow?.(note.id, section.id)
        }
        // A click on a banknote, away from its thread and placed layers and without tilting it, picks the banknote itself
        if (g?.mode === 'tilt' && !g.moved) onSelect(g.noteId)
        // A click on empty canvas, without dragging, clears the selection
        if (g?.mode === 'pan' && g.onBackground && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 3) onSelect(undefined)
        endGesture()
      }}
      onPointerCancel={endGesture}
      onLostPointerCapture={endGesture}
      onPointerLeave={() => setHover(undefined)}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement
        const noteId = noteAt(target, 'data-note-body')
        if (noteId && target.closest('[data-thread], [data-window-editor]')) onEditThread?.(noteId)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDropping(false)
        const noteId = noteAt(e.target, 'data-note-body') ?? noteAt(e.target, 'data-note-label') ?? selectedId
        if (!noteId) return
        // Dropped images become the thread's frames
        onSelectLayer(noteId, 'thread')
        runAction(addImageFrames({ projectId, noteId }, Array.from(e.dataTransfer.files)))
      }}
    >
      {/* Everything drawn in canvas space, so a live pan or zoom can move it as one layer */}
      <div ref={content} className="absolute top-0 left-0 origin-top-left">
      {current &&
        notes.map((note) => {
          const isSelected = note.id === selectedId
          const editingThis = isSelected && editingWindows
          const placingThis = isSelected && placing && note[placing] ? placing : undefined
          // Only what is picked is outlined, the banknote itself or one of its parts; what a click would pick is outlined lightly
          const picked = isSelected ? layer : undefined
          const hovered = hover?.noteId === note.id && hover.part !== picked ? hover.part : undefined
          const ref: NoteRef = { projectId, noteId: note.id }
          // The continuous check shows around an uploaded design while the banknote itself is picked, with the drift it
          // previews. Meanwhile the banknote has no outline, label or shadow, so nothing comes between it and its
          // neighbours (Keller)
          const check = picked === 'note' && note.background === 'image' && note.faceImageId ? note.continuous : undefined
          const drift = check ? driftWithin(drifts[note.id], check.cutMm) : undefined
          return (
            <div
              key={note.id}
              className="absolute"
              style={{ left: current.x + note.x * scale, top: current.y + note.y * scale }}
            >
              {drift && <NeighbourRing note={note} scale={scale} drift={drift} quiet={quiet} />}
              <div
                data-note-label={note.id}
                className={cn(
                  'absolute bottom-full left-0 mb-1.5 flex origin-bottom-left items-baseline gap-1.5 text-xs whitespace-nowrap',
                  'cursor-move',
                  drift && 'invisible',
                )}
              >
                <span className={cn('font-medium', isSelected ? 'text-foreground' : 'text-muted-foreground')}>{note.name}</span>
                <span className="text-muted-foreground/70 tabular-nums">
                  {lengthIn(note.widthMm, unit)} × {lengthIn(note.heightMm, unit)} {unit}
                </span>
              </div>
              <div
                data-note-body={note.id}
                // A short perspective, relative to the note's size, so the near edge visibly widens and the far edge
                // narrows: you can see which way the note is tilting, not just that it got shorter
                style={{ perspective: 2.2 * Math.max(note.widthMm, note.heightMm) * scale, borderRadius: 1.5 * scale }}
                className={cn(
                  'outline-offset-4 transition-[outline-color] duration-150 cursor-ns-resize',
                  drift ? 'outline-0' : picked === 'note' ? 'outline-2' : hovered === 'note' ? 'outline-1' : 'outline-0',
                  quiet ? 'outline-primary/5' : 'outline-primary/25',
                  // NoteView's own shadow would darken the seam
                  drift && '[&>div:first-child]:shadow-none',
                )}
              >
                {/* Editing windows shows the banknote flat with its watermark faint; placing a layer, flat (the watermark clear) */}
                <NoteView note={note} scale={scale} live perspective={perspective && !scrubbing && !editingThis && !placingThis} sheen={sheen}
                  reveal={editingThis ? 0 : placingThis === 'watermark' ? 1 : undefined} showWindowCuts={editingThis} showFrameNumber={frameNumbers} offsetMm={offsets[note.id]}
                  selected={picked === 'note' || editingThis || placingThis || quiet ? undefined : picked} hovered={hovered === 'note' ? undefined : hovered}
                  faceShiftMm={drift && (drift.x || drift.y) ? drift : undefined} />
                {placingThis && (
                  <PlacingBox note={note} layer={placingThis} box={note[placingThis]!} scale={scale} onChange={(next) => placeLayer(ref, placingThis, next)} />
                )}
                {isSelected && editingWindows && note.thread.windows.enabled && (
                  <WindowEditor note={note} scale={scale} selectedId={selectedWindowId} onSelect={onWindowSelect}
                    onChange={(sections) => updateNote(projectId, note.id, (n) => ({ ...n, thread: { ...n.thread, windows: { ...n.thread.windows, sections } } }))} />
                )}
              </div>
              {drift && <EdgeMarks note={note} scale={scale} drift={drift} quiet={quiet} />}
            </div>
          )
        })}

      {current &&
        guides.map((d) => (
          <div
            key={`${d.axis}${d.at}`}
            data-snap-guide={d.axis}
            className="pointer-events-none absolute bg-rose-500"
            style={
              d.axis === 'x'
                ? { left: current.x + d.at * scale - 0.5, top: current.y + d.from * scale, width: 1, height: (d.to - d.from) * scale }
                : { top: current.y + d.at * scale - 0.5, left: current.x + d.from * scale, height: 1, width: (d.to - d.from) * scale }
            }
          />
        ))}
      </div>

      {current && size && (
        // The corner bar, built like Thread Studio's top bar: fixed top right, as wide as the properties panel that
        // opens under it, with the zoom controls, then Export, in the same place whatever is selected.
        // Its own pointer events, or the canvas captures the pointer and the buttons never get a click
        <div className="absolute top-3 right-3 w-(--panel-w)" onPointerDown={(e) => e.stopPropagation()}>
          <Panel className="flex h-11 items-center gap-0.5 pr-1.5 pl-1.5">
            <IconButton className="rounded-lg" label="Zoom out" onClick={() => zoomAround(1 / 1.25, size.width / 2, size.height / 2)}>
              <Minus />
            </IconButton>
            <IconButton className="rounded-lg" label="Zoom in" onClick={() => zoomAround(1.25, size.width / 2, size.height / 2)}>
              <Plus />
            </IconButton>
            <IconButton className="rounded-lg" label="Fit all notes" onClick={() => jumpTo(fitView(notes, size))}>
              <Maximize />
            </IconButton>
            {onExport && (
              <Button size="sm" className="ml-auto" onClick={onExport}>
                <Share />
                Export
              </Button>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
