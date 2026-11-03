import { Maximize, Minus, Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IconButton } from '../components/controls'
import { ThreadArt } from '../components/NoteView'
import { clamp } from '../lib/frames'
import { lensMix } from '../lib/lens'
import {
  drawRect,
  fillGaps,
  moveRect,
  patternMix,
  patternOf,
  placeSection,
  preparePattern,
  resizeEdge,
  updateSection,
  type Edge,
  type PatternPoint,
} from '../lib/pattern'
import { updateNote } from '../lib/store'
import type { Note, ThreadPattern, ThreadSection } from '../lib/types'
import { setTilt, springToFlat, useTilt } from '../tilt/tilt'
import { useElementSize } from './useElementSize'

/** Px per mm the view never goes past, so a short repeat doesn't blow up into a blur */
const MAX_SCALE = 120
/** Room around the strip, px */
const MARGIN = 28
/** How far either side of an edge grabs it, px */
const EDGE_PX = 5

type Rect = Pick<ThreadSection, 'startMm' | 'endMm' | 'acrossStart' | 'acrossEnd'>
type Gesture =
  | { mode: 'draw'; copy: number; from: PatternPoint; moved: boolean; rect?: Rect }
  | { mode: 'move'; id: string; start: ThreadSection; pattern: ThreadPattern; at: { along: number; across: number }; moved: boolean }
  | { mode: 'resize'; id: string; edge: Edge; pattern: ThreadPattern; copy: number }
  | { mode: 'tilt'; startX: number; startY: number; start: number; startSide: number; id?: string; moved: boolean }
  | { mode: 'pan'; startX: number; startY: number; from: View }

/** The view's zoom (1 fits the repeats shown) and how far it is panned from the middle, px */
type View = { zoom: number; x: number; y: number }
const FIT: View = { zoom: 1, x: 0, y: 0 }
const ZOOM_LIMITS = { min: 0.25, max: 8 }

const EDGES: Edge[] = ['startMm', 'endMm', 'acrossStart', 'acrossEnd']
const isAlong = (edge: Edge) => edge === 'startMm' || edge === 'endMm'

/** Two repeats, or three when they still leave the thread wide enough to work on */
function layout(box: { width: number; height: number }, repeatMm: number, widthMm: number, vertical: boolean) {
  const room = { along: (vertical ? box.height : box.width) - 2 * MARGIN, across: (vertical ? box.width : box.height) - 2 * MARGIN }
  const fit = (n: number) => Math.min(MAX_SCALE, room.along / (n * repeatMm), room.across / widthMm)
  const repeats = fit(3) * widthMm >= 140 ? 3 : 2
  // However long the repeat, the thread fits: a cramped view shrinks it rather than spilling over the panels
  return { repeats, scale: Math.max(0.05, fit(repeats)) }
}

/**
 * The centre of the thread editor: the thread magnified over two or three repeats, in its own direction, showing
 * the real artwork at the current tilt, with the repeat's ends, each section's outline and, optionally, its ridges.
 * Drag on empty thread to draw a section (it takes the look of the section beside it, as Fill does, or plays plain
 * when it touches none), drag a section to move it or its edges to resize it (snapping to 0.5 mm along and twelfths
 * across); a click selects, and a double-click on an empty area fills it. Like the canvas, scrolling or dragging
 * around the thread pans, pinching or ⌘/Ctrl-scrolling zooms; with `tiltDrag` a drag on the thread tilts instead
 * of drawing, and with `perspective` the thread turns with the tilt (editing still lands where the pointer is).
 */
