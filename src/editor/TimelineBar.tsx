import { reportError } from '../cloud/notices'
import { ArrowLeft, Circle, Square, ArrowRight, EyeOff, Hash, ImagePlus, MoreHorizontal, Pause, Play, Plus, SlidersHorizontal, SquareDashed, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { IconButton, Panel } from '../components/controls'
import { FrameThumb } from '../components/NoteView'
import { clamp, cyclePhase } from '../lib/frames'
import { cyclePosition, flatLabel, flatStep, lensState, reachSpans, respondsTo, tiltForPosition, tiltReach, type LensState } from '../lib/lens'
import { pickFiles } from '../lib/images'
import { DEFAULT_TILT, LENGTH_LIMITS, MAX_FRAMES, MIN_FRAMES } from '../lib/notes'
import { framesMissed, playbackLens, playbackTilt, sectionMix, timelineSection } from '../lib/pattern'
import type { Frame, Note } from '../lib/types'
import { setRecording, setTilt, togglePlayback, useTilt } from '../tilt/tilt'
import { PlaybackPanel } from './PlaybackPanel'
import { TILT_PANEL_PX } from './TiltRail'
import { addEmptyFrame, addImageFrames, deleteFrame, moveFrame, updateFrame, type NoteRef } from './frameActions'

const PAD = 12
/** Height of one tilt-reach lane above the frames, in px */
const LANE = 9
/** Pixels per unit of frame length; a new frame (10 units) starts 100 px wide */
const ZOOM = { min: 3, max: 40, initial: 10 }

/**
 * Bottom of the canvas: play and pause with the project's playback controls stacked beside it, always, as wide
 * as the tilt pad's panel above them; with a banknote selected the panel widens to show that banknote's frames.
 */
export function TimelineBar({
  projectId,
  notes,
  note,
  noteRef,
  besidePanel,
  sectionId,
}: {
  projectId: string
  notes: Note[]
  note?: Note
  noteRef?: NoteRef
  besidePanel: boolean
  /** The thread section whose lens the track follows, in the thread editor */
  sectionId?: string
}) {
  const source = useTilt((state) => state.source)
  const playing = source === 'wobble'

  return (
    <Panel
      className={cn(
        'absolute bottom-3 left-3 flex h-[88px] items-stretch gap-2 p-2 rounded-[calc(var(--radius)+0.5rem+1px)]',
        note && (besidePanel ? 'right-[calc(var(--panel-w)+20px)]' : 'right-3'),
      )}
    >
      <div className="flex shrink-0 gap-2" style={{ width: TILT_PANEL_PX - 2 * 8 - 2 }}>
        <IconButton
          label={playing ? 'Pause' : 'Play'}
          variant={playing ? 'default' : 'outline'}
          size="icon"
          className="size-auto flex-1 rounded-lg [&_svg:not([class*='size-'])]:size-6"
          onClick={togglePlayback}
        >
          {playing ? <Pause /> : <Play />}
        </IconButton>
        <FrameSettings projectId={projectId} note={note ?? notes.at(0)} />
      </div>
      {note && noteRef && <FrameTrack note={note} noteRef={noteRef} sectionId={sectionId} />}
    </Panel>
  )
}

/** One of the small buttons stacked beside Play, sharing the column's height (each with the same border, so the shares match) */
const STACKED = 'min-h-0 flex-1 rounded-md border border-transparent'

/** Project-wide playback controls, shared by every banknote, stacked in a column beside Play. */
function FrameSettings({ projectId, note }: { projectId: string; note?: Note }) {
  // A thread mixing ridge angles plays each tilt at its fastest section's cycle
  const tilt = note ? playbackTilt(note) : DEFAULT_TILT
  const lens = note ? playbackLens(note) : lensState(tilt)
  const recording = useTilt((s) => s.recording)
  const frameNumbers = useTilt((s) => s.frameNumbers)

  return (
    <div className="flex w-8 shrink-0 flex-col gap-0.5">
      <IconButton
        label={recording ? 'Drag on the tilt pad to record; click to cancel' : 'Record movement'}
        variant={recording ? 'destructive' : 'ghost'}
        className={cn(STACKED, 'size-auto')}
        onClick={() => setRecording(!recording)}
      >
        {recording ? <Square className="size-2.5 fill-current" /> : <Circle className="size-2.5 fill-destructive text-destructive" />}
      </IconButton>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              aria-label="Frame numbers on threads"
              pressed={frameNumbers}
              onPressedChange={(on) => setTilt({ frameNumbers: on })}
              className={cn(STACKED, 'h-auto min-w-0 px-0 aria-pressed:bg-primary aria-pressed:text-primary-foreground')}
            />
          }
        >
          <Hash className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{frameNumbers ? 'Hide frame numbers on threads' : 'Show frame numbers on threads'}</TooltipContent>
      </Tooltip>
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={<PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Playback settings" className={cn(STACKED, 'size-auto')} />} />}
          >
            <SlidersHorizontal className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Playback settings</TooltipContent>
        </Tooltip>
        <PopoverContent side="top" align="start" sideOffset={12} className="w-[580px] gap-0 overflow-hidden p-0">
          <PopoverTitle className="border-b px-3 py-2.5 text-sm">Playback settings</PopoverTitle>
          <PlaybackPanel projectId={projectId} tilt={tilt} lens={lens} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

/**
 * The selected banknote's frames as one cycle of clips on a track, plus its frame settings. A frame's
 * width is its share of the cycle; drag its right edge to change that. The playhead shows where in the
 * cycle the current tilt is, wrapping around as the frames loop. Drag to scrub, scroll to move along,
 * ⌘-scroll to zoom.
 */
function FrameTrack({ note, noteRef, sectionId }: { note: Note; noteRef: NoteRef; sectionId?: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ mode: 'scrub' } | { mode: 'resize'; frameId: string; startX: number; startLength: number } | null>(null)
  const [pxPerUnit, setPxPerUnit] = useState(ZOOM.initial)
  const { frames } = note
  // One section's lens (the first, or the one picked in the thread editor); a plain thread's is the banknote's
  const followed = timelineSection(note, sectionId)
  const { lens, tilt } = followed
  // Only the frame shown, so the track re-renders when it changes rather than on every animation frame
  const current = useTilt((s) => sectionMix(note, followed, { x: s.angleX, y: s.angle }).current)
  // Frames a tilt plays somewhere on the thread yet never shows anywhere
  const unseen = framesMissed(note)
  const missed = (i: number) => unseen.at(i) ?? []
  const lengths = frames.map((f) => f.length)
  const totalLength = lengths.reduce((sum, l) => sum + l, 0)
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((sum, l) => sum + l, 0))
  const x = (units: number) => PAD + units * pxPerUnit
  const bars = (['y', 'x'] as const).filter((a) => respondsTo(lens, a)).map((a) => ({ axis: a, spans: reachSpans(lens.offset, tiltReach(lens, a)) }))
  // With both tilts live, each tilt's reach gets its own lane above the frames instead of sitting on them
  const lanes = bars.length > 1 ? bars.length : 0
  const framesTop = lanes ? 4 + lanes * LANE : 4

  // Wheel: ⌘/Ctrl zooms the timeline, a plain vertical wheel scrolls it sideways
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setPxPerUnit((p) => clamp(p * Math.exp(-clamp(e.deltaY, -40, 40) * 0.01), ZOOM.min, ZOOM.max))
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        element.scrollLeft += e.deltaY
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const scrubTo = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect) return
    const u = clamp((clientX - rect.left - PAD) / (totalLength * pxPerUnit), 0, 1)
    const at = tiltForPosition(lens, u)
    setTilt({ source: 'slider', target: at.y, targetX: at.x })
  }

  return (
    <>
      <div className="w-px shrink-0 bg-border" />
      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden rounded-lg bg-muted/40">
        <div
          ref={track}
          className="relative h-full touch-none overflow-hidden select-none"
          style={{ width: x(totalLength) + PAD }}
          onPointerDown={(e) => {
            const el = e.target as HTMLElement
            if (e.button !== 0 || el.closest('button') || el.closest('[role=menu]')) return
            e.currentTarget.setPointerCapture(e.pointerId)
            const handle = el.closest<HTMLElement>('[data-resize]')
            const frame = frames.find((f) => f.id === handle?.dataset.resize)
            if (frame && noteRef) {
              gesture.current = { mode: 'resize', frameId: frame.id, startX: e.clientX, startLength: frame.length }
            } else {
              gesture.current = { mode: 'scrub' }
              scrubTo(e.clientX)
            }
          }}
          onPointerMove={(e) => {
            const g = gesture.current
            // The release never reached us: stop following the pointer
            if (g && e.buttons === 0) {
              gesture.current = null
              return
            }
            if (g?.mode === 'scrub') scrubTo(e.clientX)
            if (g?.mode === 'resize' && noteRef) {
              const length = clamp(Math.round(g.startLength + (e.clientX - g.startX) / pxPerUnit), LENGTH_LIMITS.min, LENGTH_LIMITS.max)
              updateFrame(noteRef, g.frameId, { length })
            }
          }}
          onPointerUp={() => {
            gesture.current = null
          }}
          onPointerCancel={() => {
            gesture.current = null
          }}
          onLostPointerCapture={() => {
            gesture.current = null
          }}
        >
          {frames.map((frame, i) => {
            const left = x(starts.at(i) ?? 0)
            const width = frame.length * pxPerUnit
            return (
              <div
                key={frame.id}
                data-frame-clip={frame.id}
                className={cn(
                  'group absolute bottom-1 overflow-hidden rounded-sm border bg-background',
                  i === current && 'ring-1 ring-primary/30',
                )}
                style={{ top: framesTop, left: left + 1, width: Math.max(width - 2, 4) }}
              >
                <FrameThumb frame={frame} backgroundColor={note.thread.backgroundColor} />
                {width > 28 && (
                  <span className="absolute top-0.5 left-1 rounded bg-background/80 px-1 text-[10px] font-medium tabular-nums">
                    {i + 1}
                  </span>
                )}
                {missed(i).length > 0 && (
                  <span
                    className="absolute bottom-0.5 left-1 flex items-center gap-0.5 rounded bg-background/80 px-1 text-[10px] font-medium"
                    title={missed(i).map((a) => (a === 'y' ? 'Never seen tilting up or down' : 'Never seen tilting side to side')).join('; ')}
                  >
                    <EyeOff className="size-3" />
                    {missed(i).map((a) => (a === 'y' ? '↕' : '↔')).join('')}
                  </span>
                )}
                {(
                  <>
                    <FrameMenu frame={frame} index={i} count={frames.length} noteRef={noteRef} />
                    <div
                      data-resize={frame.id}
                      aria-label={`Change frame ${i + 1} length`}
                      className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize bg-foreground/0 transition-colors hover:bg-primary/40"
                    />
                  </>
                )}
              </div>
            )
          })}

          {lanes > 0 && bars.map(({ axis, spans }, row) => (
            // The frames each tilt alone shows: how far it reaches either way from flat (to ±90°), wrapping round the loop
            <div key={axis} className="absolute" style={{ top: 3 + row * LANE, height: LANE - 3, left: x(0), width: totalLength * pxPerUnit }}
              title={axis === 'y' ? 'Frames tilting up or down shows' : 'Frames tilting side to side shows'}>
              <div className="absolute inset-0 rounded-full bg-foreground/5" />
              {spans.map(([lo, hi], k) => (
                <div key={k} className={cn('absolute inset-y-0 rounded-full', axis === 'y' ? 'bg-sky-500' : 'bg-amber-500')} style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
              ))}
            </div>
          ))}
          {lanes > 0 && bars.map(({ axis }, row) => (
            // Which lane is which, just left of the first frame
            <span key={axis} className={cn('pointer-events-none absolute text-[9px] leading-none font-semibold', axis === 'y' ? 'text-sky-600' : 'text-amber-600')}
              style={{ top: 3 + row * LANE - 1.5, left: 1 }}>
              {axis === 'y' ? '↕' : '↔'}
            </span>
          ))}

          {/* Flat: what a straight-on view shows; set on the Lens effect strip */}
          <div className="pointer-events-none absolute bottom-0 -translate-x-1/2" style={{ left: x(lens.offset * totalLength) }}
            title={`Flat: ${flatLabel(flatStep(tilt, frames.length))}`}>
            <div className="size-0 border-x-4 border-b-[5px] border-x-transparent border-b-foreground/70" />
          </div>

          <Playhead lens={lens} left={x(0)} width={totalLength * pxPerUnit} />
        </div>
      </div>

      {(
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Add frame"
                disabled={frames.length >= MAX_FRAMES && !frames.every((f) => f.kind !== 'image')}
                className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              />
            }
          >
            <Plus className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44" side="top" align="end">
            <DropdownMenuItem
              onClick={async () => {
                try {
                  const files = await pickFiles({ multiple: true })
                  if (files.length) await addImageFrames(noteRef, files)
                } catch (error) { reportError(error) }
              }}
            >
              <ImagePlus />
              Upload images
            </DropdownMenuItem>
            <DropdownMenuItem disabled={frames.length >= MAX_FRAMES} onClick={() => addEmptyFrame(noteRef)}>
              <SquareDashed />
              Empty frame
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

    </>
  )
}

/** Where in the cycle the current tilt is; on its own so it alone re-renders as the tilt moves */
function Playhead({ lens, left, width }: { lens: LensState; left: number; width: number }) {
  const phase = useTilt((s) => cyclePhase(cyclePosition(lens, { x: s.angleX, y: s.angle }), 1))
  return (
    <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary" style={{ left: left + phase * width }}>
      <div className="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-primary" />
    </div>
  )
}

/** A clip's menu: move it along the timeline or delete it; what the frame shows is set in Thread Studio */
function FrameMenu({ frame, index, count, noteRef }: { frame: Frame; index: number; count: number; noteRef: NoteRef }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="secondary"
            size="icon-xs"
            aria-label={`Frame ${index + 1} options`}
            className="absolute top-0.5 right-2 opacity-0 group-hover:opacity-100 data-[popup-open]:opacity-100"
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44" side="top">
        <DropdownMenuItem disabled={index === 0} onClick={() => moveFrame(noteRef, frame.id, -1)}>
          <ArrowLeft />
          Move earlier
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === count - 1} onClick={() => moveFrame(noteRef, frame.id, 1)}>
          <ArrowRight />
          Move later
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={count <= MIN_FRAMES} onClick={() => void deleteFrame(noteRef, frame.id)}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
