import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Labeled } from '../components/controls'

export type MeasureSide = 'left' | 'right' | 'top' | 'bottom'
/** Where a measurement's card sits along its bracket: in its middle, or flush with its start or its end */
export type MeasureAlign = 'center' | 'start' | 'end'

/**
 * A measurement's card: its small label over its field, as over every control in the panels. Presses on it never reach
 * what lies under it, so scrubbing or typing doesn't tilt the thread, pan or draw a window. On the canvas it keeps its
 * size while a pan or zoom is under way (`data-keep-size`), about `origin`, the point it hangs from.
 */
function MeasureCard({ label, action, origin = 'center', onPress, children }: {
  /** The small label over the field */
  label: string
  /** A small control at the label's end */
  action?: ReactNode
  origin?: string
  /** A press anywhere on it, as well as what the press does to its field */
  onPress?: () => void
  children: ReactNode
}) {
  return (
    <div data-keep-size="" style={{ transformOrigin: origin }} className="pointer-events-auto shrink-0 cursor-default"
      onPointerDown={(e) => {
        e.stopPropagation()
        onPress?.()
      }}
      onDoubleClick={(e) => e.stopPropagation()}>
      <Labeled label={label} action={action} className="rounded-md bg-background p-1.5 shadow-xs">{children}</Labeled>
    </div>
  )
}

/**
 * A measurement beside a strip, as beside the thread in Thread Studio and beside the windows on the canvas: a bracket
 * over `from` to `to` (px along that side of it) and its card beyond it, in the bracket's middle or, with `align`, flush
 * with one of its ends. `inside`, the card sits on the strip itself, in the middle of that stretch of it, with no
 * bracket: the stretch is its own. Only the card takes presses: round it they reach what lies under, as if it weren't
 * there.
 */
export function Measure({ side, from, to, inside = false, label, action, align = 'center', onPress, children }: {
  side: MeasureSide
  from: number
  to: number
  inside?: boolean
  /** The small label over the field */
  label: string
  /** A small control at the label's end */
  action?: ReactNode
  align?: MeasureAlign
  /** A press anywhere on its card */
  onPress?: () => void
  children: ReactNode
}) {
  const gap = 10
  const upright = side === 'left' || side === 'right'
  // The card hangs from its side facing the strip, at the point along it that it is placed by
  const facing = ({ left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const)[side]
  const along = { center: 'center', start: upright ? 'top' : 'left', end: upright ? 'bottom' : 'right' }[align]
  const span: CSSProperties = upright ? { top: from, height: Math.max(0, to - from) } : { left: from, width: Math.max(0, to - from) }
  const place: CSSProperties = inside
    ? { ...span, ...(upright ? { left: 0, right: 0 } : { top: 0, bottom: 0 }) }
    : { ...span, [facing]: `calc(100% + ${gap}px)` }
  // The bracket's open side faces the strip
  const bracket = { left: 'h-full w-1.5 border-y border-l', right: 'h-full w-1.5 border-y border-r', top: 'h-1.5 w-full border-x border-t', bottom: 'h-1.5 w-full border-x border-b' }[side]
  return (
    <div className={cn('pointer-events-none absolute flex gap-1.5', inside
      ? 'items-center justify-center'
      : [{ left: 'flex-row-reverse', right: 'flex-row', top: 'flex-col-reverse', bottom: 'flex-col' }[side], { center: 'items-center', start: 'items-start', end: 'items-end' }[align]])}
      style={place} data-measure="">
      {/* Always in the same place among its children, so its card stays the same one as it moves on or off the strip */}
      {!inside && <div className={cn('shrink-0 border-foreground/40', bracket)} />}
      <MeasureCard label={label} action={action} origin={inside ? 'center' : upright ? `${facing} ${along}` : `${along} ${facing}`} onPress={onPress}>{children}</MeasureCard>
    </div>
  )
}
