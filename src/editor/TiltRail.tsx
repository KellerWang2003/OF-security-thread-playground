import { Lamp, Lock, LockOpen, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { IconButton, Panel, ScrubField } from '../components/controls'
import { TILT_LIMIT, clamp } from '../lib/frames'
import { LIGHT_CONE_DEG, LIGHT_FULL_DEG } from '../lib/light'
import { padToTilt, tiltToPad } from '../lib/pad'
import type { LensState } from '../lib/lens'
import { moveFromRecording, nextRecordingName, planPath, playbackPlan, recordingFromSamples } from '../lib/moves'
import type { TiltSettings } from '../lib/types'
import { setRecording, setTilt, useTilt } from '../tilt/tilt'
import { saveTilt } from './playbackActions'

/** Width and height of the pad, in px */
const PAD_PX = 136
/** Outer width of the pad's panel (the pad, its p-1.5 padding and border), which the playback bar's controls line up with */
export const TILT_PANEL_PX = PAD_PX + 2 * 6 + 2

type Axis = 'x' | 'y'

/** The tilt each axis shows: where it is held, or where playback has it */
function shownTilt() {
  const s = useTilt.getState()
  return s.source === 'hold' ? { x: s.targetX, y: s.target } : { x: s.angleX, y: s.angle }
}

/** Holds the tilt, leaving any axis that isn't given (or is locked, when `respectLocks`) where it is */
function holdAt(next: { x?: number; y?: number }, limit: number, respectLocks = false) {
  const s = useTilt.getState()
  const shown = shownTilt()
  const x = next.x === undefined || (respectLocks && s.lockX) ? shown.x : clamp(next.x, -limit, limit)
  const y = next.y === undefined || (respectLocks && s.lockY) ? shown.y : clamp(next.y, -limit, limit)
  setTilt({ source: 'hold', target: y, targetX: x })
}

/**
 * Left edge of the canvas: a pad you press and drag in any direction to tilt every banknote (up/down
 * vertically, side to side horizontally), held where you let go. Each axis has a field for an exact angle
 * and a lock that keeps the pad and canvas drag off it. The lamp in its corner holds every banknote up to the light.
 */
export function TiltRail({ limit = TILT_LIMIT, playback }: {
  limit?: number
  /** The project's playback, drawn on the pad and added to by recording; absent in tests of the pad alone */
  playback?: { projectId: string; tilt: TiltSettings; lens: LensState }
}) {
  const recording = useTilt((s) => s.recording)
  return (
    <Panel className="absolute bottom-[108px] left-3 flex flex-col gap-1.5 rounded-[calc(var(--radius)+0.375rem+1px)] p-1.5">
      <Pad
        limit={limit}
        playback={playback}
        recording={recording}
        onRecorded={(samples) => {
          setRecording(false)
          if (!playback) return
          const recordings = playback.tilt.recordings ?? []
          const made = recordingFromSamples(samples, limit, nextRecordingName(recordings))
          if (!made) return
          // A new recording is what plays now, on its own; it also joins the saved recordings
          saveTilt(playback.projectId, { recordings: [...recordings, made], moves: [moveFromRecording(made)] })
          setTilt({ source: 'wobble' })
        }}
      />
      <div className="flex gap-1" style={{ width: PAD_PX }}>
        <AxisField axis="y" limit={limit} />
        <AxisField axis="x" limit={limit} />
      </div>
    </Panel>
  )
}

function useShown(axis: Axis) {
  return useTilt((s) => (axis === 'y' ? (s.source === 'hold' ? s.target : s.angle) : (s.source === 'hold' ? s.targetX : s.angleX)))
}

/** One axis's angle as a scrub field, with its lock inside: shown on hover, and always while locked */
function AxisField({ axis, limit }: { axis: Axis; limit: number }) {
  const shown = useShown(axis)
  const locked = useTilt((s) => (axis === 'x' ? s.lockX : s.lockY))
  const name = axis === 'y' ? 'up/down' : 'side'
  return (
    <ScrubField
      size="sm"
      className="group/axis flex-1"
      label={axis === 'y' ? '↕' : '↔'}
      title={axis === 'y' ? 'Up/down tilt' : 'Side tilt'}
      value={Math.round(shown)}
      min={-limit}
      max={limit}
      unit="°"
      onChange={(value) => holdAt({ [axis]: value }, limit)}
      trailing={
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                aria-label={`Lock ${name} tilt`}
                pressed={locked}
                onPressedChange={(on) => setTilt(axis === 'x' ? { lockX: on } : { lockY: on })}
                className={cn(
                  'mr-0.5 h-5 min-w-5 rounded px-0 aria-pressed:bg-transparent',
                  !locked && 'opacity-0 group-hover/axis:opacity-100 focus-visible:opacity-100',
                )}
              />
            }
          >
            {locked ? <Lock className="size-3" /> : <LockOpen className="size-3 text-muted-foreground" />}
          </TooltipTrigger>
          <TooltipContent>{locked ? `Unlock ${name} tilt` : `Lock ${name} tilt`}</TooltipContent>
        </Tooltip>
      }
    />
  )
}

