import { clamp } from './frames'
import { FLAT, SWEEP_MAX, respondsTo, type Axis, type LensState, type Tilt2 } from './lens'
import { playbackEase, playbackSettings } from './playback'
import type { PlaybackCurve, PlaybackMove, TiltSettings } from './types'

/**
 * Playback as a list of moves played in order, each a path on the tilt pad. Preset moves start and end flat;
 * a recorded gesture is joined to flat on both sides. Live playback, the pad's path and export all read the
 * same plan, so they always agree.
 */

export const MOVE_KINDS: { value: Exclude<PlaybackMove['kind'], 'gesture'>; label: string }[] = [
  { value: 'y', label: '↕ Up/down' },
  { value: 'x', label: '↔ Side to side' },
  { value: 'diagonal', label: '⤢ Diagonal' },
  { value: 'circle', label: '◯ Circle' },
]
/** Longest gesture kept, in seconds */
export const GESTURE_MAX_SECONDS = 20
/** Most moves in one playback */
export const MOVES_MAX = 8
/** Points around a circle move */
const CIRCLE_POINTS = 48
/** How fast playback travels between flat and a gesture's ends, in degrees per second at 1× */
const JOIN_DEG_PER_SECOND = 60

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()))
export const newMove = (kind: PlaybackMove['kind'] = 'y'): PlaybackMove => ({ id: newId(), kind })

/** The moves a project plays. Projects without a list play what the old Tilt setting chose, as before. */
export function movesOf(tilt: TiltSettings, lens: LensState): PlaybackMove[] {
  if (tilt.moves?.length) return tilt.moves
  const choice = tilt.playTilt ?? 'y'
  const axes: Axis[] = choice === 'both' ? ['y', 'x'] : [choice]
  const live = axes.filter((a) => respondsTo(lens, a))
  const chosen = live.length ? live : respondsTo(lens, 'y') ? (['y'] as const) : (['x'] as const)
  return chosen.map((axis) => ({ id: `default-${axis}`, kind: axis }))
}

/** The moves as saved, or the ones playback falls back to, made a real list the first time one is edited */
export function editableMoves(tilt: TiltSettings, lens: LensState): PlaybackMove[] {
  return tilt.moves?.length ? tilt.moves : movesOf(tilt, lens).map((m) => newMove(m.kind))
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
    x: uses.includes('x') ? (move.x ?? defaultReach(lens, 'x')) : 0,
    y: uses.includes('y') ? (move.y ?? defaultReach(lens, 'y')) : 0,
  }
}

export function movesAxes(move: Pick<PlaybackMove, 'kind'>): Axis[] {
  if (move.kind === 'y') return ['y']
  if (move.kind === 'x') return ['x']
  if (move.kind === 'gesture') return []
  return ['x', 'y']
}

/** One stretch of playback: a path from 0 to 1 over `seconds`, eased by the project's curve or not */
interface Segment {
  seconds: number
  eased: boolean
  /** Points along the path, with the share of the stretch at which each is reached (0 first, 1 last) */
  points: Tilt2[]
  at: number[]
}
export interface PlaybackPlan {
  segments: Segment[]
  seconds: number
  curve: PlaybackCurve
}

const line = (from: Tilt2, to: Tilt2, seconds: number, eased = true): Segment => ({ seconds, eased, points: [from, to], at: [0, 1] })
const hold = (at: Tilt2, seconds: number): Segment => ({ seconds, eased: false, points: [at, at], at: [0, 1] })
const distance = (a: Tilt2, b: Tilt2) => Math.hypot(a.x - b.x, a.y - b.y)

/** Spreads `at` along a path by distance travelled, so the path keeps a steady speed */
function byDistance(points: Tilt2[]) {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]))
  const total = lengths.at(-1) || 1
  return lengths.map((l) => l / total)
}

