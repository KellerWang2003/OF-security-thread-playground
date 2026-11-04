import { FLIP_SECONDS } from './back'
import { clamp } from './frames'
import { FLAT, SWEEP_MAX, respondsTo, type Axis, type LensState, type Tilt2 } from './lens'
import { SWEEP_SECONDS, playbackEase, playbackSettings } from './playback'
import type { PlaybackCurve, PlaybackMove, RecordedPoint, Recording, TiltSettings } from './types'

/**
 * Playback as a list of moves played in order, each a path on the tilt pad with how far the banknote is held to
 * the light along it. Preset moves start and end flat, in reflected light; a recorded gesture is joined to flat on
 * both sides. Nothing pauses unless a Hold says so: it stays flat, so it pauses after the move before it has come
 * back. A Flip turns the banknotes over to their other side, flat, as F does. Live playback, the pad's path and export
 * all read the same plan, so they always agree.
 */

export const MOVE_KINDS: { value: Exclude<PlaybackMove['kind'], 'gesture'>; label: string }[] = [
  { value: 'y', label: '↕ Up/down' },
  { value: 'x', label: '↔ Side to side' },
  { value: 'diagonal', label: '⤢ Diagonal' },
  { value: 'circle', label: '◯ Circle' },
  { value: 'flip', label: '⇄ Flip' },
  { value: 'hold', label: '⏸ Hold' },
  { value: 'light', label: '☀ Hold to light' },
]
/** Seconds a Hold move stays flat at 1×, unless set */
export const HOLD_SECONDS = 1
export const HOLD_LIMITS = { min: 0.1, max: 10, step: 0.1 }
/** Seconds a Hold to light move stays up to the light at 1×, unless set */
export const LIGHT_HOLD_SECONDS = 1.5
export const LIGHT_HOLD_LIMITS = { min: 0.2, max: 10, step: 0.1 }
/** Seconds a Hold to light move takes to fade the light in, and again to fade it out, at 1× */
export const LIGHT_FADE_SECONDS = 0.5
/** Longest gesture kept, in seconds */
export const GESTURE_MAX_SECONDS = 20
/** Most moves in one playback */
export const MOVES_MAX = 8
/** Points around a circle move */
const CIRCLE_POINTS = 48
/** How fast playback travels between flat and a gesture's ends, in degrees per second at 1×: a 60° sweep's pace */
const JOIN_DEG_PER_SECOND = 60 / SWEEP_SECONDS

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()))
export const newMove = (kind: PlaybackMove['kind'] = 'y'): PlaybackMove => ({ id: newId(), kind })

/**
 * The moves a project plays. Projects without a list play the default: the tilt the old Tilt setting chose (up/down
 * unless set), as default moves (see `swingEnds`).
 */
export function movesOf(tilt: TiltSettings, lens: LensState): PlaybackMove[] {
  if (tilt.moves?.length) return tilt.moves
  const choice = tilt.playTilt ?? 'y'
  const axes: Axis[] = choice === 'both' ? ['y', 'x'] : [choice]
  const live = axes.filter((a) => respondsTo(lens, a))
  const chosen = live.length ? live : respondsTo(lens, 'y') ? (['y'] as const) : (['x'] as const)
  return chosen.map((axis) => ({ id: `default-${axis}`, kind: axis }))
}

/**
 * The moves as saved, or the default ones playback falls back to, made a real list the first time one is edited. The
 * default moves keep their ids, so they stay the default until their angles are set.
 */
export function editableMoves(tilt: TiltSettings, lens: LensState): PlaybackMove[] {
  return tilt.moves?.length ? tilt.moves : movesOf(tilt, lens)
}

/** How far a move goes on an axis when not set: one full cycle, or the viewing range when that tilt does nothing */
export function defaultReach(lens: LensState, axis: Axis) {
  const cycle = axis === 'y' ? lens.cycleY : lens.cycleX
  const dir = axis === 'y' ? lens.dirY : lens.dirX
  return (cycle ? Math.min(cycle, SWEEP_MAX) : lens.viewDeg) * dir
}