/** The square maps ±limit on each axis: the centre is flat, the top edge full up tilt, the right edge full right */
function Pad({ limit, playback, recording, onRecorded }: {
  limit: number
  playback?: { tilt: TiltSettings; lens: LensState }
  recording: boolean
  onRecorded: (samples: { t: number; x: number; y: number }[]) => void
}) {
  const x = useShown('x')
  const y = useShown('y')
  const lockX = useTilt((s) => s.lockX)
  const lockY = useTilt((s) => s.lockY)
  const playing = useTilt((s) => s.source === 'wobble')
  // Back to flat only shows once there is somewhere to go back from; while playing it stays put rather than blink at each pass through flat
  const offFlat = playing || Math.round(x) !== 0 || Math.round(y) !== 0
  const pad = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const half = PAD_PX / 2
  const toPx = (deg: number) => half + tiltToPad(clamp(deg, -limit, limit) / limit) * (half - 6)
  const path = useMemo(() => {
    if (!playback) return ''
    const points = planPath(playbackPlan(playback.tilt, playback.lens))
    return points.map((p, i) => `${i ? 'L' : 'M'}${toPx(p.x).toFixed(1)},${toPx(-p.y).toFixed(1)}`).join(' ')
    // toPx only depends on limit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, limit])
  // The light coming through, and how far the lamp reaches: full near flat, gone past LIGHT_CONE_DEG
  const light = useTilt((s) => Math.round(s.light * 50) / 50)
  const backlit = useTilt((s) => s.backlit)
  const coneFull = toPx(LIGHT_FULL_DEG) - half
  const coneEdge = toPx(LIGHT_CONE_DEG) - half

  // While recording a drag, sample the held tilt every animation frame, so pauses are kept too
  const samples = useRef<{ t: number; x: number; y: number }[] | null>(null)
  useEffect(() => {
    if (!recording || !dragging) return
    samples.current = []
    let raf = 0
    const sample = () => {
      const s = useTilt.getState()
      samples.current?.push({ t: performance.now() / 1000, x: s.targetX, y: s.target })
      raf = requestAnimationFrame(sample)
    }
    raf = requestAnimationFrame(sample)
    return () => {
      cancelAnimationFrame(raf)
      const taken = samples.current
      samples.current = null
      if (taken) onRecorded(taken)
    }
    // Only a change in recording or dragging starts or ends a take
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, dragging])

  const follow = (clientX: number, clientY: number) => {
    const box = pad.current?.getBoundingClientRect()
    if (!box) return
    // Pointer offset as a share of the pad's reach, bent so the centre is fine and the edges fast
    const reach = half - 6
    const u = clamp((clientX - box.left - half) / reach, -1, 1)
    const v = clamp((box.top + half - clientY) / reach, -1, 1)
    holdAt({ x: padToTilt(u) * limit, y: padToTilt(v) * limit }, limit, true)
  }

  return (
    <div
      ref={pad}
      role="group"
      aria-label="Tilt"
      tabIndex={0}
      className={cn(
        'relative touch-none overflow-hidden rounded-md bg-muted outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50',
        dragging ? 'cursor-grabbing' : 'cursor-crosshair',
        recording && 'ring-2 ring-destructive/70',
      )}
      style={{
        width: PAD_PX,
        height: PAD_PX,
        backgroundImage: 'radial-gradient(circle, color-mix(in oklch, var(--foreground) 22%, transparent) 1px, transparent 1.2px)',
        backgroundSize: `${PAD_PX / 8}px ${PAD_PX / 8}px`,
        backgroundPosition: `${PAD_PX / 16}px ${PAD_PX / 16}px`,
      }}
      onPointerDown={(e) => {
        // Only the primary button drags; a right-click opens a context menu and never sends pointerup
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
        follow(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (!dragging) return
        // A release that never reached us (outside the window, a lost capture): stop following the pointer
        if (e.buttons === 0) return setDragging(false)
        follow(e.clientX, e.clientY)
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onLostPointerCapture={() => setDragging(false)}
      onDoubleClick={() => holdAt({ x: 0, y: 0 }, limit, true)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 5 : 1
        const s = shownTilt()
        if (e.key === 'ArrowUp') holdAt({ y: Math.round(s.y) + step }, limit, true)
        else if (e.key === 'ArrowDown') holdAt({ y: Math.round(s.y) - step }, limit, true)
        else if (e.key === 'ArrowRight') holdAt({ x: Math.round(s.x) + step }, limit, true)
        else if (e.key === 'ArrowLeft') holdAt({ x: Math.round(s.x) - step }, limit, true)
        else return
        e.preventDefault()
      }}
    >
      {light > 0 && (
        // Warm while held to the light, brightest where the lamp is fully behind the banknote
        <div aria-hidden className="pointer-events-none absolute inset-0" data-light-cone=""
          style={{ opacity: light, background: `radial-gradient(circle at ${half}px ${half}px, rgb(251 191 36 / 0.55) ${coneFull}px, rgb(251 191 36 / 0) ${coneEdge}px)` }} />
      )}
      {path && (
        <svg className="pointer-events-none absolute inset-0" width={PAD_PX} height={PAD_PX} aria-hidden>
          <path d={path} fill="none" stroke="var(--primary)" strokeOpacity={playing ? 0.55 : 0.3} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
      {/* Flat crosshair; a locked axis's line turns solid to show the dot stays on it */}
      <div className={cn('pointer-events-none absolute inset-x-0 h-px', lockY ? 'bg-primary/60' : 'bg-foreground/15')} style={{ top: toPx(-y) - 0.5 }} />
      <div className={cn('pointer-events-none absolute inset-y-0 w-px', lockX ? 'bg-primary/60' : 'bg-foreground/15')} style={{ left: toPx(x) - 0.5 }} />
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-1 -translate-1/2 rounded-full bg-foreground/40" />
      <div
        className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-background bg-primary shadow"
        style={{ left: toPx(x), top: toPx(-y) }}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              aria-label="Backlit"
              variant="outline"
              size="sm"
              pressed={backlit}
              onPressedChange={(on) => setTilt({ backlit: on })}
              // A press here is not a drag on the pad
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              className="absolute top-1 left-1 size-6 min-w-6 rounded-[min(var(--radius-md),10px)] bg-background/95 p-0 aria-pressed:border-amber-400 aria-pressed:bg-amber-300 aria-pressed:text-amber-950 aria-pressed:hover:bg-amber-200"
            />
          }
        >
          <Lamp className="size-3" />
        </TooltipTrigger>
        <TooltipContent>{backlit ? 'Back to reflected light (tap L, or hold to peek)' : 'Hold up to the light (tap L, or hold to peek)'}</TooltipContent>
      </Tooltip>
      {offFlat && (
        <IconButton
          label="Back to flat"
          variant="outline"
          size="icon-xs"
          className="absolute top-1 right-1 bg-background/95"
          // A press here is not a drag on the pad
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => setTilt({ source: 'hold', target: 0, targetX: 0 })}
        >
          <RotateCcw />
        </IconButton>
      )}
    </div>
  )
}