function moveSegments(move: PlaybackMove, lens: LensState, speed: number, holdSeconds: number): Segment[] {
  const leg = 1 / speed
  const holds = (at: Tilt2) => (holdSeconds > 0 ? [hold(at, holdSeconds)] : [])
  if (move.kind === 'gesture') {
    const recorded = (move.points ?? []).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.x) && Number.isFinite(p.y))
    if (recorded.length < 2) return []
    const t0 = recorded[0].t
    const span = Math.max(recorded.at(-1)!.t - t0, 1e-3)
    const points = recorded.map(({ x, y }) => ({ x, y }))
    const first = points[0]
    const last = points.at(-1)!
    const join = (a: Tilt2, b: Tilt2) => (distance(a, b) < 0.5 ? [] : [line(a, b, Math.max(0.15, distance(a, b) / JOIN_DEG_PER_SECOND) / speed)])
    return [
      ...join(FLAT, first),
      { seconds: span / speed, eased: false, points, at: recorded.map((p) => (p.t - t0) / span) },
      ...join(last, FLAT),
      ...holds(FLAT),
    ]
  }
  const end = moveReach(move, lens)
  if (move.kind === 'circle') {
    // Out to the top of the ellipse, once round, and back
    const top = { x: 0, y: end.y }
    const ring = Array.from({ length: CIRCLE_POINTS + 1 }, (_, i) => {
      const a = (i / CIRCLE_POINTS) * 2 * Math.PI
      return { x: end.x * Math.sin(a), y: end.y * Math.cos(a) }
    })
    return [line(FLAT, top, leg), ...holds(top), { seconds: 2 * leg, eased: false, points: ring, at: byDistance(ring) }, line(top, FLAT, leg), ...holds(FLAT)]
  }
  return [line(FLAT, end, leg), ...holds(end), line(end, FLAT, leg), ...holds(FLAT)]
}

export function playbackPlan(tilt: TiltSettings, lens: LensState): PlaybackPlan {
  const { speed, curve, holdSeconds } = playbackSettings(tilt)
  const segments = movesOf(tilt, lens).flatMap((m) => moveSegments(m, lens, speed, holdSeconds)).filter((s) => s.seconds > 0)
  const seconds = segments.reduce((total, s) => total + s.seconds, 0)
  return { segments, seconds, curve }
}

function pointAlong(segment: Segment, u: number): Tilt2 {
  const { points, at } = segment
  if (u <= 0) return points[0]
  if (u >= 1) return points.at(-1)!
  let i = 1
  while (i < at.length - 1 && at[i] < u) i++
  const a = at[i - 1]
  const b = at[i]
  const k = b > a ? (u - a) / (b - a) : 1
  return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * k, y: points[i - 1].y + (points[i].y - points[i - 1].y) * k }
}

/** The tilt `seconds` into playback; past the end it loops */
export function tiltAt(plan: PlaybackPlan, seconds: number): Tilt2 {
  if (!plan.segments.length || plan.seconds <= 0) return FLAT
  let t = ((seconds % plan.seconds) + plan.seconds) % plan.seconds
  for (const segment of plan.segments) {
    if (t < segment.seconds) {
      const u = t / segment.seconds
      return pointAlong(segment, segment.eased ? playbackEase(u, plan.curve) : u)
    }
    t -= segment.seconds
  }
  return pointAlong(plan.segments.at(-1)!, 1)
}

/** Every point the plan passes through, in order, for drawing its path */
export const planPath = (plan: PlaybackPlan): Tilt2[] => plan.segments.flatMap((s) => s.points)

/**
 * Turns a recording of the pad (time in seconds, tilt in degrees) into a gesture move: trimmed to the longest
 * allowed, and thinned so points closer than a quarter degree to the last kept one are dropped.
 */
export function gestureFromRecording(samples: { t: number; x: number; y: number }[], limit: number): PlaybackMove | null {
  if (samples.length < 2) return null
  const t0 = samples[0].t
  const kept: { t: number; x: number; y: number }[] = []
  for (const s of samples) {
    const t = s.t - t0
    if (t > GESTURE_MAX_SECONDS) break
    const point = { t: Math.round(t * 1000) / 1000, x: round(clamp(s.x, -limit, limit)), y: round(clamp(s.y, -limit, limit)) }
    const last = kept.at(-1)
    if (!last || distance(last, point) >= 0.25) kept.push(point)
    else last.t = point.t
  }
  if (kept.length < 2 || kept.at(-1)!.t - kept[0].t < 0.1) return null
  return { id: newId(), kind: 'gesture', points: kept }
}

const round = (v: number) => Math.round(v * 10) / 10

/** Length of a gesture in seconds at 1× */
export const gestureSeconds = (move: PlaybackMove) => {
  const p = move.points ?? []
  return p.length > 1 ? p.at(-1)!.t - p[0].t : 0
}