/** The signed angles a preset move reaches on each axis (0 on an axis it doesn't use) */
export function moveReach(move: PlaybackMove, lens: LensState): Tilt2 {
  const uses = movesAxes(move)
  return {
    x: uses.includes('x') ? clamp(move.x ?? defaultReach(lens, 'x'), -SWEEP_MAX, SWEEP_MAX) : 0,
    y: uses.includes('y') ? clamp(move.y ?? defaultReach(lens, 'y'), -SWEEP_MAX, SWEEP_MAX) : 0,
  }
}

export function movesAxes(move: Pick<PlaybackMove, 'kind'>): Axis[] {
  if (move.kind === 'y') return ['y']
  if (move.kind === 'x') return ['x']
  if (move.kind === 'gesture' || move.kind === 'light' || move.kind === 'hold' || move.kind === 'flip') return []
  return ['x', 'y']
}

/** One stretch of playback: a path from 0 to 1 over `seconds`, eased by the project's curve or not */
interface Segment {
  seconds: number
  eased: boolean
  /** Points along the path, with the share of the stretch at which each is reached (0 first, 1 last) */
  points: Tilt2[]
  at: number[]
  /** How far the banknote is held to the light at each point, 0 to 1; absent means not at all */
  light?: number[]
  /** A Flip: the banknotes turn over to their other side along it, at a steady rate */
  flip?: true
}
export interface PlaybackPlan {
  segments: Segment[]
  seconds: number
  curve: PlaybackCurve
  /** When each Flip begins, in seconds into a pass */
  flips: number[]
  /** Seconds a Flip takes to turn the banknotes over: FLIP_SECONDS at 1×, scaled by speed as every move is */
  flipSeconds: number
}

/** Light at a segment's ends, left out when there is none */
const lit = (from: number, to: number) => (from || to ? { light: [from, to] } : {})
const line = (from: Tilt2, to: Tilt2, seconds: number, eased = true, light: [number, number] = [0, 0]): Segment =>
  ({ seconds, eased, points: [from, to], at: [0, 1], ...lit(...light) })
const hold = (at: Tilt2, seconds: number, light = 0): Segment => ({ seconds, eased: false, points: [at, at], at: [0, 1], ...lit(light, light) })
const distance = (a: Tilt2, b: Tilt2) => Math.hypot(a.x - b.x, a.y - b.y)
const lightOf = (p: { light?: number }) => (typeof p.light === 'number' && Number.isFinite(p.light) ? clamp(p.light, 0, 1) : 0)

/** Spreads `at` along a path by distance travelled, so the path keeps a steady speed */
function byDistance(points: Tilt2[]) {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]))
  const total = lengths.at(-1) || 1
  return lengths.map((l) => l / total)
}

