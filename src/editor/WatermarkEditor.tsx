import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Note, Watermark } from '../lib/types'
import { WATERMARK_STEP, dragWatermarkCorner, moveWatermark } from '../lib/watermark'

type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']
const CORNER_NAMES: Record<Corner, string> = { nw: 'top-left', ne: 'top-right', sw: 'bottom-left', se: 'bottom-right' }

type Gesture = { mode: 'move' | Corner; startX: number; startY: number; original: Watermark }
/** Arrow keys nudge one step (ten with Shift) */
const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/**
 * Canvas-only placing surface over a flat, backlit banknote: drag the dashed box to move the watermark, a corner to
 * resize it with its proportions kept, in 0.5 mm steps; arrow keys nudge it. It takes its gestures before the
 * banknote can tilt or pan.
 */
export function WatermarkEditor({ note, watermark, scale, onChange }: {
  note: Note
  watermark: Watermark
  scale: number
  onChange: (watermark: Watermark) => void
}) {
  const gesture = useRef<Gesture | null>(null)
  const finish = (event: React.PointerEvent<HTMLDivElement>, cancel = false) => {
    const g = gesture.current
    if (!g) return
    event.stopPropagation()
    if (cancel) onChange(g.original)
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label="Place watermark"
      data-watermark-editor=""
      className="absolute touch-none cursor-move outline-1 outline-fuchsia-500 outline-dashed focus-visible:outline-2"
      style={{ left: watermark.xMm * scale, top: watermark.yMm * scale, width: watermark.widthMm * scale, height: watermark.heightMm * scale }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        event.currentTarget.setPointerCapture(event.pointerId)
        const corner = (event.target as HTMLElement).closest<HTMLElement>('[data-corner]')?.dataset.corner as Corner | undefined
        gesture.current = { mode: corner ?? 'move', startX: event.clientX, startY: event.clientY, original: watermark }
      }}
      onPointerMove={(event) => {
        const g = gesture.current
        if (!g) return
        event.stopPropagation()
        // A release that never reached us: stop following the pointer
        if (event.buttons === 0) return finish(event)
        const dx = (event.clientX - g.startX) / scale
        const dy = (event.clientY - g.startY) / scale
        const next = g.mode === 'move' ? moveWatermark(g.original, dx, dy, note) : dragWatermarkCorner(g.original, g.mode, dx, dy, note)
        if (next.xMm !== watermark.xMm || next.yMm !== watermark.yMm || next.widthMm !== watermark.widthMm) onChange(next)
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={() => { gesture.current = null }}
      onKeyDown={(event) => {
        const by = NUDGE[event.key]
        if (!by) return
        event.preventDefault()
        event.stopPropagation()
        const step = event.shiftKey ? 10 * WATERMARK_STEP : WATERMARK_STEP
        onChange(moveWatermark(watermark, by[0] * step, by[1] * step, note))
      }}
    >
      {CORNERS.map((corner) => (
        <Button
          key={corner}
          variant="outline"
          size="icon-xs"
          tabIndex={-1}
          data-corner={corner}
          aria-label={`Resize watermark from its ${CORNER_NAMES[corner]} corner`}
          className={cn(
            'absolute z-10 size-2.5 min-w-0 rounded-[2px] border-fuchsia-500 p-0 active:translate-y-0',
            corner === 'nw' || corner === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize',
          )}
          style={{
            [corner[0] === 'n' ? 'top' : 'bottom']: 0,
            [corner[1] === 'w' ? 'left' : 'right']: 0,
            transform: `translate(${corner[1] === 'w' ? '-50%' : '50%'}, ${corner[0] === 'n' ? '-50%' : '50%'})`,
          }}
        />
      ))}
    </div>
  )
}
