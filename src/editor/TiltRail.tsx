import { Lock, LockOpen, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { IconButton, Panel } from '../components/controls'
import { TILT_LIMIT, clamp } from '../lib/frames'
import type { LensState } from '../lib/lens'
import { MOVES_MAX, editableMoves, gestureFromRecording, movesOf, planPath, playbackPlan } from '../lib/moves'
import type { TiltSettings } from '../lib/types'
import { setRecording, setTilt, useTilt } from '../tilt/tilt'
import { saveMoves } from './playbackActions'

/** Width and height of the pad, in px */
const PAD_PX = 136

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
 * and a lock that keeps the pad and canvas drag off it.
 */
export function TiltRail({ limit = TILT_LIMIT, playback }: {
  limit?: number
  /** The project's playback, drawn on the pad and added to by recording; absent in tests of the pad alone */
  playback?: { projectId: string; tilt: TiltSettings; lens: LensState }
}) {
  const recording = useTilt((s) => s.recording)
  return (
    <Panel className="absolute top-1/2 left-3 flex -translate-y-1/2 flex-col gap-1.5 rounded-[calc(var(--radius)+0.375rem+1px)] p-1.5">
      <Pad
        limit={limit}
        playback={playback}
        recording={recording}
        onRecorded={(samples) => {
          setRecording(false)
          if (!playback || movesOf(playback.tilt, playback.lens).length >= MOVES_MAX) return
          const move = gestureFromRecording(samples, limit)
          if (!move) return
          saveMoves(playback.projectId, [...editableMoves(playback.tilt, playback.lens), move])
          setTilt({ source: 'wobble' })
        }}
      />
      <div className="flex items-end gap-1">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <AxisRow axis="y" limit={limit} />
          <AxisRow axis="x" limit={limit} />
        </div>
          <IconButton label="Back to flat" size="icon-sm" onClick={() => setTilt({ source: 'hold', target: 0, targetX: 0 })}>
            <RotateCcw />
          </IconButton>
      </div>
    </Panel>
  )
}

function useShown(axis: Axis) {
  return useTilt((s) => (axis === 'y' ? (s.source === 'hold' ? s.target : s.angle) : (s.source === 'hold' ? s.targetX : s.angleX)))
}

function AxisRow({ axis, limit }: { axis: Axis; limit: number }) {
  const locked = useTilt((s) => (axis === 'x' ? s.lockX : s.lockY))
  const name = axis === 'y' ? 'up/down' : 'side'
  return (
    <div className="flex items-center gap-1">
      <span className="w-3 shrink-0 text-center text-xs text-muted-foreground" title={axis === 'y' ? 'Up/down tilt' : 'Side tilt'}>
        {axis === 'y' ? '↕' : '↔'}
      </span>
      <AngleField axis={axis} limit={limit} />
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              size="sm"
              aria-label={`Lock ${name} tilt`}
              pressed={locked}
              onPressedChange={(on) => setTilt(axis === 'x' ? { lockX: on } : { lockY: on })}
            />
          }
        >
          {locked ? <Lock /> : <LockOpen className="text-muted-foreground" />}
        </TooltipTrigger>
        <TooltipContent>{locked ? `Unlock ${name} tilt` : `Lock ${name} tilt`}</TooltipContent>
      </Tooltip>
    </div>
  )
}

function AngleField({ axis, limit }: { axis: Axis; limit: number }) {
  const shown = useShown(axis)
  const [draft, setDraft] = useState<string | null>(null)
  const label = axis === 'y' ? 'Up/down tilt angle' : 'Side tilt angle'
  return (
    <div className="relative min-w-0 flex-1" title={label}>
      <Input
        aria-label={label}
        type="number"
        inputMode="decimal"
        className="h-7 w-full px-0.5 pr-2.5 text-center text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
        value={draft ?? String(Math.round(shown))}
        min={-limit}
        max={limit}
        onFocus={(e) => {
          setDraft(String(Math.round(shown)))
          e.currentTarget.select()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const value = Number(draft)
          if (draft !== null && draft !== '' && Number.isFinite(value)) holdAt({ [axis]: value }, limit)
          setDraft(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          }
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-[10px] text-muted-foreground">°</span>
    </div>
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
  const pad = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const half = PAD_PX / 2
  const toPx = (deg: number) => half + (clamp(deg, -limit, limit) / limit) * (half - 6)
  const path = useMemo(() => {
    if (!playback) return ''
    const points = planPath(playbackPlan(playback.tilt, playback.lens))
    return points.map((p, i) => `${i ? 'L' : 'M'}${toPx(p.x).toFixed(1)},${toPx(-p.y).toFixed(1)}`).join(' ')
    // toPx only depends on limit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, limit])

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
    const scale = limit / (half - 6)
    holdAt({ x: (clientX - box.left - half) * scale, y: (box.top + half - clientY) * scale }, limit, true)
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
    </div>
  )
}
