import { ArrowLeft, ArrowRight, ImagePlus, MoreHorizontal, Palette, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { IconButton, Panel } from '../components/controls'
import { FrameThumb } from '../components/NoteView'
import { clamp, formatDeg, frameMix } from '../lib/frames'
import { pickFiles } from '../lib/images'
import { MAX_FRAMES, MIN_FRAMES } from '../lib/notes'
import type { Note } from '../lib/types'
import { setTilt, useTilt } from '../tilt/tilt'
import { addColorFrame, addImageFrames, deleteFrame, moveFrame, replaceFrameImage, updateFrame, type NoteRef } from './frameActions'

/** Opens the system colour picker without a visible input */
function pickColor(initial: string, onPick: (color: string) => void) {
  const input = document.createElement('input')
  input.type = 'color'
  input.value = initial
  input.oninput = () => onPick(input.value)
  input.click()
}

/** The note seen edge-on from the side, so you can tell which way it is tilting; the dot is its top edge */
function TiltIndicator({ angle }: { angle: number }) {
  return (
    <svg viewBox="-16 -16 32 32" className="size-8 shrink-0 text-foreground" aria-hidden>
      <circle r="15" className="fill-muted" />
      <g transform={`rotate(${angle})`}>
        <line x1="0" y1="-10" x2="0" y2="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="0" cy="-10" r="2.5" fill="currentColor" />
      </g>
    </svg>
  )
}

/**
 * Bottom of the canvas: play and stop, then the selected note's frames as a timeline. The playhead
 * marks the current angle; drag along the frames to scrub through the tilt.
 */
export function TimelineBar({ note, noteRef, besidePanel }: { note: Note; noteRef: NoteRef | undefined; besidePanel: boolean }) {
  const track = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)
  const { angle, source, target } = useTilt()
  const { frames, tilt } = note
  const range = tilt.rangeDeg
  const { current } = frameMix(angle, range, frames.length, tilt.transition)
  const playing = source === 'wobble'
  const playhead = clamp((angle + range) / (2 * range), 0, 1)

  const scrubTo = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect) return
    const u = clamp((clientX - rect.left) / rect.width, 0, 1)
    setTilt({ source: 'slider', target: -range + u * 2 * range })
  }

  return (
    <Panel className={cn('absolute bottom-3 left-3 flex h-[92px] items-stretch gap-3 p-2', besidePanel ? 'right-[268px]' : 'right-3')}>
      <div className="flex w-[84px] shrink-0 flex-col items-center justify-center gap-1.5">
        <div className="flex items-center gap-0.5">
          <IconButton
            label={playing ? 'Pause' : 'Play'}
            variant={playing ? 'default' : 'ghost'}
            onClick={() => setTilt({ source: playing ? 'slider' : 'wobble', target: playing ? angle : target })}
          >
            {playing ? <Pause /> : <Play />}
          </IconButton>
          <TiltIndicator angle={angle} />
        </div>
        <span className="text-xs font-medium tabular-nums">{formatDeg(angle)}</span>
      </div>

      <div
        ref={track}
        className="relative flex min-w-0 flex-1 cursor-ew-resize touch-none gap-1.5 select-none"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          e.currentTarget.setPointerCapture(e.pointerId)
          scrubbing.current = true
          scrubTo(e.clientX)
        }}
        onPointerMove={(e) => {
          if (scrubbing.current) scrubTo(e.clientX)
        }}
        onPointerUp={() => {
          scrubbing.current = false
        }}
      >
        {frames.map((frame, i) => (
          <div
            key={frame.id}
            className={cn(
              'group relative flex min-w-[56px] flex-1 overflow-hidden rounded-lg border bg-white transition-shadow',
              i === current && 'ring-2 ring-primary/60',
            )}
          >
            <FrameThumb frame={frame} />
            <span className="absolute top-1 left-1.5 rounded bg-background/80 px-1 text-[10px] font-medium tabular-nums">
              {i + 1}
            </span>
            {noteRef && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="secondary"
                      size="icon-xs"
                      aria-label={`Frame ${i + 1} options`}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 data-[popup-open]:opacity-100"
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-44">
                  <DropdownMenuItem
                    onClick={async () => {
                      const [file] = await pickFiles()
                      if (file) await replaceFrameImage(noteRef, frame.id, file)
                    }}
                  >
                    <RefreshCw />
                    {frame.kind === 'image' ? 'Replace image' : 'Use an image'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      pickColor(frame.color, (color) => updateFrame(noteRef, frame.id, { kind: 'color', color }))
                    }
                  >
                    <Palette />
                    {frame.kind === 'color' ? 'Change colour' : 'Use a colour'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={i === 0} onClick={() => moveFrame(noteRef, frame.id, -1)}>
                    <ArrowLeft />
                    Move earlier
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={i === frames.length - 1} onClick={() => moveFrame(noteRef, frame.id, 1)}>
                    <ArrowRight />
                    Move later
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={frames.length <= MIN_FRAMES}
                    onClick={() => void deleteFrame(noteRef, frame.id)}
                  >
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}

        <div
          className="pointer-events-none absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-primary"
          style={{ left: `${playhead * 100}%` }}
        />
      </div>

      {noteRef && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Add frame"
                disabled={frames.length >= MAX_FRAMES && !frames.every((f) => f.kind === 'color')}
                className="flex w-12 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              />
            }
          >
            <Plus className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44" side="top" align="end">
            <DropdownMenuItem
              onClick={async () => {
                const files = await pickFiles({ multiple: true })
                if (files.length) await addImageFrames(noteRef, files)
              }}
            >
              <ImagePlus />
              Upload images
            </DropdownMenuItem>
            <DropdownMenuItem disabled={frames.length >= MAX_FRAMES} onClick={() => addColorFrame(noteRef)}>
              <Palette />
              Colour frame
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Panel>
  )
}
