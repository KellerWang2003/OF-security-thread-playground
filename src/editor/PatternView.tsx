import { useId, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { ThreadArt } from '../components/NoteView'
import { clamp } from '../lib/frames'
import { lensMix } from '../lib/lens'
import {
  addSection,
  drawRect,
  moveRect,
  patternMix,
  patternOf,
  preparePattern,
  resizeEdge,
  updateSection,
  type Edge,
  type PatternPoint,
} from '../lib/pattern'
import { updateNote } from '../lib/store'
import type { Note, ThreadPattern, ThreadSection } from '../lib/types'
import { useTilt } from '../tilt/tilt'
import { useElementSize } from './useElementSize'

/** Px per mm the view never goes past, so a short repeat doesn't blow up into a blur */
const MAX_SCALE = 120
/** Room around the strip, px */
const MARGIN = 28
/** How far either side of an edge grabs it, px */
const EDGE_PX = 5

type Rect = Pick<ThreadSection, 'startMm' | 'endMm' | 'acrossStart' | 'acrossEnd'>
type Gesture =
  | { mode: 'draw'; copy: number; from: PatternPoint; moved: boolean }
  | { mode: 'move'; id: string; start: ThreadSection; pattern: ThreadPattern; at: { along: number; across: number }; moved: boolean }
  | { mode: 'resize'; id: string; edge: Edge; pattern: ThreadPattern; copy: number }

const EDGES: Edge[] = ['startMm', 'endMm', 'acrossStart', 'acrossEnd']
const isAlong = (edge: Edge) => edge === 'startMm' || edge === 'endMm'

/** Two repeats, or three when they still leave the thread wide enough to work on */
function layout(box: { width: number; height: number }, repeatMm: number, widthMm: number, vertical: boolean) {
  const room = { along: (vertical ? box.height : box.width) - 2 * MARGIN, across: (vertical ? box.width : box.height) - 2 * MARGIN }
  const fit = (n: number) => Math.min(MAX_SCALE, room.along / (n * repeatMm), room.across / widthMm)
  const repeats = fit(3) * widthMm >= 140 ? 3 : 2
  return { repeats, scale: Math.max(1, fit(repeats)) }
}

/**
 * The centre of the thread editor: the thread magnified over two or three repeats, in its own direction, showing
 * the real artwork at the current tilt, with the repeat's ends, each section's outline and, optionally, its ridges.
 * Drag on empty thread to draw a section, drag a section to move it or its edges to resize it (snapping to 0.5 mm
 * along and twelfths across); a click selects.
 */
export function PatternView({ note, projectId, selectedId, onSelect, ridges }: {
  note: Note
  projectId: string
  selectedId?: string
  onSelect: (id: string | undefined) => void
  /** Hatch each section at its ridge angle */
  ridges: boolean
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

  const { thread } = note
  const vertical = thread.direction === 'vertical'
  const prepared = preparePattern(note)
  const pattern = patternOf(note)
  const repeat = pattern.repeatMm
  const view = size ? layout(size, repeat, thread.widthMm, vertical) : undefined
  if (!view) return <div ref={box} className="absolute inset-0" />
  const { repeats, scale } = view
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
  const locate = (e: React.PointerEvent) => {
    const r = strip.current!.getBoundingClientRect()
    const px = e.clientX - r.left, py = e.clientY - r.top
    return { along: (vertical ? py : px) / scale, across: (vertical ? px : py) / thickness }
  }
  const copyOf = (along: number) => clamp(Math.floor(along / repeat), 0, repeats - 1)
  const write = (next: ThreadPattern) => updateNote(projectId, note.id, (n) => ({ ...n, pattern: next }))
  const sameRect = (a: Rect, b: Rect) => a.startMm === b.startMm && a.endMm === b.endMm && a.acrossStart === b.acrossStart && a.acrossEnd === b.acrossEnd
  const alongCursor = vertical ? 'cursor-ns-resize' : 'cursor-ew-resize'
  const acrossCursor = vertical ? 'cursor-ew-resize' : 'cursor-ns-resize'

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const at = locate(e)
    const target = e.target as HTMLElement
    const handle = target.closest<HTMLElement>('[data-edge]')
    const body = target.closest<HTMLElement>('[data-section-id]')
    const section = pattern.sections.find((s) => s.id === body?.dataset.sectionId)
    if (section && handle) {
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
    const at = locate(e)
    if (g.mode === 'draw') {
      const to = { along: clamp(at.along - g.copy * repeat, 0, repeat), across: clamp(at.across, 0, 1) }
      g.moved ||= Math.hypot((to.along - g.from.along) * scale, (to.across - g.from.across) * thickness) > 3
      const rect = g.moved ? drawRect(pattern, g.from, to) : undefined
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
    if (g?.mode !== 'draw') return
    setPreview(undefined)
    const rect = preview?.rect
    if (rect) {
      const added = addSection(pattern, rect)
      write(added.pattern)
      onSelect(added.id)
    } else if (!g.moved) {
      onSelect(undefined)
    }
  }

  return (
    <div ref={box} className="absolute inset-0 flex items-center justify-center">
      <div
        ref={strip}
        role="group"
        aria-label="Thread pattern"
        data-pattern-view=""
        className={cn('relative touch-none shadow-sm select-none', preview || !hover ? 'cursor-crosshair' : 'cursor-move')}
        style={{ width, height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: thread.backgroundColor, ...EMPTY }}>
          <ThreadArt note={note} shown={shown} blends={mixes.map((m) => m.blend)} fill={fill} lengthMm={lengthMm} scale={scale} />
        </div>

        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height} aria-hidden>
          <defs>
            {prepared.sections.map((p, i) => (
              <pattern key={p.section.id} id={`${uid}-${i}`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform={`rotate(${-p.angle})`}>
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
  )
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
