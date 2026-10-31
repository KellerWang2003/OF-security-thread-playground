import { RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { IconButton, Panel } from '../components/controls'
import { TILT_LIMIT, clamp } from '../lib/frames'
import { setTilt, useTilt } from '../tilt/tilt'

/** Degrees of tilt per pixel dragged; the full ±60° takes about 400 px */
const DEG_PER_PX = 0.3
/** Spacing of the ridges, so they roll past like a thumbwheel as the angle changes */
const RIDGE_PX = 6

const holdAt = (deg: number) => setTilt({ source: 'hold', target: clamp(deg, -TILT_LIMIT, TILT_LIMIT) })

/**
 * Left edge of the canvas: a ridged bar you press and drag up or down to tilt every banknote, the
 * current angle, and a field to type an exact angle. The tilt stays where you leave it.
 */
export function TiltRail() {
  const { angle, source, target } = useTilt()
  const drag = useRef<{ y: number; start: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  // While dragging or holding, show where the tilt is going rather than the spring catching up
  const shown = source === 'hold' ? target : angle
  const endDrag = () => {
    drag.current = null
    setDragging(false)
  }

  return (
    <Panel className="absolute top-1/2 left-3 flex w-12 -translate-y-1/2 flex-col items-center gap-1.5 rounded-[calc(var(--radius)+0.375rem+1px)] p-1.5">
      <div className="relative w-full" title="Tilt angle">
        <Input
          aria-label="Tilt angle"
          type="number"
          inputMode="decimal"
          className="h-7 w-full px-0.5 pr-2.5 text-center text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
          value={draft ?? String(Math.round(shown))}
          min={-TILT_LIMIT}
          max={TILT_LIMIT}
          onFocus={(e) => {
            setDraft(String(Math.round(shown)))
            e.currentTarget.select()
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const value = Number(draft)
            if (draft !== null && draft !== '' && Number.isFinite(value)) holdAt(value)
            setDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setDraft(null)
              e.currentTarget.blur()
            }
          }}
        />
        <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-[10px] text-muted-foreground">°</span>
      </div>

      <div
        role="slider"
        aria-label="Tilt"
        aria-orientation="vertical"
        aria-valuemin={-TILT_LIMIT}
        aria-valuemax={TILT_LIMIT}
        aria-valuenow={Math.round(shown)}
        tabIndex={0}
        className={cn(
          'relative h-56 w-full touch-none overflow-hidden rounded-md bg-muted outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{
          backgroundImage: `repeating-linear-gradient(180deg, color-mix(in oklch, var(--foreground) 22%, transparent) 0 1px, transparent 1px ${RIDGE_PX}px)`,
          backgroundPosition: `0 ${-shown / DEG_PER_PX}px`,
        }}
        onPointerDown={(e) => {
          // Only the primary button drags; a right-click opens a context menu and never sends pointerup
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          const start = useTilt.getState().source === 'hold' ? useTilt.getState().target : useTilt.getState().angle
          drag.current = { y: e.clientY, start }
          setDragging(true)
          holdAt(start)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          // A release that never reached us (outside the window, a lost capture): stop following the pointer
          if (e.buttons === 0) return endDrag()
          // Dragging up tilts up
          holdAt(drag.current.start + (drag.current.y - e.clientY) * DEG_PER_PX)
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={() => holdAt(0)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 5 : 1
          if (e.key === 'ArrowUp') holdAt(Math.round(shown) + step)
          else if (e.key === 'ArrowDown') holdAt(Math.round(shown) - step)
          else return
          e.preventDefault()
        }}
      >
        {/* Soft fade at both ends, so the ridges read as a wheel turning */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/90 via-transparent to-background/90" />
        <div className="pointer-events-none absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary" />
      </div>

      <IconButton label="Back to flat" size="icon-sm" onClick={() => holdAt(0)}>
        <RotateCcw />
      </IconButton>
    </Panel>
  )
}
