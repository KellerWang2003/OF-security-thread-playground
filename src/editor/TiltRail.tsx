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

type Axis = 'x' | 'y'

/** Holds the tilt at an angle on one axis, keeping the other where it is */
function holdAt(axis: Axis, deg: number, limit: number) {
  const s = useTilt.getState()
  const shownY = s.source === 'hold' ? s.target : s.angle
  const shownX = s.source === 'hold' ? s.targetX : s.angleX
  const value = clamp(deg, -limit, limit)
  setTilt(axis === 'y' ? { source: 'hold', target: value, targetX: shownX } : { source: 'hold', target: shownY, targetX: value })
}

/**
 * Left edge of the canvas: a ridged bar you press and drag up or down to tilt every banknote, the current
 * angle, and a field to type an exact angle. The tilt stays where you leave it. When the lens responds to
 * side tilt, a matching horizontal wheel sits near the bottom-left corner.
 */
export function TiltRail({ limit = TILT_LIMIT, side = false }: { limit?: number; side?: boolean }) {
  return (
    <>
      <Panel className="absolute top-1/2 left-3 flex w-12 -translate-y-1/2 flex-col items-center gap-1.5 rounded-[calc(var(--radius)+0.375rem+1px)] p-1.5">
        <AngleField axis="y" limit={limit} />
        <Wheel axis="y" limit={limit} />
        <IconButton label="Back to flat" size="icon-sm" onClick={() => setTilt({ source: 'hold', target: 0, targetX: 0 })}>
          <RotateCcw />
        </IconButton>
      </Panel>
      {side && (
        <Panel className="absolute bottom-[108px] left-3 flex h-12 w-64 items-center gap-1.5 rounded-[calc(var(--radius)+0.375rem+1px)] p-1.5">
          <div className="w-12 shrink-0"><AngleField axis="x" limit={limit} /></div>
          <Wheel axis="x" limit={limit} />
        </Panel>
      )}
    </>
  )
}

function useShown(axis: Axis) {
  return useTilt((s) => (axis === 'y' ? (s.source === 'hold' ? s.target : s.angle) : (s.source === 'hold' ? s.targetX : s.angleX)))
}

function AngleField({ axis, limit }: { axis: Axis; limit: number }) {
  const shown = useShown(axis)
  const [draft, setDraft] = useState<string | null>(null)
  const label = axis === 'y' ? 'Tilt angle' : 'Side tilt angle'
  return (
    <div className="relative w-full" title={label}>
      <Input
        aria-label={label}
        type="number"
        inputMode="decimal"
        className="h-7 w-full px-0.5 pr-2.5 text-center text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
        value={draft ?? String(Math.round(shown))}
        min={-limit}
        max={limit}
        onFocus={(e) => {
          setDraft(String(Math.round(shown)))
          e.currentTarget.select()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const value = Number(draft)
          if (draft !== null && draft !== '' && Number.isFinite(value)) holdAt(axis, value, limit)
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
  )
}

function Wheel({ axis, limit }: { axis: Axis; limit: number }) {
  const shown = useShown(axis)
  const drag = useRef<{ at: number; start: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const vertical = axis === 'y'
  const endDrag = () => {
    drag.current = null
    setDragging(false)
  }
  return (
    <div
      role="slider"
      aria-label={vertical ? 'Tilt' : 'Side tilt'}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemin={-limit}
      aria-valuemax={limit}
      aria-valuenow={Math.round(shown)}
      tabIndex={0}
      className={cn(
        'relative touch-none overflow-hidden rounded-md bg-muted outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50',
        vertical ? 'h-56 w-full' : 'h-full min-w-0 flex-1',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      style={{
        backgroundImage: `repeating-linear-gradient(${vertical ? 180 : 90}deg, color-mix(in oklch, var(--foreground) 22%, transparent) 0 1px, transparent 1px ${RIDGE_PX}px)`,
        backgroundPosition: vertical ? `0 ${-shown / DEG_PER_PX}px` : `${shown / DEG_PER_PX}px 0`,
      }}
      onPointerDown={(e) => {
        // Only the primary button drags; a right-click opens a context menu and never sends pointerup
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const s = useTilt.getState()
        const start = vertical ? (s.source === 'hold' ? s.target : s.angle) : (s.source === 'hold' ? s.targetX : s.angleX)
        drag.current = { at: vertical ? e.clientY : e.clientX, start }
        setDragging(true)
        holdAt(axis, start, limit)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        // A release that never reached us (outside the window, a lost capture): stop following the pointer
        if (e.buttons === 0) return endDrag()
        // Dragging up tilts up; dragging right tilts right
        const moved = vertical ? drag.current.at - e.clientY : e.clientX - drag.current.at
        holdAt(axis, drag.current.start + moved * DEG_PER_PX, limit)
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => holdAt(axis, 0, limit)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 5 : 1
        const up = vertical ? 'ArrowUp' : 'ArrowRight'
        const down = vertical ? 'ArrowDown' : 'ArrowLeft'
        if (e.key === up) holdAt(axis, Math.round(shown) + step, limit)
        else if (e.key === down) holdAt(axis, Math.round(shown) - step, limit)
        else return
        e.preventDefault()
      }}
    >
      {/* Soft fade at both ends, so the ridges read as a wheel turning */}
      <div className={cn('pointer-events-none absolute inset-0 via-transparent from-background/90 to-background/90', vertical ? 'bg-gradient-to-b' : 'bg-gradient-to-r')} />
      <div className={cn('pointer-events-none absolute rounded-full bg-primary', vertical ? 'inset-x-1 top-1/2 h-0.5 -translate-y-1/2' : 'inset-y-1 left-1/2 w-0.5 -translate-x-1/2')} />
    </div>
  )
}
