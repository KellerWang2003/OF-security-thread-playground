import { Box, Pause, Play, Sparkles, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Slider } from '@/components/ui/slider'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { IconButton, Segmented } from '../components/controls'
import { FrameFill } from '../components/NoteView'
import { formatDeg, frameMix } from '../lib/frames'
import type { Note } from '../lib/types'
import { setTilt, useTilt } from '../tilt/tilt'

const SPEEDS = ['0.5', '1', '2'] as const

function ToggleButton({
  label,
  pressed,
  onPressedChange,
  children,
}: {
  label: string
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle size="sm" aria-label={label} pressed={pressed} onPressedChange={onPressedChange}>
            {children}
          </Toggle>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The universal tilt control, floating at the bottom of the canvas. The scrubber is split into the
 * reference note's frame slices, so it reads as a timeline of which frame shows at which angle.
 */
export function TiltBar({ note }: { note: Note }) {
  const { angle, source, target, wobbleSpeed, springBack, perspective, sheen } = useTilt()
  const { frames, tilt, thread } = note
  const { current } = frameMix(angle, tilt.rangeDeg, frames.length, tilt.transition)
  const wobbling = source === 'wobble'

  return (
    <div className="absolute bottom-3 left-1/2 flex w-[min(560px,calc(100%-260px))] -translate-x-1/2 items-center gap-3 rounded-xl border bg-background px-2 py-2 shadow-sm">
      <IconButton
        label={wobbling ? 'Stop wobble' : 'Wobble back and forth'}
        variant={wobbling ? 'default' : 'ghost'}
        onClick={() => setTilt({ source: wobbling ? 'drag' : 'wobble', target: wobbling ? 0 : target })}
      >
        {wobbling ? <Pause /> : <Play />}
      </IconButton>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-sm">
          {frames.map((frame, i) => (
            <div
              key={frame.id}
              className={cn('relative flex-1 transition-opacity', i === current ? 'opacity-100' : 'opacity-40')}
            >
              <FrameFill frame={frame} fit={thread.fit} tilePx={6} />
            </div>
          ))}
        </div>
        <Slider
          aria-label="Tilt angle"
          value={Math.round((source === 'slider' ? target : angle) * 10) / 10}
          min={-tilt.rangeDeg}
          max={tilt.rangeDeg}
          step={0.5}
          onValueChange={(next) => setTilt({ source: 'slider', target: Array.isArray(next) ? next[0] : next })}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>{formatDeg(-tilt.rangeDeg)}</span>
          <span className="font-medium text-foreground">
            {formatDeg(angle)} · frame {current + 1} · {note.name}
          </span>
          <span>{formatDeg(tilt.rangeDeg)}</span>
        </div>
      </div>

      {wobbling && (
        <div className="w-[108px]">
          <Segmented
            value={SPEEDS.find((s) => Number(s) === wobbleSpeed) ?? '1'}
            options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
            onChange={(s) => setTilt({ wobbleSpeed: Number(s) })}
          />
        </div>
      )}

      <div className="flex items-center gap-0.5 border-l pl-2">
        <ToggleButton label="Spring back after dragging" pressed={springBack} onPressedChange={(v) => setTilt({ springBack: v })}>
          <Undo2 />
        </ToggleButton>
        <ToggleButton label="Show tilt in perspective" pressed={perspective} onPressedChange={(v) => setTilt({ perspective: v })}>
          <Box />
        </ToggleButton>
        <ToggleButton label="Highlight on thread" pressed={sheen} onPressedChange={(v) => setTilt({ sheen: v })}>
          <Sparkles />
        </ToggleButton>
      </div>
    </div>
  )
}
