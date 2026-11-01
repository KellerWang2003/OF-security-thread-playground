import { TILT_LIMIT, clamp, frameMix } from './frames'
import type { Frame, Note, TiltSettings } from './types'

/**
 * Lenticular lenses at any angle. Ridges respond only to tilt across them, so one lens plays one sequence of
 * frames: every tilt runs through the same frames, only faster, slower or reversed. Each tilt therefore has
 * its own cycle (degrees for one pass), and the lens angle follows from the two: tan(angle) = ↕ cycle ÷ ↔ cycle.
 *
 * Frame 1 is always flat. A tilt's position along the cycle is its angle ÷ its cycle, signed by which way it
 * plays 1 → 5; side and up/down tilt add up, which is the same as tilt across the ridges for a real lens.
 */

export type LensEffect = 'updown' | 'side' | 'both' | 'reveal' | 'custom'
export type Axis = 'x' | 'y'
export interface Tilt2 {
  /** Side tilt, degrees; positive tilts right */
  x: number
  /** Up/down tilt, degrees; positive tilts up */
  y: number
}

export const FLAT: Tilt2 = { x: 0, y: 0 }
export const LENS_EFFECTS: { value: LensEffect; label: string }[] = [
  { value: 'updown', label: 'Up/down' },
  { value: 'side', label: 'Side to side' },
  { value: 'both', label: 'Both ways' },
  { value: 'reveal', label: 'Reveal on one tilt' },
  { value: 'custom', label: 'Custom' },
]
export const VIEW_LIMITS = { min: 10, max: 90 }
/** Playback never turns a banknote further than this, however long a cycle is */
export const SWEEP_MAX = 120

/** The lens as the frames see it: each tilt's cycle (null when that tilt does nothing) and direction */
export interface LensState {
  effect: LensEffect
  /** Degrees of up/down tilt for one pass, or null when up/down does nothing */
  cycleY: number | null
  /** Degrees of side tilt for one pass, or null when side tilt does nothing */
  cycleX: number | null
  /** +1 when tilting up plays 1 → 5, −1 when tilting down does */
  dirY: 1 | -1
  /** +1 when tilting right plays 1 → 5, −1 when tilting left does */
  dirX: 1 | -1
  /** How far viewers tilt, each way */
  viewDeg: number
  /** For Reveal: the tilt that plays every frame */
  revealAxis: Axis
}

const lengthsOf = (frames: Pick<Frame, 'length'>[]) => frames.map((f) => Math.max(0, f.length))

/** Frame edges along one cycle, 0 to 1 */
export function frameEdges(frames: Pick<Frame, 'length'>[]) {
  const lengths = lengthsOf(frames)
  const total = lengths.reduce((a, b) => a + b, 0) || 1
  const edges = [0]
  for (const l of lengths) edges.push((edges.at(-1) ?? 0) + l / total)
  edges[edges.length - 1] = 1
  return edges
}

/**
 * The slowest cycle a tilt can have while still never finishing the sequence within ±viewDeg: some frame in
 * the middle stays out of reach both ways. Null with fewer than 3 frames, where every frame touches flat.
 * Frame 1 starts at flat and the last frame ends there (the loop), so only frames between can be missed.
 */
export function revealCycle(frames: Pick<Frame, 'length'>[], viewDeg: number) {
  const edges = frameEdges(frames)
  let best = 0
  for (let i = 1; i < frames.length - 1; i++) best = Math.max(best, Math.min(edges.at(i) ?? 0, 1 - (edges.at(i + 1) ?? 1)))
  if (best <= 0) return null
  // A whole degree past the limit, so the hidden frames stay hidden at exactly ±viewDeg
  return Math.floor(viewDeg / best) + 1
}

/** The lens settings a note carries, with the defaults a project from before lenses gets */
export function lensState(tilt: TiltSettings, frames: Pick<Frame, 'length'>[] = []): LensState {
  const effect = tilt.effect ?? 'updown'
  const viewDeg = clamp(tilt.viewDeg ?? TILT_LIMIT, VIEW_LIMITS.min, VIEW_LIMITS.max)
  const dirY = tilt.runY === 'down' ? -1 : 1
  const dirX = tilt.runX === 'left' ? -1 : 1
  const revealAxis = tilt.revealAxis ?? 'y'
  const y = tilt.cycleDeg
  const x = tilt.cycleXDeg ?? tilt.cycleDeg
  const base = { effect, dirY, dirX, viewDeg, revealAxis } as const
  switch (effect) {
    case 'side':
      return { ...base, cycleY: null, cycleX: x }
    case 'both':
      return { ...base, cycleY: y, cycleX: x }
    case 'reveal': {
      const slow = revealCycle(frames, viewDeg)
      return revealAxis === 'y'
        ? { ...base, cycleY: y, cycleX: slow ?? x }
        : { ...base, cycleY: slow ?? y, cycleX: x }
    }
    case 'custom':
      return { ...base, cycleY: tilt.yOn === false ? null : y, cycleX: tilt.cycleXDeg ?? null }
    default:
      return { ...base, cycleY: y, cycleX: null }
  }
}

/** Position along the cycle for a tilt, in cycles from flat (not wrapped) */
export function cyclePosition(lens: LensState, tilt: Tilt2) {
  const y = lens.cycleY ? (lens.dirY * tilt.y) / lens.cycleY : 0
  const x = lens.cycleX ? (lens.dirX * tilt.x) / lens.cycleX : 0
  return y + x
}