function moveSegments(move: PlaybackMove, lens: LensState, speed: number): Segment[] {
  const leg = SWEEP_SECONDS / speed
  if (move.kind === 'gesture') {
    const recorded = (move.points ?? []).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.x) && Number.isFinite(p.y))
    if (recorded.length < 2) return []
    const t0 = recorded[0].t
    const span = Math.max(recorded.at(-1)!.t - t0, 1e-3)
    const points = recorded.map(({ x, y }) => ({ x, y }))
    const light = recorded.map(lightOf)
    const gesture: Segment = { seconds: span / speed, eased: false, points, at: recorded.map((p) => (p.t - t0) / span), ...(light.some((l) => l > 0) ? { light } : {}) }
    return [gesture]
  }
  // Every move ends flat, so a Hold waits there once the move before it has come back
  if (move.kind === 'hold') return [hold(FLAT, holdMoveSeconds(move) / speed)]
  // Flat too, while the banknotes turn over
  if (move.kind === 'flip') return [{ ...hold(FLAT, FLIP_SECONDS / speed), flip: true }]
  if (move.kind === 'light') {
    // Flat the whole time: the light fades in, stays and fades out
    const fade = LIGHT_FADE_SECONDS / speed
    return [line(FLAT, FLAT, fade, true, [0, 1]), hold(FLAT, lightHoldSeconds(move) / speed, 1), line(FLAT, FLAT, fade, true, [1, 0])]
  }
  const end = moveReach(move, lens)
  if (move.kind === 'circle') {
    // Out to the top of the ellipse, once round, and back
    const top = { x: 0, y: end.y }
    const ring = Array.from({ length: CIRCLE_POINTS + 1 }, (_, i) => {
      const a = (i / CIRCLE_POINTS) * 2 * Math.PI
      return { x: end.x * Math.sin(a), y: end.y * Math.cos(a) }
    })
    return [line(FLAT, top, leg), { seconds: 2 * leg, eased: false, points: ring, at: byDistance(ring) }, line(top, FLAT, leg)]
  }
  // Up/down and side make one pass from their start to their end; the plan glides to and from flat around it.
  // A move left at flat to start keeps going out and back, as before.
  const { start, end: stop } = swingEnds(move, lens)
  if (distance(start, FLAT) < 0.5) return [line(FLAT, stop, leg), line(stop, FLAT, leg)]
  return [line(start, stop, leg)]
}

/**
 * Where an up/down or side move starts and ends. One that was never set swings once across a full cycle centred
 * on flat (−½ to +½ cycle), so every frame plays once. A default move (a project's playlist until it is set) comes
 * back to flat from a full cycle out, playing the frames the way 1 → 5 runs and stopping on the rest frame: 30° → 0°
 * up/down on a new banknote (Keller, 3 November).
 */
export function swingEnds(move: PlaybackMove, lens: LensState): { start: Tilt2; end: Tilt2 } {
  const axis = move.kind === 'x' ? 'x' : 'y'
  const untouched = (move.kind === 'y' || move.kind === 'x') && move.from === undefined && move[axis] === undefined
  if (untouched && move.id.startsWith('default-')) {
    const from = -defaultReach(lens, axis)
    return { start: axis === 'y' ? { x: 0, y: from } : { x: from, y: 0 }, end: FLAT }
  }
  if (untouched) {
    const cycle = axis === 'y' ? lens.cycleY : lens.cycleX
    const dir = axis === 'y' ? lens.dirY : lens.dirX
    const half = (cycle ? Math.min(cycle / 2, SWEEP_MAX) : lens.viewDeg / 2) * dir
    return axis === 'y' ? { start: { x: 0, y: -half }, end: { x: 0, y: half } } : { start: { x: -half, y: 0 }, end: { x: half, y: 0 } }
  }
  return { start: moveStart(move), end: moveReach(move, lens) }
}

/** Where a move begins: flat, or for up/down and side moves the angle set as From */
export function moveStart(move: PlaybackMove): Tilt2 {
  if (move.kind === 'y') return { x: 0, y: move.from ?? 0 }
  if (move.kind === 'x') return { x: move.from ?? 0, y: 0 }
  return FLAT
}

const heldSeconds = (move: Pick<PlaybackMove, 'seconds'>, unset: number, limits: { min: number; max: number }) =>
  clamp(typeof move.seconds === 'number' && Number.isFinite(move.seconds) ? move.seconds : unset, limits.min, limits.max)
/** Seconds a Hold move stays flat, at 1× */
export const holdMoveSeconds = (move: Pick<PlaybackMove, 'seconds'>) => heldSeconds(move, HOLD_SECONDS, HOLD_LIMITS)
/** Seconds a Hold to light move stays up to the light, at 1× */
export const lightHoldSeconds = (move: Pick<PlaybackMove, 'seconds'>) => heldSeconds(move, LIGHT_HOLD_SECONDS, LIGHT_HOLD_LIMITS)

