import { TILT_LIMIT, frameMix } from './frames'
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
/** The effects by ridge angle, with what each does in a line */
export const LENS_EFFECTS: { value: LensEffect; label: string; description: string }[] = [
  { value: 'updown', label: 'Horizontal', description: 'Frames change as you tilt up and down' },
  { value: 'side', label: 'Vertical', description: 'Frames change as you tilt side to side' },
  { value: 'both', label: 'Diagonal 45°', description: 'Frames change the same on both tilts' },
  { value: 'reveal', label: 'Partial reveal on one tilt', description: 'One tilt shows every frame; the other never shows the outer ones' },
  { value: 'custom', label: 'Custom angle', description: 'Set the ridge angle and cycle yourself' },
]
/** Playback never turns a banknote further than a viewer would, however long a cycle is */
export const SWEEP_MAX = TILT_LIMIT
/** Partial reveal keeps its hidden frames hidden at every angle a real banknote can be tilted to */
export const HIDE_LIMIT = TILT_LIMIT
/** Partial reveal's default allowance for a hand that drifts onto the fast tilt while sweeping the slow one */
export const DEFAULT_WOBBLE = 5

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
  /** How far viewers tilt, each way: fixed at TILT_LIMIT, edge-on */
  viewDeg: number
  /** For Reveal: the tilt that plays every frame */
  revealAxis: Axis
  /** For Reveal: degrees of fast tilt a viewer may drift by while sweeping the slow tilt, with frames still hidden */
  wobble: number
  /** For Reveal: false when the fast cycle is too short for the wobble, so no slow cycle can keep frames hidden */
  revealSafe: boolean
  /** Where flat sits along the cycle (0 to 1): 0 at the start of frame 1, or half of frame 1 for its centre */
  offset: number
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

/** Rounding slack for frame edges, which are sums of floating-point shares */
const EPS = 1e-9

/** Which frames (by index) a tilt reaching `reach` of the cycle either way from flat (at `offset`) shows */
function reachedAt(edges: number[], offset: number, reach: number) {
  const reached = new Set<number>()
  if (reach >= 1) {
    for (let i = 0; i < edges.length - 1; i++) reached.add(i)
    return reached
  }
  // Forward covers [offset, offset + reach], backward [offset − reach, offset], each wrapping round the loop
  const spans: [number, number][] = []
  const add = (lo: number, hi: number) => {
    // The loop's start and end are the same place, so touching one touches the other
    if (lo < EPS) spans.push([lo + 1, 1], [Math.max(0, lo), hi])
    else if (hi > 1 - EPS) spans.push([lo, 1], [0, hi - 1])
    else spans.push([lo, hi])
  }
  add(offset, offset + reach)
  add(offset - reach, offset)
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges.at(i) ?? 0, b = edges.at(i + 1) ?? 1
    if (spans.some(([lo, hi]) => a <= hi + EPS && b >= lo - EPS)) reached.add(i)
  }
  return reached
}

/** Distances from flat to every frame edge, either way: the reaches at which another frame comes into view */
function breakpoints(edges: number[], offset: number) {
  const out = new Set<number>()
  for (const e of edges) {
    const d = Math.round(((((e - offset) % 1) + 1) % 1) / EPS) * EPS
    if (d > EPS) out.add(d)
    if (1 - d > EPS) out.add(Math.round((1 - d) / EPS) * EPS)
  }
  return [...out].toSorted((a, b) => a - b)
}

/** How many frames a slow tilt can keep out of view, from fewest to most (empty when it can hide none) */
export function revealOptions(frames: Pick<Frame, 'length'>[], offset = 0) {
  const edges = frameEdges(frames)
  const counts = new Set<number>()
  // Just above zero reach, then just past each edge
  for (const r of [1e-6, ...breakpoints(edges, offset)]) {
    const hidden = frames.length - reachedAt(edges, offset, r).size
    if (hidden > 0) counts.add(hidden)
  }
  return [...counts].toSorted((a, b) => a - b)
}

/**
 * The slowest cycle a tilt can have while keeping at least `hide` frames out of view within ±viewDeg (the
 * fewest possible when not given). `drift` is a share of the cycle already used up by wobble on the other
 * tilt, so the hidden frames stay hidden even when the viewer's hand isn't straight. Null when no tilt can
 * hide that many.
 */
