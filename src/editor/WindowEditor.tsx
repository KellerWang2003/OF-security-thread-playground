import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { clamp } from '../lib/frames'
import { sectionBounds, snapWindow, threadLength, WINDOW_STEP } from '../lib/thread'
import type { Note, ThreadWindow } from '../lib/types'

type Gesture = {
  mode: 'draw' | 'move' | 'start' | 'end'
  id: string
  anchor: number
  min: number
  max: number
  original: ThreadWindow[]
  section?: ThreadWindow
}

/** Canvas-only editing surface; it intercepts gestures before the banknote can tilt or pan. */
export function WindowEditor({ note, scale, selectedId, onSelect, onChange }: {
  note: Note
  scale: number
  selectedId?: string
  onSelect: (id: string | undefined) => void
  onChange: (sections: ThreadWindow[]) => void
}) {
  const gesture = useRef<Gesture | null>(null)
  const horizontal = note.thread.direction === 'horizontal'
  const length = threadLength(note)
  const sections = note.thread.windows.sections
  const resizeCursor = horizontal ? 'cursor-ew-resize' : 'cursor-ns-resize'
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return clamp(snapWindow((horizontal ? event.clientX - rect.left : event.clientY - rect.top) / scale), 0, length)
  }
  const finish = (event: React.PointerEvent<HTMLDivElement>, cancel = false) => {
    if (!gesture.current) return
    event.stopPropagation()
    if (cancel) onChange(gesture.current.original)
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label="Edit thread windows"
      data-window-editor
      className="absolute touch-none cursor-crosshair outline-1 outline-fuchsia-500/50"
      style={horizontal
        ? { left: 0, top: (note.thread.positionMm - note.thread.widthMm / 2) * scale, width: length * scale, height: note.thread.widthMm * scale }
        : { top: 0, left: (note.thread.positionMm - note.thread.widthMm / 2) * scale, height: length * scale, width: note.thread.widthMm * scale }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        event.currentTarget.setPointerCapture(event.pointerId)
        const anchor = point(event)
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-section-id]')
        const section = sections.find((s) => s.id === target?.dataset.sectionId)
        if (section) {
          const bounds = sectionBounds(sections, section.id, length)
          gesture.current = { mode: (target?.dataset.edge as 'start' | 'end' | undefined) ?? 'move', id: section.id, anchor, original: sections, section, ...bounds }
          onSelect(section.id)
        } else {
          const min = Math.max(0, ...sections.filter((s) => s.endMm <= anchor).map((s) => s.endMm))
          const max = Math.min(length, ...sections.filter((s) => s.startMm >= anchor).map((s) => s.startMm))
          const id = crypto.randomUUID()
          gesture.current = { mode: 'draw', id, anchor, min, max, original: sections }
          onSelect(undefined)
        }
      }}
      onPointerMove={(event) => {
        const g = gesture.current
        if (!g) return
        event.stopPropagation()
        const at = point(event)
        let section: ThreadWindow
        if (g.mode === 'draw') {
          const other = clamp(at, g.min, g.max)
          if (Math.abs(other - g.anchor) < WINDOW_STEP) {
            onChange(g.original)
            onSelect(undefined)
            return
          }
          section = { id: g.id, startMm: Math.min(g.anchor, other), endMm: Math.max(g.anchor, other) }
          onChange([...g.original, section].sort((a, b) => a.startMm - b.startMm))
          onSelect(g.id)
          return
        }
        const original = g.section!
        const minimum = Math.min(WINDOW_STEP, original.endMm - original.startMm)
        if (g.mode === 'move') {
          const delta = clamp(at - g.anchor, g.min - original.startMm, g.max - original.endMm)
          section = { ...original, startMm: original.startMm + delta, endMm: original.endMm + delta }
        } else if (g.mode === 'start') {
          section = { ...original, startMm: clamp(at, g.min, original.endMm - minimum) }
        } else {
          section = { ...original, endMm: clamp(at, original.startMm + minimum, g.max) }
        }
        onChange(g.original.map((s) => s.id === g.id ? section : s))
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
    >
      {sections.map((section, i) => {
        const selected = section.id === selectedId
        return (
          <div key={section.id} className="absolute" style={horizontal
            ? { left: section.startMm * scale, width: (section.endMm - section.startMm) * scale, top: 0, bottom: 0 }
            : { top: section.startMm * scale, height: (section.endMm - section.startMm) * scale, left: 0, right: 0 }}>
            <Button variant="ghost" data-section-id={section.id} aria-label={`Window ${i + 1}`} aria-pressed={selected}
              className={cn('absolute inset-0 h-full w-full cursor-move rounded-none border border-fuchsia-500 p-0 hover:bg-fuchsia-500/10 active:translate-y-0', selected && 'ring-2 ring-fuchsia-500/40')}
              onClick={() => onSelect(section.id)} />
            {selected && (['start', 'end'] as const).map((edge) => (
              <Button key={edge} variant="outline" size="icon-xs" data-section-id={section.id} data-edge={edge}
                aria-label={`${edge === 'start' ? 'Start' : 'End'} of window ${i + 1}`}
                className={cn('absolute z-10 rounded-sm border-fuchsia-500 p-0 active:translate-y-0', resizeCursor)}
                style={horizontal
                  ? { width: 8, height: 24, top: '50%', [edge === 'start' ? 'left' : 'right']: 0, transform: `translate(${edge === 'start' ? '-50%' : '50%'}, -50%)` }
                  : { height: 8, width: 24, left: '50%', [edge === 'start' ? 'top' : 'bottom']: 0, transform: `translate(-50%, ${edge === 'start' ? '-50%' : '50%'})` }} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
