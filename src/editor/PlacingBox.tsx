import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LAYER_NAMES, type PlacedLayer } from '../lib/layers'
import { type Corner, PLACE_STEP, type PlacedBox, dragBoxCorner, moveBox } from '../lib/placed'
import type { Note } from '../lib/types'

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']
const CORNER_NAMES: Record<Corner, string> = { nw: 'top-left', ne: 'top-right', sw: 'bottom-left', se: 'bottom-right' }

type Gesture = { mode: 'move' | Corner; startX: number; startY: number; original: PlacedBox }
/** Arrow keys nudge one step (ten with Shift) */
const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/**
 * Canvas-only placing surface for a layer placed on a flat banknote (the watermark, shown clear, or magnetic ink): drag
 * the box to move the layer, a corner to resize it with its proportions kept, in 0.5 mm steps; arrow keys nudge it.
 * It takes its gestures before the banknote can tilt or pan.
 */
export function PlacingBox({ note, layer, box, scale, onChange }: {
  note: Note
  layer: PlacedLayer
  box: PlacedBox
  scale: number
  onChange: (box: PlacedBox) => void
}) {
  const gesture = useRef<Gesture | null>(null)
  const name = LAYER_NAMES[layer].toLowerCase()
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
      aria-label={`Place ${name}`}
      data-placed={layer}
      data-placing=""
      className="absolute touch-none cursor-move border border-fuchsia-500 ring-2 ring-fuchsia-500/40 outline-none focus-visible:ring-fuchsia-500/70"
      style={{ left: box.xMm * scale, top: box.yMm * scale, width: box.widthMm * scale, height: box.heightMm * scale }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        event.currentTarget.setPointerCapture(event.pointerId)
        const corner = (event.target as HTMLElement).closest<HTMLElement>('[data-corner]')?.dataset.corner as Corner | undefined
        gesture.current = { mode: corner ?? 'move', startX: event.clientX, startY: event.clientY, original: box }
      }}
      onPointerMove={(event) => {
        const g = gesture.current
        if (!g) return
        event.stopPropagation()
        // A release that never reached us: stop following the pointer
        if (event.buttons === 0) return finish(event)
        const dx = (event.clientX - g.startX) / scale
        const dy = (event.clientY - g.startY) / scale
        const next = g.mode === 'move' ? moveBox(g.original, dx, dy, note) : dragBoxCorner(g.original, g.mode, dx, dy, note)
        if (next.xMm !== box.xMm || next.yMm !== box.yMm || next.widthMm !== box.widthMm) onChange(next)
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={() => { gesture.current = null }}
      onKeyDown={(event) => {
        const by = NUDGE[event.key]
        if (!by) return
        event.preventDefault()
        event.stopPropagation()
        const step = event.shiftKey ? 10 * PLACE_STEP : PLACE_STEP
        onChange(moveBox(box, by[0] * step, by[1] * step, note))
      }}
    >
      {CORNERS.map((corner) => (
        <Button
          key={corner}
          variant="outline"
          size="icon-xs"
          tabIndex={-1}
          data-corner={corner}
          aria-label={`Resize ${name} from its ${CORNER_NAMES[corner]} corner`}
          className={cn(
            'absolute z-10 size-2.5 min-w-0 rounded-sm border-fuchsia-500 p-0 active:translate-y-0',
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