const firstPoint = (s: Segment) => s.points[0]
const lastPoint = (s: Segment) => s.points.at(-1)!
const firstLight = (s: Segment) => s.light?.[0] ?? 0
const lastLight = (s: Segment) => s.light?.at(-1) ?? 0
/** Travels straight from one move's end to the next one's start, at a steady speed, fading any light on the way */
const join = (a: Tilt2, b: Tilt2, speed: number, light: [number, number] = [0, 0]) =>
  line(a, b, Math.max(0.15, distance(a, b) / JOIN_DEG_PER_SECOND, Math.abs(light[1] - light[0]) * LIGHT_FADE_SECONDS) / speed, true, light)

export function playbackPlan(tilt: TiltSettings, lens: LensState): PlaybackPlan {
  const { speed, curve } = playbackSettings(tilt)
  const runs = movesOf(tilt, lens).map((m) => moveSegments(m, lens, speed).filter((s) => s.seconds > 0)).filter((r) => r.length)
  // Every move starts from flat in reflected light, and returns there before the next one
  const segments = runs.flatMap((run) => {
    const first = firstPoint(run[0])
    const last = lastPoint(run.at(-1)!)
    const lightIn = firstLight(run[0])
    const lightOut = lastLight(run.at(-1)!)
    return [
      ...(distance(FLAT, first) < 0.5 && lightIn === 0 ? [] : [join(FLAT, first, speed, [0, lightIn])]),
      ...run,
      ...(distance(last, FLAT) < 0.5 && lightOut === 0 ? [] : [join(last, FLAT, speed, [lightOut, 0])]),
    ]
  })
  let seconds = 0
  const flips: number[] = []
  for (const segment of segments) {
    if (segment.flip) flips.push(seconds)
    seconds += segment.seconds
  }
  return { segments, seconds, curve, flips, flipSeconds: FLIP_SECONDS / speed }
}

/** Where along a segment's points `u` falls: the point before it, and the share of the way to the next one */
function locate(segment: Segment, u: number) {
  const { at } = segment
  if (u <= 0) return { i: 1, k: 0 }
  if (u >= 1) return { i: at.length - 1, k: 1 }
  let i = 1
  while (i < at.length - 1 && at[i] < u) i++
  const a = at[i - 1]
  const b = at[i]
  return { i, k: b > a ? (u - a) / (b - a) : 1 }
}

function pointAlong(segment: Segment, u: number): Tilt2 {
  const { points } = segment
  if (u <= 0) return points[0]
  if (u >= 1) return points.at(-1)!
  const { i, k } = locate(segment, u)
  return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * k, y: points[i - 1].y + (points[i].y - points[i - 1].y) * k }
}

function lightAlong(segment: Segment, u: number) {
  const { light } = segment
  if (!light) return 0
  const { i, k } = locate(segment, u)
  return light[i - 1] + (light[i] - light[i - 1]) * k
}

/** The segment playing `seconds` into playback (past the end it loops), and how far through it, eased */
function segmentAt(plan: PlaybackPlan, seconds: number): { segment: Segment; u: number } | undefined {
  if (!plan.segments.length || plan.seconds <= 0) return undefined
  let t = ((seconds % plan.seconds) + plan.seconds) % plan.seconds
  for (const segment of plan.segments) {
    if (t < segment.seconds) {
      const u = t / segment.seconds
      return { segment, u: segment.eased ? playbackEase(u, plan.curve) : u }
    }
    t -= segment.seconds
  }
  return { segment: plan.segments.at(-1)!, u: 1 }
}

/** The tilt `seconds` into playback; past the end it loops */
export function tiltAt(plan: PlaybackPlan, seconds: number): Tilt2 {
  const at = segmentAt(plan, seconds)
  return at ? pointAlong(at.segment, at.u) : FLAT
}

/** How far the banknote is held to the light `seconds` into playback, 0 to 1; past the end it loops */
export function lightAt(plan: PlaybackPlan, seconds: number): number {
  const at = segmentAt(plan, seconds)
  return at ? lightAlong(at.segment, at.u) : 0
}

