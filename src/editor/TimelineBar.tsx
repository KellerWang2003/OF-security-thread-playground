import { reportError } from '../cloud/notices'
import { ArrowLeft, Circle, Square, ArrowRight, EyeOff, ImagePlus, MoreHorizontal, Palette, Pause, Play, Plus, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { IconButton, Panel } from '../components/controls'
import { FrameThumb } from '../components/NoteView'
import { clamp, cyclePhase } from '../lib/frames'
import { cyclePosition, flatLabel, flatStep, framesReached, lensMix, lensState, reachSpans, respondsTo, tiltForPosition, tiltReach } from '../lib/lens'
import { pickFiles } from '../lib/images'
import { DEFAULT_TILT, LENGTH_LIMITS, MAX_FRAMES, MIN_FRAMES } from '../lib/notes'
import type { Frame, Note } from '../lib/types'
import { setRecording, setTilt, togglePlayback, useTilt } from '../tilt/tilt'
import { PlaybackPanel } from './PlaybackPanel'
import { addColorFrame, addImageFrames, deleteFrame, moveFrame, replaceFrameImage, updateFrame, type NoteRef } from './frameActions'

/** Opens the system colour picker without a visible input */
function pickColor(initial: string, onPick: (color: string) => void) {
  const input = document.createElement('input')
  input.type = 'color'
  input.value = initial
  input.oninput = () => onPick(input.value)
  input.click()
}

const PAD = 12
/** Height of one tilt-reach lane above the frames, in px */
const LANE = 9
/** Pixels per unit of frame length; a new frame (10 units) starts 100 px wide */
const ZOOM = { min: 3, max: 40, initial: 10 }

/**
 * Bottom of the canvas: play and pause and the project's cycle and playback settings, always; with a banknote
 * selected the panel widens to show that banknote's frames.
 */
export function TimelineBar({
  projectId,
  notes,
  note,
  noteRef,
  besidePanel,
}: {
  projectId: string
  notes: Note[]
  note?: Note
  noteRef?: NoteRef
  besidePanel: boolean
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
      <IconButton
        label={playing ? 'Pause' : 'Play'}
        variant={playing ? 'default' : 'outline'}
        size="icon"
        className="size-[68px] rounded-lg [&_svg:not([class*='size-'])]:size-6"
        onClick={togglePlayback}
      >
        {playing ? <Pause /> : <Play />}
      </IconButton>

      <FrameSettings projectId={projectId} note={note ?? notes.at(0)} />
      {note && noteRef && <FrameTrack note={note} noteRef={noteRef} />}
    </Panel>
  )
}

/** Project-wide playback controls, shared by every banknote. */
function FrameSettings({ projectId, note }: { projectId: string; note?: Note }) {
  const tilt = note?.tilt ?? DEFAULT_TILT
  const lens = lensState(tilt, note?.frames)
  const recording = useTilt((s) => s.recording)

  return (
    <div className="flex w-[148px] shrink-0 flex-col justify-center gap-1.5">
      <Button
        variant={recording ? 'destructive' : 'outline'}
        size="sm"
        className="h-8 w-full gap-1.5 text-xs"
        title={recording ? 'Cancel recording' : 'Drag on the tilt pad to record a playback move'}
        onClick={() => setRecording(!recording)}
      >
        {recording ? <Square className="size-3 fill-current" /> : <Circle className="size-3 fill-destructive text-destructive" />}
        {recording ? 'Drag on the pad…' : 'Record movement'}
      </Button>
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 w-full gap-1.5 text-xs" />}>
          <SlidersHorizontal className="size-3.5" />Playback settings
        </PopoverTrigger>
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
function FrameTrack({ note, noteRef }: { note: Note; noteRef: NoteRef }) {
  const scroller = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ mode: 'scrub' } | { mode: 'resize'; frameId: string; startX: number; startLength: number } | null>(null)
  const [pxPerUnit, setPxPerUnit] = useState(ZOOM.initial)
  const angle = useTilt((s) => s.angle)
  const angleX = useTilt((s) => s.angleX)
  const { frames, tilt } = note
  const lens = lensState(tilt, frames)
  const { current } = lensMix(note, { x: angleX, y: angle }, lens)
  const reachedY = framesReached(note, 'y', lens)
  const reachedX = framesReached(note, 'x', lens)
  const missed = (i: number) => [
    ...(respondsTo(lens, 'y') && !reachedY.has(i) ? ['y' as const] : []),
    ...(respondsTo(lens, 'x') && !reachedX.has(i) ? ['x' as const] : []),
  ]
  const lengths = frames.map((f) => f.length)
  const totalLength = lengths.reduce((sum, l) => sum + l, 0)
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((sum, l) => sum + l, 0))
  const x = (units: number) => PAD + units * pxPerUnit
  const position = cyclePosition(lens, { x: angleX, y: angle })
  const phase = cyclePhase(position, 1)
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

          <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary" style={{ left: x(phase * totalLength) }}>
            <div className="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-primary" />
          </div>
        </div>
      </div>

      {(
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Add frame"
                disabled={frames.length >= MAX_FRAMES && !frames.every((f) => f.kind === 'color')}
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
            <DropdownMenuItem disabled={frames.length >= MAX_FRAMES} onClick={() => addColorFrame(noteRef)}>
              <Palette />
              Colour frame
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

    </>
  )
}

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
        <DropdownMenuItem
          onClick={async () => {
            try {
              const [file] = await pickFiles()
              if (file) await replaceFrameImage(noteRef, frame.id, file)
            } catch (error) { reportError(error) }
          }}
        >
          <RefreshCw />
          {frame.kind === 'image' ? 'Replace image' : 'Use an image'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => pickColor(frame.color, (color) => updateFrame(noteRef, frame.id, { kind: 'color', color }))}>
          <Palette />
          {frame.kind === 'color' ? 'Change colour' : 'Use a colour'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