export function PatternView({ note, projectId, selectedId, onSelect, ridges, tiltDrag = false, perspective = false, limit = 90 }: {
  note: Note
  projectId: string
  selectedId?: string
  onSelect: (id: string | undefined) => void
  /** Hatch each section at its ridge angle */
  ridges: boolean
  /** A drag on the thread tilts it, as on the canvas, instead of drawing or moving sections */
  tiltDrag?: boolean
  /** The thread turns in perspective with the tilt; off, it plays flat */
  perspective?: boolean
  /** How far a drag may tilt, either way */
  limit?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const size = useElementSize(box)
  const gesture = useRef<Gesture | null>(null)
  const [preview, setPreview] = useState<{ rect: Rect; copy: number }>()
  const [hover, setHover] = useState<string>()
  const uid = useId().replace(/:/g, '')
  const angle = useTilt((s) => s.angle)
  const angleX = useTilt((s) => s.angleX)
  const [viewState, setView] = useState<View>(FIT)
  const viewRef = useRef(viewState)
  useEffect(() => { viewRef.current = viewState })
  const [panning, setPanning] = useState(false)

  // Wheel needs a non-passive listener so the page never scrolls or zooms: scroll pans, pinch or ⌘/Ctrl-scroll zooms
  useEffect(() => {
    const element = box.current
    if (!element) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = viewRef.current
      if (e.ctrlKey || e.metaKey) {
        const r = element.getBoundingClientRect()
        // Mouse wheels send big steps, trackpad pinches small ones; cap each step so neither jumps
        setView(zoomAround(v, Math.exp(-clamp(e.deltaY, -40, 40) * 0.01), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2))
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const { thread } = note
  const vertical = thread.direction === 'vertical'
  const prepared = preparePattern(note)
  const pattern = patternOf(note)
  const repeat = pattern.repeatMm
  const view = size ? layout(size, repeat, thread.widthMm, vertical) : undefined
  if (!view) return <div ref={box} className="absolute inset-0 overflow-hidden" />
  const { repeats } = view
  const scale = view.scale * viewState.zoom
  const lengthMm = repeats * repeat
  const thickness = thread.widthMm * scale
  const length = lengthMm * scale
  const width = vertical ? thickness : length
  const height = vertical ? length : thickness

  // What each section shows now: the view follows the tilt, re-rendering as it moves
  const tilt = { x: angleX, y: angle }
  const mixes = prepared.plain ? [lensMix(note, tilt)] : patternMix(note, tilt)
  const shown = mixes.map((m) => [m.base, m.blend > 0 ? m.next : m.base, m.current])
  const fill = { direction: thread.direction, thicknessPx: thickness, lengthPx: length, gapPx: (thread.imageGapMm ?? 0) * scale }

  /** A rect of copy `k`, in px within the strip */
  const place = (r: Rect, k: number) => {
    const a0 = (k * repeat + r.startMm) * scale, a1 = (k * repeat + r.endMm) * scale
    const c0 = r.acrossStart * thickness, c1 = r.acrossEnd * thickness
    return vertical ? { x: c0, y: a0, width: c1 - c0, height: a1 - a0 } : { x: a0, y: c0, width: a1 - a0, height: c1 - c0 }
  }
  // Turned in perspective, the thread is a plane seen at an angle: a point on screen is traced back onto it, so
  // drawing and moving land under the pointer at any tilt
  const turned = perspective && (angle !== 0 || angleX !== 0)
  const depth = 2.2 * Math.max(width, height)
  const locate = (e: { clientX: number; clientY: number }) => {
    // The untilted box: the strip's parent, the same size and never turned
    const r = (strip.current!.parentElement ?? strip.current!).getBoundingClientRect()
    let px = e.clientX - r.left, py = e.clientY - r.top
    if (turned) [px, py] = unproject(px - width / 2, py - height / 2, angle, angleX, depth).map((v, i) => v + (i ? height : width) / 2)
    return { along: (vertical ? py : px) / scale, across: (vertical ? px : py) / thickness }
  }
  const copyOf = (along: number) => clamp(Math.floor(along / repeat), 0, repeats - 1)
  const write = (next: ThreadPattern) => updateNote(projectId, note.id, (n) => ({ ...n, pattern: next }))
  const sameRect = (a: Rect, b: Rect) => a.startMm === b.startMm && a.endMm === b.endMm && a.acrossStart === b.acrossStart && a.acrossEnd === b.acrossEnd
  const alongCursor = vertical ? 'cursor-ns-resize' : 'cursor-ew-resize'
  const acrossCursor = vertical ? 'cursor-ew-resize' : 'cursor-ns-resize'

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    // A field being typed in lets go, so Delete and Escape reach the sections
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest('input, textarea')) document.activeElement.blur()
    const at = locate(e)
    const target = e.target as HTMLElement
    const handle = target.closest<HTMLElement>('[data-edge]')
    const body = target.closest<HTMLElement>('[data-section-id]')
    const section = pattern.sections.find((s) => s.id === body?.dataset.sectionId)
    if (tiltDrag) {
      // As on the canvas: from where the tilt is heading, springing back on release unless the pad holds it
      const s = useTilt.getState()
      const start = s.source === 'drag' ? s.target : s.angle
      const startSide = s.source === 'drag' ? s.targetX : s.angleX
      gesture.current = { mode: 'tilt', startX: e.clientX, startY: e.clientY, start, startSide, id: section?.id, moved: false }
      setTilt({ source: 'drag', target: start, targetX: startSide })
    } else if (section && handle) {
      onSelect(section.id)
      gesture.current = { mode: 'resize', id: section.id, edge: handle.dataset.edge as Edge, pattern, copy: Number(body?.dataset.copy ?? 0) }
    } else if (section) {
      onSelect(section.id)
      gesture.current = { mode: 'move', id: section.id, start: section, pattern, at, moved: false }
    } else {
      const copy = copyOf(at.along)
      gesture.current = { mode: 'draw', copy, from: { along: clamp(at.along - copy * repeat, 0, repeat), across: clamp(at.across, 0, 1) }, moved: false }
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g) return
    if (e.buttons === 0) return end()
    if (g.mode === 'pan') return setView({ ...g.from, x: g.from.x + e.clientX - g.startX, y: g.from.y + e.clientY - g.startY })
    if (g.mode === 'tilt') {
      const dx = e.clientX - g.startX, dy = e.clientY - g.startY
      if (!g.moved && Math.hypot(dx, dy) < 3) return
      g.moved = true
      // About 160 px of drag tilts 30°, as on the canvas, unless an axis is locked on the tilt pad
      const { lockX, lockY } = useTilt.getState()
      setTilt({
        target: lockY ? g.start : clamp(g.start - (dy * 30) / 160, -limit, limit),
        targetX: lockX ? g.startSide : clamp(g.startSide + (dx * 30) / 160, -limit, limit),
      })
      return
    }
    const at = locate(e)
    if (g.mode === 'draw') {
      const to = { along: clamp(at.along - g.copy * repeat, 0, repeat), across: clamp(at.across, 0, 1) }
      g.moved ||= Math.hypot((to.along - g.from.along) * scale, (to.across - g.from.across) * thickness) > 3
      const rect = g.moved ? drawRect(pattern, g.from, to) : undefined
      // Kept on the gesture too: a quick release can come before the preview has rendered
      g.rect = rect
      setPreview(rect && { rect, copy: g.copy })
    } else if (g.mode === 'move') {
      const by = { along: at.along - g.at.along, across: at.across - g.at.across }
      g.moved ||= Math.hypot(by.along * scale, by.across * thickness) > 3
      if (!g.moved) return
      const rect = moveRect(g.pattern, g.start, by)
      const now = pattern.sections.find((s) => s.id === g.id)
      if (now && !sameRect(now, rect)) write(updateSection(g.pattern, g.id, rect))
    } else {
      const value = isAlong(g.edge) ? at.along - g.copy * repeat : at.across
      const next = resizeEdge(g.pattern, g.id, g.edge, value)
      const was = pattern.sections.find((s) => s.id === g.id), now = next.sections.find((s) => s.id === g.id)
      if (was && now && (!sameRect(was, now) || next.sections.some((s, i) => !sameRect(s, pattern.sections[i] ?? s)))) write(next)
    }
  }
  const end = () => {
    const g = gesture.current
    gesture.current = null
    setPanning(false)
    if (g?.mode === 'tilt') {
      // A click without tilting still selects what it lands on
      if (g.moved && useTilt.getState().springBack) springToFlat()
      else if (!g.moved) onSelect(g.id)
      return
    }
    if (g?.mode !== 'draw') return
    setPreview(undefined)
    const rect = g.rect
    if (rect) {
      const added = placeSection(pattern, rect, thread.widthMm)
      write(added.pattern)
      onSelect(added.id)
    } else if (!g.moved) {
      onSelect(undefined)
    }
  }

  // A section deleted or undone away under the pointer never sees it leave
  const hovered = pattern.sections.some((s) => s.id === hover)

  // A double-click on empty thread fills that whole gap, as Fill does: the section in line with it runs on, or new ones take its look
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tiltDrag || (e.target as HTMLElement).closest('[data-section-id]')) return
    const at = locate(e)
    const copy = copyOf(at.along)
    const filled = fillGaps(pattern, thread.widthMm, { along: clamp(at.along - copy * repeat, 0, repeat), across: clamp(at.across, 0, 1) })
    if (!filled) return
    write(filled.pattern)
    onSelect(filled.id)
  }

  return (
    <div ref={box} className={cn('absolute inset-0 flex touch-none items-center justify-center overflow-hidden', panning ? 'cursor-grabbing' : 'cursor-grab')}
      onPointerDown={(e) => {
        // Around the thread, a drag pans the view
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        gesture.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, from: viewState }
        setPanning(true)
      }}
      onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      onDoubleClick={(e) => { if (e.target === e.currentTarget) setView(FIT) }}>
      <div className="relative shrink-0" style={{ width, height, transform: `translate(${viewState.x}px, ${viewState.y}px)`, perspective: depth }}>
      <div
        ref={strip}
        role="group"
        aria-label="Thread pattern"
        data-pattern-view=""
        className={cn('relative touch-none shadow-sm select-none', tiltDrag ? 'cursor-grab' : preview || !hovered ? 'cursor-crosshair' : 'cursor-move')}
        style={{ width, height, transform: turned ? `rotateX(${angle}deg) rotateY(${angleX}deg)` : undefined }}
        // Moves and releases bubble up to the view's own handlers
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: thread.backgroundColor, ...EMPTY }}>
          <ThreadArt note={note} shown={shown} blends={mixes.map((m) => m.blend)} fill={fill} lengthMm={lengthMm} scale={scale} />
        </div>

        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height} aria-hidden>
          <defs>
            {prepared.sections.map((p, i) => (
              <pattern key={p.section.id} id={`${uid}-${i}`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform={`rotate(${p.angle})`}>
                <line x1="0" y1="5" x2="9" y2="5" stroke="black" strokeOpacity="0.35" strokeWidth="1" />
                <line x1="0" y1="4" x2="9" y2="4" stroke="white" strokeOpacity="0.75" strokeWidth="1" />
              </pattern>
            ))}
          </defs>
          {ridges && Array.from({ length: repeats }, (_, k) => prepared.sections.map((p, i) => (
            <rect key={`ridges-${k}-${p.section.id}`} {...place(p.section, k)} fill={`url(#${uid}-${i})`} />
          )))}
          {Array.from({ length: repeats - 1 }, (_, k) => {
            const at = (k + 1) * repeat * scale
            return <line key={`repeat-${k}`} data-repeat-edge="" {...(vertical ? { x1: -8, x2: width + 8, y1: at, y2: at } : { x1: at, x2: at, y1: -8, y2: height + 8 })}
              className="stroke-fuchsia-500" strokeWidth="1" strokeDasharray="4 3" />
          })}
          {Array.from({ length: repeats }, (_, k) => pattern.sections.map((s) => {
            const on = s.id === selectedId
            const r = place(s, k)
            return (
              <g key={`outline-${k}-${s.id}`}>
                <rect {...r} fill="none" stroke="black" strokeOpacity={on ? 0 : 0.4} strokeWidth="2.5" />
                <rect {...r} fill="none" className={on ? 'stroke-primary' : 'stroke-white'} strokeOpacity={on || s.id === hover ? 1 : 0.8} strokeWidth={on ? 2.5 : 1} />
              </g>
            )
          }))}
          {preview && <rect {...place(preview.rect, preview.copy)} fill="none" className="stroke-primary" strokeWidth="2" strokeDasharray="5 3" />}
        </svg>

        {Array.from({ length: repeats }, (_, k) => pattern.sections.map((s) => {
          const r = place(s, k)
          return (
            <div key={`hit-${k}-${s.id}`} data-section-id={s.id} data-copy={k} title={s.name} className="absolute"
              style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
              onPointerEnter={() => setHover(s.id)} onPointerLeave={() => setHover((h) => (h === s.id ? undefined : h))}>
              {EDGES.map((edge) => <div key={edge} data-edge={edge} className={cn('absolute', isAlong(edge) ? alongCursor : acrossCursor)} style={edgeStyle(edge, vertical)} />)}
            </div>
          )
        }))}
      </div>
      </div>

      {/* Zoom, as on the canvas; its own pointer events, so a click never starts a pan */}
      <div className="absolute top-3 right-3 flex items-center gap-0.5 rounded-lg border border-border/70 bg-background p-0.5 shadow-panel [&>[data-slot=button]]:rounded-[calc(var(--radius)-3px)]"
        onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <IconButton label="Zoom out" onClick={() => setView((v) => zoomAround(v, 1 / 1.25, 0, 0))}><Minus /></IconButton>
        <Button variant="ghost" size="sm" className="w-14 tabular-nums" title="Zoom to fit the repeats shown" onClick={() => setView(FIT)}>
          {`${Math.round(viewState.zoom * 100)}%`}
        </Button>
        <IconButton label="Zoom in" onClick={() => setView((v) => zoomAround(v, 1.25, 0, 0))}><Plus /></IconButton>
        <IconButton label="Fit" onClick={() => setView(FIT)}><Maximize /></IconButton>
      </div>
    </div>
  )
}