export function revealCycle(frames: Pick<Frame, 'length'>[], viewDeg: number, hide?: number, offset = 0, drift = 0) {
  const options = revealOptions(frames, offset)
  const target = hide && options.includes(hide) ? hide : options.at(0)
  if (!target) return null
  const edges = frameEdges(frames)
  // The first reach at which fewer than `target` frames stay hidden: the cycle must keep viewDeg short of it
  const limit = breakpoints(edges, offset).find((r) => frames.length - reachedAt(edges, offset, r).size < target)
  if (!limit || limit - drift <= EPS) return null
  // A whole degree past the limit, so the hidden frames stay hidden at exactly ±viewDeg
  return Math.floor(viewDeg / (limit - drift) + EPS) + 1
}

/** The shortest fast cycle that leaves Partial reveal room to hide frames with this much wobble */
export function revealMinFast(frames: Pick<Frame, 'length'>[], offset: number, wobble: number) {
  const options = revealOptions(frames, offset)
  const target = options.at(0)
  if (!target || wobble <= 0) return 0
  const edges = frameEdges(frames)
  const limit = breakpoints(edges, offset).find((r) => frames.length - reachedAt(edges, offset, r).size < target)
  return limit ? Math.floor(wobble / limit + EPS) + 1 : 0
}

/** The default flat step: the middle of the middle frame (frame 3 of 5, frame 2 of 4) */
export const defaultFlatStep = (count: number) => 2 * (Math.ceil(count / 2) - 1) + 1

/** Where flat sits, in half-frame steps from the start of frame 1 (0 to 2 × frames − 1) */
export function flatStep(tilt: Pick<TiltSettings, 'flatAt'>, count: number) {
  if (count <= 0) return 0
  if (tilt.flatAt === 'start') return 0
  if (typeof tilt.flatAt === 'number' && Number.isFinite(tilt.flatAt)) return clampStep(Math.round(tilt.flatAt), count)
  return defaultFlatStep(count)
}
/** Steps wrap round the loop: the end of the last frame is the start of frame 1 */
const clampStep = (step: number, count: number) => ((step % (2 * count)) + 2 * count) % (2 * count)

/** A flat step in words: "Middle of 3", "Between 2 and 3", "Start of 1" */
export function flatLabel(step: number) {
  if (step % 2 === 1) return `Middle of ${(step + 1) / 2}`
  if (step === 0) return `Start of 1`
  return `Between ${step / 2} and ${step / 2 + 1}`
}

/** A flat step's place along the cycle (0 to 1) */
export function stepOffset(step: number, frames: Pick<Frame, 'length'>[]) {
  const edges = frameEdges(frames)
  if (step % 2 === 0) return edges.at(step / 2) ?? 0
  const i = (step - 1) / 2
  return ((edges.at(i) ?? 0) + (edges.at(i + 1) ?? 1)) / 2
}

/** Where flat sits along the cycle for these settings */
export function flatOffset(tilt: Pick<TiltSettings, 'flatAt'>, frames: Pick<Frame, 'length'>[]) {
  if (!frames.length) return 0
  return stepOffset(flatStep(tilt, frames.length), frames)
}

/**
 * Partial reveal's possible reaches for the slow tilt, widest first: for each number of frames it can hide, the
 * slow cycle that hides them (to 90°, with the wobble) and how much of the cycle the slow tilt then reaches
 * either way from flat. Empty when nothing can be hidden.
 */
export function revealReaches(frames: Pick<Frame, 'length'>[], offset: number, fast: number, wobble: number) {
  const drift = fast > 0 ? wobble / fast : 0
  return revealOptions(frames, offset).flatMap((hide) => {
    const slow = revealCycle(frames, HIDE_LIMIT, hide, offset, drift)
    return slow == null ? [] : [{ hide, slow, reach: HIDE_LIMIT / slow + drift }]
  })
}

