/**
 * Lenticular lens maths for lenses at any angle to the banknote.
 *
 * The ridges only respond to tilt across them. With x = left/right tilt and y = up/down tilt (degrees,
 * positive = right / up) and θ the ridge angle from the banknote's horizontal, the tilt across the ridges is
 *   s = y·cos θ − x·sin θ
 * and `s` alone picks the frame. The lens has one true cycle C (degrees of `s` for one pass through the
 * frames). Each tilt sees it stretched: left/right needs C / sin θ, up/down needs C / cos θ. So only two of
 * (θ, ↔ cycle, ↕ cycle) are free: designers set the two tilt cycles and the lens follows.
 */

const RAD = Math.PI / 180

export interface LensInput {
  /** Degrees of left/right tilt that play the whole sequence once; null = left/right does nothing */
  cycleX: number | null
  /** Degrees of up/down tilt that play the whole sequence once; null = up/down does nothing */
  cycleY: number | null
  /** 1 = ridges lean / (right and up play opposite ways), -1 = ridges lean \ (they play the same way) */
  lean: 1 | -1
}

export interface Lens {
  /** Ridge angle from the banknote's horizontal, signed by lean, −90 to 90 */
  angleDeg: number
  /** Degrees of tilt across the ridges for one pass through the frames */
  cycleDeg: number
}

/** The physical lens that gives these two tilt cycles */
export function lensFrom({ cycleX, cycleY, lean }: LensInput): Lens {
  if (cycleX == null && cycleY == null) return { angleDeg: 0, cycleDeg: 0 }
  if (cycleX == null) return { angleDeg: 0, cycleDeg: cycleY! }
  if (cycleY == null) return { angleDeg: 90 * lean, cycleDeg: cycleX }
  const angle = Math.atan2(cycleY, cycleX) / RAD
  return { angleDeg: angle * lean, cycleDeg: (cycleX * cycleY) / Math.hypot(cycleX, cycleY) }
}

/** The tilt cycles a physical lens gives (the inverse of `lensFrom`) */
export function cyclesFrom(lens: Lens): LensInput {
  const sin = Math.abs(Math.sin(lens.angleDeg * RAD))
  const cos = Math.abs(Math.cos(lens.angleDeg * RAD))
  return {
    cycleX: sin < 1e-6 ? null : lens.cycleDeg / sin,
    cycleY: cos < 1e-6 ? null : lens.cycleDeg / cos,
    lean: lens.angleDeg < 0 ? -1 : 1,
  }
}

/** Tilt across the ridges, in degrees */
export function acrossTilt(lens: Lens, x: number, y: number) {
  const a = lens.angleDeg * RAD
  return y * Math.cos(a) - x * Math.sin(a)
}

/** Where the banknote lies flat in the cycle: at its start (today's lenses) or its centre */
export type FlatAt = 'start' | 'centre'
export const flatFraction = (flatAt: FlatAt) => (flatAt === 'centre' ? 0.5 : 0)

const wrap01 = (v: number) => ((v % 1) + 1) % 1

/** Position in the cycle (0 to 1, looping) for a tilt across the ridges */
export function cycleFraction(s: number, cycleDeg: number, flatAt: FlatAt) {
  if (cycleDeg <= 0) return flatFraction(flatAt)
  return wrap01(flatFraction(flatAt) + s / cycleDeg)
}

/** Which of `count` equal frames shows at a cycle position */
export const frameAt = (fraction: number, count: number) => Math.min(count - 1, Math.floor(wrap01(fraction) * count))

/**
 * How far along the cycle one tilt alone can move from flat, as a fraction of the cycle (each way).
 * A tilt's reach is `reachDeg` of tilt; its cycle is the degrees it needs for a full pass.
 */
export const reachFraction = (reachDeg: number, cycle: number | null) => (cycle == null || cycle <= 0 ? 0 : reachDeg / cycle)

/**
 * Which end of the track a tilt in the positive direction (right, or up) moves towards: 1 = forward
 * (towards the end of the cycle), -1 = backward, 0 = that tilt does nothing.
 */
export function axisDirection(lens: Lens, axis: 'x' | 'y') {
  const a = lens.angleDeg * RAD
  const v = axis === 'x' ? -Math.sin(a) : Math.cos(a)
  return Math.abs(v) < 1e-6 ? 0 : Math.sign(v)
}

/** Circular distance between two cycle positions */
export const cycleDistance = (a: number, b: number) => {
  const d = Math.abs(wrap01(a) - wrap01(b))
  return Math.min(d, 1 - d)
}

