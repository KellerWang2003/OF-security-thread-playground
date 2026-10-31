import { Maximize, Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IconButton } from '../components/controls'
import { NoteView } from '../components/NoteView'
import { clamp, formatDeg } from '../lib/frames'
import { updateNote } from '../lib/store'
import type { Note } from '../lib/types'
import { setTilt, useTilt, useTiltLoop } from '../tilt/tilt'
import { addImageFrames } from './frameActions'
import { useElementSize } from './useElementSize'

/** CSS pixels per millimetre at 100% zoom, so 100% is roughly true size */
const PX_PER_MM = 96 / 25.4
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const FIT_PADDING = 72

/** Zoom level and where the canvas origin (0, 0 mm) sits on screen, in px */
interface View {
  zoom: number
  x: number
  y: number
}

type Gesture =
  | { mode: 'pan'; startX: number; startY: number; view: View }
  | { mode: 'move'; noteId: string; startX: number; startY: number; noteX: number; noteY: number }
  | { mode: 'tilt'; startX: number; startY: number; start: number; axis: Note['tilt']['axis']; range: number }

function fitView(notes: Note[], size: { width: number; height: number }): View {
  const minX = Math.min(...notes.map((n) => n.x))
  const minY = Math.min(...notes.map((n) => n.y))
  const maxX = Math.max(...notes.map((n) => n.x + n.widthMm))
  const maxY = Math.max(...notes.map((n) => n.y + n.heightMm))
  const zoom = clamp(
    Math.min(
      (size.width - 2 * FIT_PADDING) / ((maxX - minX) * PX_PER_MM),
      (size.height - 2 * FIT_PADDING) / ((maxY - minY) * PX_PER_MM),
    ),
    MIN_ZOOM,
    MAX_ZOOM,
  )
  const scale = zoom * PX_PER_MM
  return {
    zoom,
    x: size.width / 2 - ((minX + maxX) / 2) * scale,
    // A little lower than centre, to leave room for the labels above the notes
    y: size.height / 2 - ((minY + maxY) / 2) * scale + 10,
  }
}

/**
 * Every note of the project on one zoomable canvas. Scroll or drag the background to pan, pinch or
 * ⌘/Ctrl-scroll to zoom, drag a note's label to move it and drag the note itself to tilt.
 */