/** The lens settings a note carries, with the defaults a project from before lenses gets */
export function lensState(tilt: TiltSettings, frames: Pick<Frame, 'length'>[] = []): LensState {
  const effect = tilt.effect ?? 'updown'
  const viewDeg = TILT_LIMIT
  const dirY = tilt.runY === 'down' ? -1 : 1
  const dirX = tilt.runX === 'left' ? -1 : 1
  const revealAxis = tilt.revealAxis ?? 'y'
  const wobble = Math.max(0, tilt.revealWobble ?? DEFAULT_WOBBLE)
  const y = tilt.cycleDeg
  const x = tilt.cycleXDeg ?? tilt.cycleDeg
  const offset = flatOffset(tilt, frames)
  const base = { effect, dirY, dirX, viewDeg, revealAxis, wobble, revealSafe: true, offset } as const
  switch (effect) {
    case 'side':
      return { ...base, cycleY: null, cycleX: x }
    case 'both':
      // Ridges at 45°: both tilts run through the frames at the same rate
      return { ...base, cycleY: y, cycleX: y }
    case 'reveal': {
      // Hidden at any tilt up to 90°, even with the hand drifting `wobble` degrees onto the fast tilt
      const fast = revealAxis === 'y' ? y : x
      const reaches = revealReaches(frames, offset, fast, wobble)
      // The reach chosen on the strip, as a step inwards from the widest; it clamps if flat or the frames change
      const level = Math.min(Math.max(0, Math.round(tilt.revealLevel ?? 0)), Math.max(0, reaches.length - 1))
      const slow = reaches.at(level)?.slow ?? null
      const revealSafe = slow != null
      return revealAxis === 'y'
        ? { ...base, revealSafe, cycleY: y, cycleX: slow ?? x }
        : { ...base, revealSafe, cycleY: slow ?? y, cycleX: x }
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
  return lens.offset + y + x
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
  const cycle = axis === 'x' ? lens.cycleX : lens.cycleY
  if (!cycle) return new Set<number>()
  // Partial reveal's slow tilt promises more: hidden up to 90°, with the wobble on the fast tilt added
  if (lens.effect === 'reveal' && axis !== lens.revealAxis) {
    const fast = (axis === 'x' ? lens.cycleY : lens.cycleX) ?? Infinity
    return reachedAt(frameEdges(note.frames), lens.offset, HIDE_LIMIT / cycle + lens.wobble / fast)
  }
  return reachedAt(frameEdges(note.frames), lens.offset, lens.viewDeg / cycle)
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
  const from = position - lens.offset
  if (lens.cycleY) return { x: 0, y: from * lens.cycleY * lens.dirY }
  if (lens.cycleX) return { x: from * lens.cycleX * lens.dirX, y: 0 }
  return FLAT
}

/** The cycle the bottom bar edits: the one tilt that responds, or the one playback sweeps first */
export function primaryAxis(tilt: TiltSettings, lens: LensState): Axis {
  if (!respondsTo(lens, 'y')) return 'x'
  if (!respondsTo(lens, 'x')) return 'y'
  if (lens.effect === 'reveal') return lens.revealAxis
  const first = tilt.moves?.[0]?.kind ?? tilt.playTilt
  return first === 'x' ? 'x' : 'y'
}

/** The stretch of the cycle (0 to 1) a reach either way from `center` covers, split where it wraps round the loop */
export function reachSpans(center: number, reach: number): [number, number][] {
  if (reach >= 0.5) return [[0, 1]]
  const lo = center - reach, hi = center + reach
  if (lo < 0) return [[0, hi], [lo + 1, 1]]
  if (hi > 1) return [[lo, 1], [0, hi - 1]]
  return [[lo, hi]]
}

/** The current reach either way from flat of one tilt, as a share of the cycle (to TILT_LIMIT; Partial reveal's slow tilt adds the wobble) */
export function tiltReach(lens: LensState, axis: Axis) {
  const cycle = axis === 'x' ? lens.cycleX : lens.cycleY
  if (!cycle) return 0
  if (lens.effect === 'reveal' && axis !== lens.revealAxis) {
    const fast = (axis === 'x' ? lens.cycleY : lens.cycleX) ?? Infinity
    return HIDE_LIMIT / cycle + lens.wobble / fast
  }
  return lens.viewDeg / cycle
}