export type Coverage = 'both' | 'x' | 'y' | 'none'

/** Whether a cycle position can be reached by left/right alone, up/down alone, both, or neither */
export function coverageAt(fraction: number, flat: number, reachX: number, reachY: number): Coverage {
  const d = cycleDistance(fraction, flat)
  const x = reachX > 0 && d <= reachX + 1e-9
  const y = reachY > 0 && d <= reachY + 1e-9
  return x && y ? 'both' : x ? 'x' : y ? 'y' : 'none'
}

/** Runs of equal coverage along one cycle, for drawing the track */
export function coverageRuns(flat: number, reachX: number, reachY: number, samples = 720) {
  const runs: { from: number; to: number; coverage: Coverage }[] = []
  for (let i = 0; i < samples; i++) {
    const from = i / samples
    const coverage = coverageAt(from + 0.5 / samples, flat, reachX, reachY)
    const last = runs.at(-1)
    if (last && last.coverage === coverage) last.to = (i + 1) / samples
    else runs.push({ from, to: (i + 1) / samples, coverage })
  }
  return runs
}

// Print layer: what the thread's direction, width and repeat do to the print. None of it changes which
// tilt shows which frame.

export interface ThreadGeometry {
  direction: 'vertical' | 'horizontal'
  widthMm: number
  /** Length of the visible thread, for close-view drift */
  lengthMm: number
  /** Repeat step along the thread: one image copy plus the gap */
  repeatMm: number
}

/** Share of a step along / across the thread that lands across the ridges */
function acrossShare(lens: Lens, direction: ThreadGeometry['direction']) {
  const a = lens.angleDeg * RAD
  const along = direction === 'vertical' ? Math.abs(Math.cos(a)) : Math.abs(Math.sin(a))
  const across = direction === 'vertical' ? Math.abs(Math.sin(a)) : Math.abs(Math.cos(a))
  return { along, across }
}

/**
 * Held close, the ends of a long thread are seen from slightly different angles. Returns how much `s`
 * differs from the centre to either end, in degrees and in frames.
 */
export function closeViewDrift(lens: Lens, thread: ThreadGeometry, viewMm: number, frameCount: number) {
  const viewing = Math.atan(thread.lengthMm / 2 / viewMm) / RAD
  const deg = viewing * acrossShare(lens, thread.direction).along
  const frameDeg = lens.cycleDeg / Math.max(1, frameCount)
  return { viewingDeg: viewing, driftDeg: deg, driftFrames: frameDeg > 0 ? deg / frameDeg : 0 }
}

/**
 * Detail the lens can resolve across the thread's width. Strips repeat once per ridge across the ridges,
 * so a pattern across the width resolves down to pitch × |sin θ| (vertical thread) or pitch × |cos θ|
 * (horizontal). Fewest samples when the ridges run along the thread; Infinity when they run straight across it.
 */
export function samplesAcrossWidth(lens: Lens, thread: ThreadGeometry, pitchUm: number) {
  const share = acrossShare(lens, thread.direction).across
  if (share < 1e-6) return Infinity
  return (thread.widthMm * 1000) / (pitchUm * share)
}

/**
 * Whether identical tiles along the thread line up with the ridges. The repeat step measured across the
 * ridges must be a whole number of pitches, or neighbouring copies show different frames.
 */
export function repeatFit(lens: Lens, thread: ThreadGeometry, pitchUm: number, frameCount: number) {
  const share = acrossShare(lens, thread.direction).along
  const pitchMm = pitchUm / 1000
  if (share < 1e-6) return { pitches: 0, offStrips: 0, fits: true, snappedRepeatMm: thread.repeatMm }
  const pitches = (thread.repeatMm * share) / pitchMm
  const nearest = Math.max(1, Math.round(pitches))
  const off = pitches - nearest
  return {
    pitches,
    /** How far a copy lands from a whole pitch, in strips (one strip per frame per pitch) */
    offStrips: off * frameCount,
    fits: Math.abs(off * frameCount) < 0.25,
    /** The nearest repeat step that fits */
    snappedRepeatMm: (nearest * pitchMm) / share,
  }
}

/** The shortest repeat step of at least `minMm` that lines up with the ridges */
export function fittingRepeat(lens: Lens, direction: ThreadGeometry['direction'], minMm: number, pitchUm: number) {
  const share = acrossShare(lens, direction).along
  if (share < 1e-6) return minMm
  const pitchMm = pitchUm / 1000
  return (Math.max(1, Math.ceil((minMm * share) / pitchMm - 1e-9)) * pitchMm) / share
}