export function Canvas({
  projectId,
  notes,
  selectedId,
  onSelect,
  focus,
}: {
  projectId: string
  notes: Note[]
  selectedId: string | undefined
  onSelect: (noteId: string) => void
  /** Centres the canvas on a note whenever the token changes */
  focus?: { noteId: string; token: number }
}) {
  const ref = useRef<HTMLDivElement>(null)
  const size = useElementSize(ref)
  const [view, setView] = useState<View>()
  const gesture = useRef<Gesture | null>(null)
  const [activeMode, setActiveMode] = useState<Gesture['mode']>()
  const [spaceDown, setSpaceDown] = useState(false)
  const [dropping, setDropping] = useState(false)
  const { angle, source, perspective, sheen } = useTilt()

  const selected = notes.find((n) => n.id === selectedId)
  useTiltLoop(selected?.tilt.rangeDeg ?? 30)

  // Until the first pan or zoom, the view simply fits every note
  const current = view ?? (size && notes.length ? fitView(notes, size) : undefined)
  const viewRef = useRef(current)
  viewRef.current = current
  const scale = current ? current.zoom * PX_PER_MM : 0

  const zoomAround = (factor: number, cx: number, cy: number) => {
    const v = viewRef.current
    if (!v) return
    const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM)
    const k = zoom / v.zoom
    setView({ zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k })
  }

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
        setView({ zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k })
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  // Holding space turns any drag into a pan, as in design tools
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        e.preventDefault()
        setSpaceDown(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    if (!focus || !size) return
    const note = notes.find((n) => n.id === focus.noteId)
    const v = viewRef.current
    if (!note || !v) return
    const s = v.zoom * PX_PER_MM
    setView({
      zoom: v.zoom,
      x: size.width / 2 - (note.x + note.widthMm / 2) * s,
      y: size.height / 2 - (note.y + note.heightMm / 2) * s,
    })
    // Only when a new focus is requested, not when notes or the size change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.token])

  const noteAt = (target: EventTarget, attribute: 'data-note-label' | 'data-note-body') =>
    (target as HTMLElement).closest(`[${attribute}]`)?.getAttribute(attribute) ?? undefined

  const grid = scale * (scale * 10 < 12 ? 50 : 10)

  return (
    <div
      ref={ref}
      className={cn(
        'relative flex-1 touch-none overflow-hidden select-none',
        dropping ? 'bg-muted' : 'bg-muted/40',
        spaceDown || activeMode === 'pan' ? (activeMode === 'pan' ? 'cursor-grabbing' : 'cursor-grab') : '',
      )}
      style={
        current
          ? {
              backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1.2px)',
              backgroundSize: `${grid}px ${grid}px`,
              backgroundPosition: `${current.x}px ${current.y}px`,
            }
          : undefined
      }
      onPointerDown={(e) => {
        const v = viewRef.current
        if (!v) return
        // Freeze the fitted view, or moving a note would refit the canvas under the pointer
        if (!view) setView(v)
        e.currentTarget.setPointerCapture(e.pointerId)
        const labelId = noteAt(e.target, 'data-note-label')
        const bodyId = noteAt(e.target, 'data-note-body')
        const note = notes.find((n) => n.id === (labelId ?? bodyId))
        if (spaceDown || e.button === 1 || !note) {
          gesture.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, view: v }
        } else if (labelId) {
          onSelect(note.id)
          gesture.current = { mode: 'move', noteId: note.id, startX: e.clientX, startY: e.clientY, noteX: note.x, noteY: note.y }
        } else {
          onSelect(note.id)
          const s = useTilt.getState()
          const start = s.source === 'drag' ? s.target : s.angle
          gesture.current = {
            mode: 'tilt',
            startX: e.clientX,
            startY: e.clientY,
            start,
            axis: note.tilt.axis,
            range: note.tilt.rangeDeg,
          }
          setTilt({ source: 'drag', target: start })
        }
        setActiveMode(gesture.current.mode)
      }}
      onPointerMove={(e) => {
        const g = gesture.current
        if (!g) return
        const dx = e.clientX - g.startX
        const dy = e.clientY - g.startY
        if (g.mode === 'pan') {
          setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy })
        } else if (g.mode === 'move') {
          const snap = (mm: number) => Math.round(mm * 2) / 2
          updateNote(projectId, g.noteId, (n) => ({ ...n, x: snap(g.noteX + dx / scale), y: snap(g.noteY + dy / scale) }))
        } else {
          // About 160 px of drag sweeps half the range
          const delta = g.axis === 'vertical' ? -dy : dx
          setTilt({ target: clamp(g.start + (delta * g.range) / 160, -g.range, g.range) })
        }
      }}
      onPointerUp={() => {
        if (gesture.current?.mode === 'tilt' && useTilt.getState().springBack) setTilt({ target: 0 })
        gesture.current = null
        setActiveMode(undefined)
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
        onSelect(noteId)
        void addImageFrames({ projectId, noteId }, Array.from(e.dataTransfer.files))
      }}
    >
      {current &&
        notes.map((note) => {
          const isSelected = note.id === selectedId
          return (
            <div
              key={note.id}
              className="absolute"
              style={{ left: current.x + note.x * scale, top: current.y + note.y * scale, perspective: 1600 }}
            >
              <div
                data-note-label={note.id}
                className={cn(
                  'absolute bottom-full left-0 mb-1.5 flex items-baseline gap-1.5 text-xs whitespace-nowrap',
                  !spaceDown && 'cursor-move',
                )}
              >
                <span className={cn('font-medium', isSelected ? 'text-foreground' : 'text-muted-foreground')}>{note.name}</span>
                <span className="text-muted-foreground/70 tabular-nums">
                  {note.widthMm} × {note.heightMm} mm
                </span>
              </div>
              <div
                data-note-body={note.id}
                className={cn(
                  'rounded-[2px] outline-offset-4',
                  isSelected ? 'outline-2 outline-primary/50' : 'outline-0',
                  !spaceDown && (note.tilt.axis === 'vertical' ? 'cursor-ns-resize' : 'cursor-ew-resize'),
                )}
              >
                <NoteView note={note} scale={scale} angle={angle} perspective={perspective} sheen={sheen} />
              </div>
            </div>
          )
        })}

      <div className="pointer-events-none absolute top-3 left-4 flex items-baseline gap-2 text-xs text-muted-foreground">
        <span className="w-12 text-lg font-medium text-foreground tabular-nums">{formatDeg(angle)}</span>
        <span>{source === 'wobble' ? 'Auto-wobble' : source === 'slider' ? 'Slider' : 'Drag a note to tilt'}</span>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-4 text-xs text-muted-foreground/80">
        Scroll or space-drag to pan · pinch or ⌘-scroll to zoom · drag a label to move · drop images on a note
      </div>

      {current && size && (
        <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg border bg-background p-0.5 shadow-sm">
          <IconButton label="Zoom out" onClick={() => zoomAround(1 / 1.25, size.width / 2, size.height / 2)}>
            <Minus />
          </IconButton>
          <Button
            variant="ghost"
            size="sm"
            className="w-14 tabular-nums"
            title="Zoom to 100% (about true size)"
            onClick={() => zoomAround(1 / current.zoom, size.width / 2, size.height / 2)}
          >
            {Math.round(current.zoom * 100)}%
          </Button>
          <IconButton label="Zoom in" onClick={() => zoomAround(1.25, size.width / 2, size.height / 2)}>
            <Plus />
          </IconButton>
          <IconButton label="Fit all notes" onClick={() => setView(fitView(notes, size))}>
            <Maximize />
          </IconButton>
        </div>
      )}
    </div>
  )
}