/** The view zoomed by `factor` about a point given from the middle of the view, px, which stays put */
function zoomAround(v: View, factor: number, cx: number, cy: number): View {
  const zoom = clamp(v.zoom * factor, ZOOM_LIMITS.min, ZOOM_LIMITS.max)
  const k = zoom / v.zoom
  return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
}

/**
 * Where a point on screen (px from the middle of the untilted strip) lies on the strip turned by
 * `rotateX(angle) rotateY(angleX)` under `perspective: depth`, px from its middle: the CSS projection run backwards.
 * On the plane z = 0 that projection is a 3 × 3 homography, so it inverts exactly.
 */
function unproject(sx: number, sy: number, angle: number, angleX: number, depth: number): [number, number] {
  const a = (angle * Math.PI) / 180, b = (angleX * Math.PI) / 180
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b)
  // rotateX · rotateY on (x, y, 0): x' = cb x, y' = sa sb x + ca y, z' = -ca sb x + sa y; then w = 1 - z' / depth
  const h = [cb, 0, 0, sa * sb, ca, 0, (ca * sb) / depth, -sa / depth, 1]
  const [x, y, w] = solve3(h, [sx, sy, 1])
  return [x / w, y / w]
}

/** `m` (3 × 3, rows) inverted, times `v` */
function solve3(m: number[], v: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C
  const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((x) => x / det)
  return [0, 1, 2].map((r) => inv[r * 3] * v[0] + inv[r * 3 + 1] * v[1] + inv[r * 3 + 2] * v[2])
}

/** Empty thread (no section prints there) as a faint check */
const EMPTY: CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(color-mix(in oklab, var(--foreground) 9%, transparent) 0% 25%, transparent 0% 50%)',
  backgroundSize: '12px 12px',
}

/** A grab strip over one edge of a section's area, half inside it and half out */
function edgeStyle(edge: Edge, vertical: boolean): CSSProperties {
  const along = isAlong(edge)
  const end = edge === 'endMm' || edge === 'acrossEnd'
  // Along edges run across the thread: horizontal lines on a vertical thread
  const horizontalLine = along === vertical
  const offset = -EDGE_PX
  if (horizontalLine) return { left: 0, right: 0, height: 2 * EDGE_PX, ...(end ? { bottom: offset } : { top: offset }) }
  return { top: 0, bottom: 0, width: 2 * EDGE_PX, ...(end ? { right: offset } : { left: offset }) }
}
