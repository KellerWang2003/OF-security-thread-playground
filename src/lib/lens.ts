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

/**
 * How the frames run from flat.
 * - 'start': frame 1 starts at flat and the frames run one way (today's lenses): 1, 2, 3, 4, 5.
 * - 'centre' (Outward): flat sits in the middle of frame 1 and the frames run outward both ways: tilting
 *   one way gives 2, 3, the other way 4, 5. Along the cycle that reads 5, 4, 1, 2, 3, so running past the
 *   cycle jumps from 3 straight to 5.
 * - 'pingpong': the cycle runs 1, 2, 3, 4, 5, 4, 3, 2 and repeats, so both directions play 1 to 5 and
 *   tilting past the cycle plays back down smoothly, with no jump. Middle frames appear twice per cycle.
 * - 'across': the frames run 1 to 5 once, with flat in the middle of the cycle (frame 3 of 5). Tilting
 *   one way runs down to 1, the other way up to 5.
 */
export type FlatAt = 'start' | 'centre' | 'pingpong' | 'across'

/** Frames on the backward side of frame 1 when they run outward */
const backwardCount = (count: number) => Math.floor((count - 1) / 2)

/** The frame (0-based) in each slot along one cycle */
export function slotOrder(count: number, flatAt: FlatAt) {
  const frames = Array.from({ length: count }, (_, i) => i)
  if (flatAt === 'start' || flatAt === 'across' || count < 2) return frames
  if (flatAt === 'pingpong') {
    // count − 2 frames behind frame 1 (counting back down), then frame 1 up to the last
    return Array.from({ length: 2 * count - 2 }, (_, i) => Math.abs(i - (count - 2)))
  }
  if (count < 3) return frames
  const back = backwardCount(count)
  const forward = frames.slice(1, count - back)
  const backward = frames.slice(count - back).reverse()
  return [...backward, 0, ...forward]
}

/**
 * Slot edges along one cycle, 0 to 1 (one more entry than slots). Each slot is as wide as its frame's
 * relative length (all 1 by default), like frame lengths on the editor's timeline.
 */
export function slotEdges(count: number, flatAt: FlatAt, lengths?: number[]) {
  const order = slotOrder(count, flatAt)
  const widths = order.map((f) => Math.max(0.01, lengths?.[f] ?? 1))
  const total = widths.reduce((a, b) => a + b, 0)
  const edges = [0]
  for (const w of widths) edges.push((edges.at(-1) ?? 0) + w / total)
  edges[edges.length - 1] = 1
  return edges
}

/** Where flat sits in the cycle, 0 to 1 */
export function flatFraction(flatAt: FlatAt, count: number, lengths?: number[]) {
  if (flatAt === 'start') return 0
  if (flatAt === 'across') return 0.5
  const order = slotOrder(count, flatAt)
  const edges = slotEdges(count, flatAt, lengths)
  const i = order.indexOf(0)
  return ((edges.at(i) ?? 0) + (edges.at(i + 1) ?? 1)) / 2
}

const wrap01 = (v: number) => ((v % 1) + 1) % 1

/** Position in the cycle (0 to 1, looping) for a tilt across the ridges */
export function cycleFraction(s: number, cycleDeg: number, flatAt: FlatAt, count: number, lengths?: number[]) {
  const flat = flatFraction(flatAt, count, lengths)
  if (cycleDeg <= 0) return flat
  const raw = flat + s / cycleDeg
  // Like the editor, the cycle's own end shows the last frame; only angles beyond it loop
  return raw >= 0 && raw <= 1 ? raw : wrap01(raw)
}

/** Which slot a cycle position falls in, given the slot edges */
export function slotAt(fraction: number, edges: number[]) {
  const f = fraction === 1 ? 1 : wrap01(fraction)
  const slots = edges.length - 1
  for (let i = 0; i < slots - 1; i++) if (f < (edges.at(i + 1) ?? 1)) return i
  return slots - 1
}

/** Which frame (0-based) shows at a cycle position */
export function frameAt(fraction: number, count: number, flatAt: FlatAt, lengths?: number[]) {
  const order = slotOrder(count, flatAt)
  return order[slotAt(fraction, slotEdges(count, flatAt, lengths))] ?? 0
}

export interface Layout {
  count: number
  flatAt: FlatAt
  lengths?: number[]
}

/**
 * The smallest tilt (in either direction along one axis, up to `maxDeg`) that shows any frame in `hidden`,
 * or null if that tilt never shows one. Used to check that, say, up/down can never reveal the aircraft.
 */
export function firstReveal(lens: Lens, axis: 'x' | 'y', hidden: boolean[], layout: Layout, maxDeg = 90, step = 0.25) {
  const { count, flatAt, lengths } = layout
  for (let t = 0; t <= maxDeg + 1e-9; t += step) {
    for (const sign of [1, -1]) {
      const v = sign * t
      const s = axis === 'x' ? acrossTilt(lens, v, 0) : acrossTilt(lens, 0, v)
      if (hidden[frameAt(cycleFraction(s, lens.cycleDeg, flatAt, count, lengths), count, flatAt, lengths)]) return t
    }
  }
  return null
}

/**
 * How far flat is from the nearest hidden frame, as a fraction of the cycle (either direction, looping).
 * A tilt whose cycle is C reaches it at that fraction × C, so a tilt never reveals it below
 * maxDeg ÷ fraction. Null when nothing is hidden or flat itself is hidden.
 */
export function hiddenDistance(hidden: boolean[], layout: Layout) {
  const { count, flatAt, lengths } = layout
  const order = slotOrder(count, flatAt)
  const edges = slotEdges(count, flatAt, lengths)
  const flat = flatFraction(flatAt, count, lengths)
  let best: number | null = null
  order.forEach((f, i) => {
    if (!hidden[f]) return
    const a = edges.at(i) ?? 0
    const b = edges.at(i + 1) ?? 1
    if (flat >= a && flat < b) {
      best = 0
      return
    }
    // Distance to the slot's nearer edge, either way round the loop
    const d = Math.min(...[a, b].map((e) => Math.min(Math.abs(e - flat), 1 - Math.abs(e - flat))))
    if (best == null || d < best) best = d
  })
  return best
}

/** The smallest cycle for one tilt that still keeps the hidden frames out of view up to `maxDeg` */
export function minCycleToHide(hidden: boolean[], layout: Layout, maxDeg = 90) {
  const d = hiddenDistance(hidden, layout)
  return d == null || d <= 0 ? null : maxDeg / d
}

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