/** Which frames show at a tilt: the same crossfade maths as before, on a one-cycle timeline */
export function lensMix(note: Pick<Note, 'frames' | 'tilt'>, tilt: Tilt2, lens = lensState(note.tilt, note.frames)) {
  const lengths = lengthsOf(note.frames)
  const total = lengths.reduce((a, b) => a + b, 0) || 1
  return frameMix(cyclePosition(lens, tilt), lengths.map((l) => l / total), note.tilt.transition)
}

/** The ridge angle from the banknote's horizontal (0 = horizontal ridges, 90 = vertical), signed by lean */
export function lensAngle(lens: Pick<LensState, 'cycleX' | 'cycleY' | 'dirX' | 'dirY'>) {
  if (lens.cycleX == null) return 0
  if (lens.cycleY == null) return 90
  const angle = (Math.atan2(lens.cycleY, lens.cycleX) * 180) / Math.PI
  return lens.dirX === lens.dirY ? angle : -angle
}

/** Degrees of tilt across the ridges for one pass */
export function lensCycle(lens: Pick<LensState, 'cycleX' | 'cycleY'>) {
  if (lens.cycleX == null) return lens.cycleY ?? 0
  if (lens.cycleY == null) return lens.cycleX
  return (lens.cycleX * lens.cycleY) / Math.hypot(lens.cycleX, lens.cycleY)
}

/** The two tilt cycles a lens angle and lens cycle give (the inverse of lensAngle and lensCycle) */
export function cyclesFromLens(angleDeg: number, cycleDeg: number) {
  const a = (Math.abs(angleDeg) * Math.PI) / 180
  const sin = Math.sin(a), cos = Math.cos(a)
  return { cycleX: sin < 1e-6 ? null : cycleDeg / sin, cycleY: cos < 1e-6 ? null : cycleDeg / cos }
}

/** Which axes respond to tilt */
export const respondsTo = (lens: LensState, axis: Axis) => (axis === 'x' ? lens.cycleX != null : lens.cycleY != null)

/**
 * Which frames one tilt alone shows within ±viewDeg (by index). A frame shows when the tilt crosses any part
 * of it; at exactly ±viewDeg it counts as reached.
 */
export function framesReached(note: Pick<Note, 'frames' | 'tilt'>, axis: Axis, lens = lensState(note.tilt, note.frames)) {
  const reached = new Set<number>()
  const cycle = axis === 'x' ? lens.cycleX : lens.cycleY
  if (!cycle) return reached
  const reach = lens.viewDeg / cycle
  const edges = frameEdges(note.frames)
  if (reach >= 1) {
    note.frames.forEach((_, i) => reached.add(i))
    return reached
  }
  note.frames.forEach((_, i) => {
    const a = edges.at(i) ?? 0
    const b = edges.at(i + 1) ?? 1
    // Forward from flat covers [0, reach], backward covers [1 − reach, 1]
    if (a <= reach || b >= 1 - reach) reached.add(i)
  })
  return reached
}

/** Each axis's reach from flat, as a share of the cycle (0 when that tilt does nothing) */
export const reachShare = (lens: LensState, axis: Axis) => {
  const cycle = axis === 'x' ? lens.cycleX : lens.cycleY
  return cycle ? Math.min(1, lens.viewDeg / cycle) : 0
}

/**
 * The tilt that puts a cycle position (0 to 1) under the playhead: along the up/down tilt when it responds,
 * otherwise along the side tilt. Used by the timeline to scrub.
 */
export function tiltForPosition(lens: LensState, position: number): Tilt2 {
  if (lens.cycleY) return { x: 0, y: position * lens.cycleY * lens.dirY }
  if (lens.cycleX) return { x: position * lens.cycleX * lens.dirX, y: 0 }
  return FLAT
}

/** How far playback turns each axis: through its whole cycle in the 1 → 5 direction, within SWEEP_MAX */
export function sweepTarget(lens: LensState, axis: Axis): Tilt2 {
  if (axis === 'y') return lens.cycleY ? { x: 0, y: Math.min(lens.cycleY, SWEEP_MAX) * lens.dirY } : FLAT
  return lens.cycleX ? { x: Math.min(lens.cycleX, SWEEP_MAX) * lens.dirX, y: 0 } : FLAT
}

/** The axes playback sweeps, in order */
export function sweepAxes(tilt: TiltSettings, lens: LensState): Axis[] {
  const choice = tilt.playTilt ?? 'y'
  const axes: Axis[] = choice === 'both' ? ['y', 'x'] : [choice]
  const live = axes.filter((a) => respondsTo(lens, a))
  if (live.length) return live
  return respondsTo(lens, 'y') ? ['y'] : ['x']
}

/** The cycle the bottom bar edits: the one tilt that responds, or the one playback sweeps first */
export function primaryAxis(tilt: TiltSettings, lens: LensState): Axis {
  if (!respondsTo(lens, 'y')) return 'x'
  if (!respondsTo(lens, 'x')) return 'y'
  if (lens.effect === 'reveal') return lens.revealAxis
  return tilt.playTilt === 'x' ? 'x' : 'y'
}
