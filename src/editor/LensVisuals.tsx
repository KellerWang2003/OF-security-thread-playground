import { useEffect, useState, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { frameEdges, lensMix, type Axis, type LensState, type Tilt2 } from '../lib/lens'
import { FRAME_COLORS } from '../lib/notes'
import { playbackEase } from '../lib/playback'
import type { Note } from '../lib/types'

export const swatch = (note: Pick<Note, 'frames'>, i: number) => {
  const frame = note.frames.at(i)
  return frame?.kind === 'color' ? frame.color : FRAME_COLORS[i % FRAME_COLORS.length]
}

/** Seconds since mount, ticking at about 30 fps while `running` */
export function useClock(running = true) {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = 0
    const start = performance.now()
    const tick = (now: number) => {
      if (now - last > 33) {
        last = now
        setT((now - start) / 1000)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running])
  return t
}

/** One rock out and back, 0 → 1 → 0 over `seconds`, eased */
const rock = (t: number, seconds: number) => {
  const p = (t % seconds) / seconds
  return playbackEase(p < 0.5 ? p * 2 : 2 - p * 2, 'smooth')
}

/**
 * The tilt a preview shows at time t: up, back, down, back on the up/down tilt, then the same side to side.
 * `only` keeps it to one tilt and one direction (the sign), for showing which way frames run.
 */
export function previewTilt(t: number, range: number, only?: { axis: Axis; sign: 1 | -1 }): Tilt2 {
  if (only) {
    const k = rock(t, 2.4) * range * only.sign
    return only.axis === 'y' ? { x: 0, y: k } : { x: k, y: 0 }
  }
  const phase = Math.floor(t / 1.6) % 4
  const k = rock(t, 1.6) * range * (phase % 2 === 0 ? 1 : -1)
  return phase < 2 ? { x: 0, y: k } : { x: k, y: 0 }
}

/**
 * A tiny banknote tilting through `tilt`, its thread showing the frame the lens gives there. Same idea as the
 * canvas, without the artwork: enough to see which tilt changes frames and how fast.
 */
export function MiniNote({ note, lens, tilt, className, label }: {
  note: Pick<Note, 'frames' | 'tilt'>
  lens: LensState
  tilt: Tilt2
  className?: string
  /** Shows the frame number on the thread */
  label?: boolean
}) {
  const current = lensMix(note, tilt, lens).current
  return (
    <div className={cn('flex items-center justify-center [perspective:160px]', className)}>
      <div className="relative h-[60%] w-[56%] rounded-[3px] bg-muted-foreground/30 shadow-sm"
        style={{ transform: `rotateX(${tilt.y * 0.75}deg) rotateY(${tilt.x * 0.75}deg)` }}>
        <div className="absolute inset-y-0 left-1/2 flex w-[22%] -translate-x-1/2 items-center justify-center text-[9px] font-semibold text-white mix-blend-normal"
          style={{ backgroundColor: swatch(note, current) }}>
          {label && current + 1}
        </div>
      </div>
    </div>
  )
}

/** Which way a preview is tilting, as an arrow in the corner */
export function TiltArrow({ tilt, className }: { tilt: Tilt2; className?: string }) {
  const y = Math.abs(tilt.y) > Math.abs(tilt.x)
  const arrow = y ? (tilt.y >= 0 ? '↑' : '↓') : (tilt.x >= 0 ? '→' : '←')
  return <span className={cn('pointer-events-none absolute top-0.5 right-1 text-[10px] leading-none text-muted-foreground', className)}>{arrow}</span>
}

/**
 * One cycle drawn as a bar from flat: each frame's colour for as long as it shows, starting partway into
 * frame 1 when flat sits at its centre, with the degrees of tilt it takes.
 */
export function CycleBar({ note, offset, cycleDeg }: { note: Pick<Note, 'frames'>; offset: number; cycleDeg: number }) {
  const edges = frameEdges(note.frames)
  const pieces: { i: number; from: number; to: number }[] = []
  // Walk one cycle from flat, splitting where frames change and where the loop wraps
  let at = 0
  while (at < 1 - 1e-9) {
    const pos = (offset + at) % 1
    const i = Math.max(0, edges.findIndex((e, k) => k > 0 && pos < e - 1e-9) - 1)
    const end = Math.min(1, at + ((edges.at(i + 1) ?? 1) - pos))
    pieces.push({ i, from: at, to: end })
    at = end
  }
  return (
    <div className="flex w-44 flex-col gap-1">
      <div className="flex h-5 overflow-hidden rounded-sm">
        {pieces.map((p, k) => (
          <div key={k} className="flex items-center justify-center text-[9px] font-semibold text-white"
            style={{ width: `${(p.to - p.from) * 100}%`, backgroundColor: swatch(note, p.i) }}>
            {p.to - p.from > 0.06 && p.i + 1}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] opacity-70 tabular-nums">
        <span>flat</span>
        <span>{Math.round(cycleDeg)}°</span>
      </div>
    </div>
  )
}

/**
 * A field label that explains itself on hover with a small picture and one line. The label stays terse in the
 * panel; first-time users can see what it means without any text in the way.
 */
export function Explain({ label, picture, caption, children }: { label?: ReactNode; picture?: ReactNode; caption: string; children?: ReactNode }) {
  return (
    <Tooltip>
      {children ? (
        // Wraps a whole control (a scrub field), so hovering anywhere on it explains it
        <TooltipTrigger render={<div className="min-w-0" />}>{children}</TooltipTrigger>
      ) : (
        <TooltipTrigger render={<span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-[3px]" />}>
          {label}
        </TooltipTrigger>
      )}
      <TooltipContent side="left" className="flex-col items-start gap-2 py-2">
        {picture}
        <span className="max-w-44 leading-snug">{caption}</span>
      </TooltipContent>
    </Tooltip>
  )
}
