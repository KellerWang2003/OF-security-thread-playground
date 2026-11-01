import { reportError } from '../cloud/notices'
import { ArrowLeft, ArrowRight, EyeOff, ImagePlus, MoreHorizontal, Palette, Pause, Play, Plus, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { IconButton, Panel, ScrubField } from '../components/controls'
import { FrameThumb } from '../components/NoteView'
import { HOLD_LIMITS, PLAYBACK_CURVES, SPEED_LIMITS, advancePlayback, playbackEase, playbackSettings } from '../lib/playback'
import { clamp, cyclePhase } from '../lib/frames'
import { framesReached, lensMix, lensState, reachShare, respondsTo, tiltForPosition, primaryAxis } from '../lib/lens'
import { pickFiles } from '../lib/images'
import { CYCLE_LIMITS, DEFAULT_TILT, LENGTH_LIMITS, MAX_FRAMES, MIN_FRAMES } from '../lib/notes'
import { updateProject } from '../lib/store'
import type { Frame, Note } from '../lib/types'
import { setTilt, togglePlayback, useTilt } from '../tilt/tilt'
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
        note && (besidePanel ? 'right-[268px]' : 'right-3'),
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

function playbackMotionPath(speed: number, curve: NonNullable<Note['tilt']['curve']>, holdSeconds: number) {
  const duration = 2 / speed + 2 * holdSeconds
  let position = { phase: 0, holdRemaining: 0 }
  const points: string[] = []
  for (let i = 0; i <= 80; i++) {
    if (i) position = advancePlayback(position, duration / 80, speed, holdSeconds)
    const progress = position.phase <= 1 ? position.phase : 2 - position.phase
    points.push(`${i === 0 ? 'M' : 'L'}${4 + i * 3},${44 - 36 * playbackEase(progress, curve)}`)
  }
  return points.join(' ')
}

const PLAY_TILTS: { value: 'y' | 'x' | 'both'; label: string }[] = [
  { value: 'y', label: 'Up/down' },
  { value: 'x', label: 'Side to side' },
  { value: 'both', label: 'One after the other' },
]

/** Project-wide playback controls, shared by every banknote. */
function FrameSettings({ projectId, note }: { projectId: string; note?: Note }) {
  const tilt = note?.tilt ?? DEFAULT_TILT
  const lens = lensState(tilt, note?.frames)
  const axis = primaryAxis(tilt, lens)
  const both = respondsTo(lens, 'x') && respondsTo(lens, 'y')
  const setTiltSettings = (patch: Partial<Note['tilt']>) =>
    updateProject(projectId, (p) => ({ ...p, notes: p.notes.map((n) => ({ ...n, tilt: { ...n.tilt, ...patch } })) }))
  const { speed, curve, holdSeconds } = playbackSettings(tilt)
  const duration = 2 / speed + 2 * holdSeconds
  const motion = playbackMotionPath(speed, curve, holdSeconds)

  return (
    <div className="flex w-[148px] shrink-0 flex-col justify-center gap-1.5">
      <ScrubField
        label={both ? (axis === 'y' ? '↕ Cycle' : '↔ Cycle') : 'Cycle'}
        title={axis === 'y' ? 'Degrees of up/down tilt for one full cycle of the frames' : 'Degrees of side tilt for one full cycle of the frames'}
        value={Math.round((axis === 'y' ? lens.cycleY : lens.cycleX) ?? tilt.cycleDeg)}
        min={CYCLE_LIMITS.min}
        max={CYCLE_LIMITS.max}
        unit="°"
        onChange={(cycle) => setTiltSettings(axis === 'y' ? { cycleDeg: cycle } : { cycleXDeg: cycle })}
      />
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 w-full gap-1.5 text-xs" />}>
          <SlidersHorizontal className="size-3.5" />Playback settings
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={12} className="w-[272px] gap-3 p-3">
          <PopoverTitle className="text-xs">Playback settings</PopoverTitle>
          {both && (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Tilt</div>
              <Select value={tilt.playTilt ?? 'y'} items={PLAY_TILTS} onValueChange={(next) => { if (next) setTiltSettings({ playTilt: next }) }}>
                <SelectTrigger aria-label="Playback tilt" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {PLAY_TILTS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <ScrubField label="Fade" title="How much neighbouring frames blend into each other" value={Math.round(tilt.transition * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => setTiltSettings({ transition: v / 100 })} />
          <ScrubField label="Speed" title="Playback speed multiplier; 1× takes two seconds for the full motion, before holds" value={speed} {...SPEED_LIMITS} unit="×" onChange={(next) => setTiltSettings({ speed: next })} />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Curve</span>
              <span className="tabular-nums" title="Time for flat to tilted and back, including holds">{Math.round(duration * 100) / 100} s / loop</span>
            </div>
            <Select value={curve} items={PLAYBACK_CURVES} onValueChange={(next) => { if (next) setTiltSettings({ curve: next }) }}>
              <SelectTrigger aria-label="Playback curve" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {PLAYBACK_CURVES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <svg viewBox="0 0 248 52" role="img" aria-label="Playback motion from flat to tilted and back" className="h-14 w-full rounded-md bg-muted/40 text-foreground">
              <path d="M4 44H244" fill="none" stroke="currentColor" strokeOpacity="0.12" />
              <path d={motion} fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <ScrubField label="Hold at ends" title="Pause at flat and at full tilt, in seconds at each end" value={holdSeconds} {...HOLD_LIMITS} unit="s" onChange={(next) => setTiltSettings({ holdSeconds: next })} />
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
  const position = (lens.cycleY ? (lens.dirY * angle) / lens.cycleY : 0) + (lens.cycleX ? (lens.dirX * angleX) / lens.cycleX : 0)
  const phase = cyclePhase(position, 1)
  const bars = (['y', 'x'] as const).filter((a) => respondsTo(lens, a)).map((a) => ({ axis: a, share: reachShare(lens, a) }))

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
                  'group absolute inset-y-1 overflow-hidden rounded-sm border bg-background',
                  i === current && 'ring-1 ring-primary/30',
                )}
                style={{ left: left + 1, width: Math.max(width - 2, 4) }}
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

          {bars.length > 1 && bars.map(({ axis, share }, row) => (
            // How far each tilt alone reaches from flat (frame 1's start) within the viewing range: forward
            // along the cycle, and backward from its end, where tilting the other way lands
            <div key={axis} className="pointer-events-none absolute h-0.5" style={{ top: 1 + row * 3, left: x(0), width: totalLength * pxPerUnit }}
              title={axis === 'y' ? 'Up/down reach' : 'Side reach'}>
              <div className={cn('absolute inset-y-0 left-0 rounded-full', axis === 'y' ? 'bg-sky-500' : 'bg-amber-500')} style={{ width: `${share * 100}%` }} />
              <div className={cn('absolute inset-y-0 right-0 rounded-full', axis === 'y' ? 'bg-sky-500' : 'bg-amber-500')} style={{ width: `${share * 100}%` }} />
            </div>
          ))}

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
