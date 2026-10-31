import { FrameFill } from '../components/NoteView'
import { cn } from '@/lib/utils'
import { formatDeg, frameMix, sliceRange } from '../lib/frames'
import type { Project } from '../lib/types'
import { setTilt, useTilt } from '../tilt/tilt'

/** Every frame with the angles that show it; click one to jump to the middle of its slice */
export function FrameStrip({ project }: { project: Project }) {
  const angle = useTilt((s) => s.angle)
  const { frames, tilt, thread } = project
  const { current } = frameMix(angle, tilt.rangeDeg, frames.length, tilt.transition)

  return (
    <div className="flex justify-center gap-2 overflow-x-auto border-t bg-background px-4 py-3">
      {frames.map((frame, i) => {
        const [from, to] = sliceRange(i, frames.length, tilt.rangeDeg)
        return (
          <button
            type="button"
            key={frame.id}
            onClick={() => setTilt({ source: 'slider', target: (from + to) / 2 })}
            className={cn(
              'flex w-[120px] shrink-0 items-center gap-2.5 rounded-lg border p-1.5 text-left transition-colors',
              i === current ? 'border-foreground bg-muted/60' : 'border-border hover:bg-muted/40',
            )}
          >
            <div className="relative h-12 w-4 shrink-0 overflow-hidden rounded-sm bg-white ring-1 ring-border">
              <FrameFill frame={frame} fit={thread.fit} tilePx={12} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium">Frame {i + 1}</div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {formatDeg(from)} to {formatDeg(to)}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