/**
 * How many Flips begin after `from` seconds into a pass and up to `to`: from the very start of the pass without `from`,
 * and on round its end into the next when `to` comes before `from`. Live playback turns the banknotes over as each begins
 */
export function flipsBetween(plan: PlaybackPlan, from: number | undefined, to: number) {
  return plan.flips.filter((start) => {
    if (from === undefined) return start <= to
    return to < from ? start > from || start <= to : start > from && start <= to
  }).length
}

/**
 * How far the banknotes have turned over `seconds` into playback, 0 (front) to 1 (back), playback having begun on their
 * backs or not: each Flip turns them to their other side at a steady rate (`turnDeg` eases it, as it eases F), so after
 * a pass with an odd number of Flips the next one begins on the other side
 */
export function turnAt(plan: PlaybackPlan, seconds: number, back = false): number {
  const passes = plan.seconds > 0 ? Math.floor(seconds / plan.seconds) : 0
  const t = seconds - passes * plan.seconds
  const done = plan.flips.filter((start) => start + plan.flipSeconds <= t).length
  const turning = plan.flips.find((start) => start <= t && t < start + plan.flipSeconds)
  const onBack = (Number(back) + passes * plan.flips.length + done) % 2 === 1
  const k = turning === undefined ? 0 : (t - turning) / plan.flipSeconds
  return onBack ? 1 - k : k
}

/** Every point the plan passes through, in order, for drawing its path */
export const planPath = (plan: PlaybackPlan): Tilt2[] => plan.segments.flatMap((s) => s.points)

/** The stretches of the path played up to the light, each as its points in order, for drawing them warm */
export function planLitPaths(plan: PlaybackPlan): Tilt2[][] {
  const paths: Tilt2[][] = []
  let open: Tilt2[] | undefined
  for (const segment of plan.segments) {
    segment.points.forEach((point, i) => {
      if ((segment.light?.[i] ?? 0) > 0) {
        if (!open) paths.push((open = []))
        open.push(point)
      } else open = undefined
    })
  }
  return paths
}

/**
 * Turns a recording of the pad (time in seconds, tilt in degrees, light 0 to 1) into a gesture move: trimmed to
 * the longest allowed, and thinned so points closer than a quarter degree to the last kept one, with about the
 * same light, are dropped. Points in reflected light carry no light at all.
 */
export function recordingFromSamples(samples: RecordedPoint[], limit: number, name: string): Recording | null {
  if (samples.length < 2) return null
  const t0 = samples[0].t
  const kept: RecordedPoint[] = []
  for (const s of samples) {
    const t = s.t - t0
    if (t > GESTURE_MAX_SECONDS) break
    const light = Math.round(lightOf(s) * 100) / 100
    const point: RecordedPoint = { t: Math.round(t * 1000) / 1000, x: round(clamp(s.x, -limit, limit)), y: round(clamp(s.y, -limit, limit)), ...(light > 0 ? { light } : {}) }
    const last = kept.at(-1)
    if (!last || distance(last, point) >= 0.25 || Math.abs(lightOf(last) - light) >= 0.05 || (light === 0) !== (lightOf(last) === 0)) kept.push(point)
    else last.t = point.t
  }
  if (kept.length < 2 || kept.at(-1)!.t - kept[0].t < 0.1) return null
  return { id: newId(), name, points: kept }
}

const round = (v: number) => Math.round(v * 10) / 10

/** A playlist move that plays a recording */
export const moveFromRecording = (r: Recording): PlaybackMove => ({ id: newId(), kind: 'gesture', points: r.points, recordingId: r.id })

/** The next free "Recording N" name */
export function nextRecordingName(recordings: Recording[] = []) {
  let n = recordings.length + 1
  while (recordings.some((r) => r.name === `Recording ${n}`)) n++
  return `Recording ${n}`
}

/** Length of a gesture or recording in seconds at 1× */
export const gestureSeconds = (move: { points?: { t: number }[] }) => {
  const p = move.points ?? []
  return p.length > 1 ? p.at(-1)!.t - p[0].t : 0
}
