import { ChevronDown, ChevronUp, ImagePlus, Palette, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ColorField, IconButton } from '../components/controls'
import { FrameFill } from '../components/NoteView'
import { formatDeg, frameMix, sliceRange } from '../lib/frames'
import { pickFiles } from '../lib/images'
import { MAX_FRAMES, MIN_FRAMES } from '../lib/notes'
import type { Note } from '../lib/types'
import { setTilt, useTilt } from '../tilt/tilt'
import {
  addColorFrame,
  addImageFrames,
  deleteFrame,
  moveFrame,
  replaceFrameImage,
  updateFrame,
  type NoteRef,
} from './frameActions'

/**
 * The selected note's frames, like layers: the one showing at the current tilt is highlighted, and
 * clicking a thumbnail jumps the tilt to the middle of that frame's slice.
 */
export function FramesPanel({ note, noteRef }: { note: Note; noteRef: NoteRef }) {
  const angle = useTilt((s) => s.angle)
  const { frames, thread, tilt } = note
  const { current } = frameMix(angle, tilt.rangeDeg, frames.length, tilt.transition)
  const full = frames.length >= MAX_FRAMES

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h2 className="truncate text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Frames · {note.name}
        </h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {frames.length} of {MAX_FRAMES}
        </span>
      </div>

      <ol className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {frames.map((frame, i) => {
          const [from, to] = sliceRange(i, frames.length, tilt.rangeDeg)
          return (
            <li
              key={frame.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border p-1.5 transition-colors',
                i === current ? 'border-foreground/40 bg-muted/60' : 'border-border',
              )}
            >
              <button
                type="button"
                aria-label={`Show frame ${i + 1}`}
                onClick={() => setTilt({ source: 'slider', target: (from + to) / 2 })}
                className="relative h-14 w-5 shrink-0 overflow-hidden rounded-sm bg-white ring-1 ring-border"
              >
                <FrameFill frame={frame} fit={thread.fit} tilePx={12} />
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-1">
                  <span className="w-3 text-[11px] text-muted-foreground tabular-nums">{i + 1}</span>
                  <Input
                    aria-label="Frame name"
                    className="h-6 min-w-0 flex-1 border-transparent px-1 text-xs shadow-none hover:border-input"
                    value={frame.name}
                    onChange={(e) => updateFrame(noteRef, frame.id, { name: e.target.value })}
                  />
                </div>
                {frame.kind === 'color' ? (
                  <ColorField value={frame.color} onChange={(color) => updateFrame(noteRef, frame.id, { color })} />
                ) : (
                  <span className="pl-4 text-[11px] text-muted-foreground tabular-nums">
                    {formatDeg(from)} to {formatDeg(to)}
                  </span>
                )}
              </div>
              <div className="flex flex-col">
                <IconButton size="icon-xs" label="Move up" disabled={i === 0} onClick={() => moveFrame(noteRef, frame.id, -1)}>
                  <ChevronUp />
                </IconButton>
                <IconButton
                  size="icon-xs"
                  label="Move down"
                  disabled={i === frames.length - 1}
                  onClick={() => moveFrame(noteRef, frame.id, 1)}
                >
                  <ChevronDown />
                </IconButton>
              </div>
              <div className="flex flex-col">
                <IconButton
                  size="icon-xs"
                  label={frame.kind === 'color' ? 'Use an image instead' : 'Replace image'}
                  onClick={async () => {
                    const [file] = await pickFiles()
                    if (file) await replaceFrameImage(noteRef, frame.id, file)
                  }}
                >
                  <RefreshCw />
                </IconButton>
                <IconButton
                  size="icon-xs"
                  label={frames.length <= MIN_FRAMES ? `A thread needs at least ${MIN_FRAMES} frames` : 'Delete frame'}
                  disabled={frames.length <= MIN_FRAMES}
                  onClick={() => void deleteFrame(noteRef, frame.id)}
                >
                  <Trash2 />
                </IconButton>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="flex shrink-0 flex-col gap-2 border-t p-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={full && !frames.every((f) => f.kind === 'color')}
            onClick={async () => {
              const files = await pickFiles({ multiple: true })
              if (files.length) await addImageFrames(noteRef, files)
            }}
          >
            <ImagePlus />
            Upload frames
          </Button>
          <Button variant="outline" size="sm" disabled={full} onClick={() => addColorFrame(noteRef)}>
            <Palette />
            Colour
          </Button>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground/80">
          PNG, JPG or SVG at the thread's proportions, or drop them on the note. Uploading 2 or more replaces the colour
          placeholders.
        </p>
      </div>
    </div>
  )
}
