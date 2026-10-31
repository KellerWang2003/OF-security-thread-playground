import { ArrowLeft, ArrowRight, ImagePlus, MoreHorizontal, Palette, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { TILT_LIMIT, clamp, formatDeg, frameMix, sliceRange, tiltRange } from '../lib/frames'
import { pickFiles } from '../lib/images'
import { MAX_FRAMES, MIN_FRAMES, SPAN_LIMITS } from '../lib/notes'
import type { Frame, Note } from '../lib/types'
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

const PAD = 12
const ZOOM = { min: 3, max: 40, initial: 10 }

/**
 * Bottom of the canvas: play and pause, then the selected note's frames on a timeline measured in degrees
 * of tilt, like clips on a track. A frame's width is how long it shows; drag its right edge to change
 * that. Drag the ruler or a frame to scrub, scroll to move along, ⌘-scroll to zoom.
 */
export function TimelineBar({ note, noteRef, besidePanel }: { note: Note; noteRef: NoteRef | undefined; besidePanel: boolean }) {
  const scroller = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ mode: 'scrub' } | { mode: 'resize'; frameId: string; startX: number; startSpan: number } | null>(null)
  const [pxPerDeg, setPxPerDeg] = useState(ZOOM.initial)
  const { angle, source, target } = useTilt()
  const { frames, tilt } = note
  const spans = frames.map((f) => f.spanDeg)
  const range = tiltRange(spans)
  const cycle = 2 * range
  const { current } = frameMix(angle, spans, tilt.transition)
  const playing = source === 'wobble'
  // The track covers the whole tilt, so you can see and scrub into the repeats past the main cycle
  const extent = Math.max(TILT_LIMIT, range)
  const x = (deg: number) => PAD + (deg + extent) * pxPerDeg
  // Which repeat of the cycle the playhead is in; 0 is the editable one around flat
  const playheadRepeat = cycle > 0 ? Math.floor((angle + range) / cycle) : 0
  const repeats: number[] = []
  if (cycle > 0) for (let k = -Math.ceil(extent / cycle) - 1; k <= Math.ceil(extent / cycle) + 1; k++) repeats.push(k)

  // Wheel: ⌘/Ctrl zooms the timeline, a plain vertical wheel scrolls it sideways
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setPxPerDeg((p) => clamp(p * Math.exp(-clamp(e.deltaY, -40, 40) * 0.01), ZOOM.min, ZOOM.max))
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        element.scrollLeft += e.deltaY
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  // Keep flat (0°) in the middle when the timeline opens or is zoomed
  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollLeft = PAD + extent * pxPerDeg - element.clientWidth / 2
  }, [pxPerDeg, extent])

  const scrubTo = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect) return
    setTilt({ source: 'slider', target: clamp((clientX - rect.left - PAD) / pxPerDeg - extent, -TILT_LIMIT, TILT_LIMIT) })
  }

  // Ruler ticks every 5° (every degree when zoomed in), labelled every 15° (every 5° when zoomed in)
  const minor = pxPerDeg >= 14 ? 1 : 5
  const major = pxPerDeg >= 18 ? 5 : 15
  const ticks: number[] = []
  for (let d = Math.ceil(-extent / minor) * minor; d <= extent + 1e-6; d += minor) ticks.push(d)

  const starts = spans.map((_, i) => sliceRange(i, spans)[0])

  return (
    <Panel className={cn('absolute bottom-3 left-3 flex h-[104px] items-stretch gap-2 p-2', besidePanel ? 'right-[268px]' : 'right-3')}>
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

      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden rounded-lg bg-muted/40">
        <div
          ref={track}
          className="relative h-full touch-none overflow-hidden select-none"
          style={{ width: x(extent) + PAD }}
          onPointerDown={(e) => {
            const el = e.target as HTMLElement
            if (el.closest('button') || el.closest('[role=menu]')) return
            e.currentTarget.setPointerCapture(e.pointerId)
            const handle = el.closest<HTMLElement>('[data-resize]')
            const frame = frames.find((f) => f.id === handle?.dataset.resize)
            if (frame && noteRef) {
              gesture.current = { mode: 'resize', frameId: frame.id, startX: e.clientX, startSpan: frame.spanDeg }
            } else {
              gesture.current = { mode: 'scrub' }
              scrubTo(e.clientX)
            }
          }}
          onPointerMove={(e) => {
            const g = gesture.current
            if (g?.mode === 'scrub') scrubTo(e.clientX)
            if (g?.mode === 'resize' && noteRef) {
              const spanDeg = clamp(Math.round(g.startSpan + (e.clientX - g.startX) / pxPerDeg), SPAN_LIMITS.min, SPAN_LIMITS.max)
              updateFrame(noteRef, g.frameId, { spanDeg })
            }
          }}
          onPointerUp={() => {
            gesture.current = null
          }}
        >
          <div className="absolute inset-x-0 top-0 h-5 cursor-ew-resize border-b">
            {ticks.map((d) => {
              const isMajor = Math.abs(d % major) < 1e-6
              return (
                <div key={d} className="absolute bottom-0" style={{ left: x(d) }}>
                  <div className={cn('w-px bg-foreground/25', isMajor ? 'h-2' : 'h-1')} />
                  {isMajor && (
                    <span className="absolute bottom-2 -translate-x-1/2 text-[9px] text-muted-foreground tabular-nums">
                      {formatDeg(d)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {repeats.flatMap((k) =>
            frames.map((frame, i) => {
            const from = (starts.at(i) ?? -range) + k * cycle
            if (from + frame.spanDeg < -extent || from > extent) return null
            const left = x(from)
            const width = frame.spanDeg * pxPerDeg
            const main = k === 0
            return (
              <div
                key={`${k}-${frame.id}`}
                className={cn(
                  'group absolute top-6 bottom-1 overflow-hidden rounded-md border bg-background',
                  !main && 'opacity-45',
                  i === current && k === playheadRepeat && 'ring-2 ring-primary/60',
                )}
                style={{ left: left + 1, width: Math.max(width - 2, 4) }}
              >
                <FrameThumb frame={frame} />
                {width > 28 && (
                  <span className="absolute top-0.5 left-1 rounded bg-background/80 px-1 text-[10px] font-medium tabular-nums">
                    {i + 1}
                  </span>
                )}
                {noteRef && main && (
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
            }),
          )}

          {cycle > 0 && (
            // Marks the editable cycle around flat
            <div className="pointer-events-none absolute top-5 h-0.5 rounded-full bg-primary/40" style={{ left: x(-range), width: cycle * pxPerDeg }} />
          )}

          <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary" style={{ left: x(clamp(angle, -extent, extent)) }}>
            <div className="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-primary" />
          </div>
        </div>
      </div>

      {noteRef && (
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
            const [file] = await pickFiles()
            if (file) await replaceFrameImage(noteRef, frame.id, file)
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
