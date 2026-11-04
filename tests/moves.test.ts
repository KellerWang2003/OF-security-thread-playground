import { describe, expect, it } from 'vitest'
import { FLIP_SECONDS } from '../src/lib/back'
import { playbackTilts } from '../src/lib/exportRender'
import { lensState } from '../src/lib/lens'
import {
  HOLD_LIMITS, HOLD_SECONDS, LIGHT_FADE_SECONDS, LIGHT_HOLD_SECONDS, editableMoves, flipsBetween, holdMoveSeconds, lightAt, lightHoldSeconds, moveFromRecording,
  movesOf, planLitPaths, playbackPlan, recordingFromSamples, swingEnds, tiltAt, turnAt,
} from '../src/lib/moves'
import { migrateProject } from '../src/lib/notes'
import { SWEEP_SECONDS } from '../src/lib/playback'
import type { TiltSettings } from '../src/lib/types'

const frames = [10, 10, 10].map((length, i) => ({ id: String(i), kind: 'color' as const, color: '#000', name: '', length }))
const base = { cycleDeg: 40, cycleXDeg: 80, effect: 'both', transition: 0, speed: 1, curve: 'linear' } as TiltSettings
/** Seconds one sweep takes at 1× (about 1.9), and a glide between flat and a swing's start or end, which keeps a 60° sweep's pace */
const leg = SWEEP_SECONDS
const glide = (deg: number) => (deg / 60) * SWEEP_SECONDS
const planOf = (moves: TiltSettings['moves'], settings: Partial<TiltSettings> = {}) => {
  const tilt = { ...base, ...settings, moves } as TiltSettings
  return playbackPlan(tilt, lensState(tilt, frames))
}

describe('playback moves', () => {
  it('falls back to the old Tilt choice when there is no list', () => {
    const lens = lensState({ ...base, playTilt: 'both' }, frames)
    expect(movesOf({ ...base, playTilt: 'both' }, lens).map((m) => m.kind)).toEqual(['y', 'x'])
  })

  it('moves both tilts at once on a diagonal, to the angles set', () => {
    const tilt = { ...base, moves: [{ id: 'a', kind: 'diagonal', x: -30, y: 20 }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    // Out and back, a sweep each at 1×
    expect(plan.seconds).toBeCloseTo(2 * leg)
    expect(tiltAt(plan, leg / 2)).toEqual({ x: expect.closeTo(-15), y: expect.closeTo(10) })
    expect(tiltAt(plan, leg)).toEqual({ x: expect.closeTo(-30), y: expect.closeTo(20) })
    expect(tiltAt(plan, 2 * leg)).toEqual({ x: expect.closeTo(0), y: expect.closeTo(0) })
  })

  it('goes out, once round and back on a circle, and export follows it', () => {
    const tilt = { ...base, moves: [{ id: 'c', kind: 'circle', x: 30, y: 30 }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    expect(plan.seconds).toBeCloseTo(4 * leg)
    expect(tiltAt(plan, leg).y).toBeCloseTo(30)
    expect(tiltAt(plan, 1.5 * leg).x).toBeCloseTo(30, 0)
    expect(tiltAt(plan, 2 * leg).y).toBeCloseTo(-30, 0)
    expect(playbackTilts({ tilt, frames }, 15)).toHaveLength(Math.round(4 * leg * 15))
  })

  it('plays a recorded gesture in its own time, joined to flat', () => {
    const move = recordingFromSamples([{ t: 5, x: 0, y: 0 }, { t: 5.5, x: 10, y: 0 }, { t: 6, x: 10, y: 10 }], 60, 'R')!
    expect(move.points).toHaveLength(3)
    const tilt = { ...base, moves: [moveFromRecording(move)] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    expect(tiltAt(plan, 0.75)).toEqual({ x: 10, y: 5 })
  })

  it('keeps the moves through the migration, and drops the hold older saves set for every move', () => {
    const tilt = { ...base, holdSeconds: 0.5, moves: [{ id: 'a', kind: 'x' }, { id: 'h', kind: 'hold', seconds: 2 }] }
    const note = { id: 'n', name: 'N', x: 0, y: 0, widthMm: 100, heightMm: 50, background: 'solid', color: '#fff', frames, tilt,
      thread: { widthMm: 4, direction: 'vertical', positionMm: 50, imageGapMm: 0, windows: { enabled: false, sections: [] } } }
    const migrated = migrateProject({ id: 'p', name: 'P', createdAt: 0, updatedAt: 0, notes: [note] }).notes[0].tilt
    expect(migrated.moves).toEqual(tilt.moves)
    expect(migrated).not.toHaveProperty('holdSeconds')
  })
})

describe('default playlist', () => {
  // A new banknote's lens: frames run 1 → 5 downwards
  const fresh = { ...base, cycleDeg: 30, effect: 'updown', runY: 'down' } as TiltSettings

  it('comes back to flat from a full cycle out: 30° → 0° on a new banknote', () => {
    const plan = playbackPlan(fresh, lensState(fresh, frames))
    expect(plan.seconds).toBeCloseTo(glide(30) + leg)
    expect(tiltAt(plan, glide(30) / 2).y).toBeCloseTo(15)
    expect(tiltAt(plan, glide(30)).y).toBeCloseTo(30)
    expect(tiltAt(plan, glide(30) + leg / 2).y).toBeCloseTo(15)
    expect(tiltAt(plan, plan.seconds - 1e-6).y).toBeCloseTo(0, 4)
  })

  it('follows the cycle, and starts on the other side when frames run the other way', () => {
    const up = { ...fresh, cycleDeg: 40, runY: 'up' } as TiltSettings
    expect(tiltAt(playbackPlan(up, lensState(up, frames)), glide(40)).y).toBeCloseTo(-40)
  })

  it('stays the default once the playlist is first edited, until its angles are set', () => {
    const lens = lensState(fresh, frames)
    const [move] = editableMoves(fresh, lens)
    expect(swingEnds(move, lens)).toEqual({ start: { x: 0, y: 30 }, end: { x: 0, y: 0 } })
    expect(swingEnds(move, lensState({ ...fresh, cycleDeg: 20 }, frames)).start.y).toBeCloseTo(20)
    expect(swingEnds({ ...move, from: 10, y: -10 }, lens)).toEqual({ start: { x: 0, y: 10 }, end: { x: 0, y: -10 } })
  })
})

describe('swing moves', () => {
  it('glides from flat to −12°, makes one pass to +12°, then glides back to flat', () => {
    const tilt = { ...base, moves: [{ id: 's', kind: 'y', from: -12, y: 12 }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    const join = glide(12)
    expect(plan.seconds).toBeCloseTo(leg + 2 * join)
    expect(tiltAt(plan, 0).y).toBeCloseTo(0)
    expect(tiltAt(plan, join).y).toBeCloseTo(-12)
    expect(tiltAt(plan, join + leg).y).toBeCloseTo(12)
    expect(tiltAt(plan, plan.seconds - 1e-6).y).toBeCloseTo(0, 1)
  })

  it('swings an unset up/down move once across a full cycle centred on flat', () => {
    const tilt = { ...base, moves: [{ id: 'u', kind: 'y' }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    const join = glide(20)
    // Cycle 40°, frames run up: −20° → +20°
    expect(tiltAt(plan, join).y).toBeCloseTo(-20)
    expect(tiltAt(plan, join + leg).y).toBeCloseTo(20)
  })

  it('returns to flat between moves', () => {
    const tilt = { ...base, moves: [{ id: 'a', kind: 'y', from: -10, y: 10 }, { id: 'b', kind: 'x', from: 0, x: 20 }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    const first = leg + 2 * glide(10)
    expect(tiltAt(plan, first).x).toBeCloseTo(0)
    expect(tiltAt(plan, first).y).toBeCloseTo(0)
    expect(tiltAt(plan, first + leg).x).toBeCloseTo(20)
  })
})

describe('hold', () => {
  it('stays flat in reflected light for its seconds, scaled by speed', () => {
    const plan = planOf([{ id: 'h', kind: 'hold' }])
    expect(plan.seconds).toBeCloseTo(HOLD_SECONDS)
    for (const t of [0, 0.5, 0.99]) {
      expect(tiltAt(plan, t)).toEqual({ x: 0, y: 0 })
      expect(lightAt(plan, t)).toBe(0)
    }
    expect(planOf([{ id: 'h', kind: 'hold', seconds: 3 }]).seconds).toBeCloseTo(3)
    expect(planOf([{ id: 'h', kind: 'hold', seconds: 3 }], { speed: 2 }).seconds).toBeCloseTo(1.5)
    expect(holdMoveSeconds({ seconds: 99 })).toBe(HOLD_LIMITS.max)
    expect(holdMoveSeconds({ seconds: Number.NaN })).toBe(HOLD_SECONDS)
  })

  it('pauses at flat once the move before it has come back, and nowhere else', () => {
    const plan = planOf([{ id: 'a', kind: 'y', y: 20 }, { id: 'h', kind: 'hold', seconds: 1.5 }, { id: 'b', kind: 'x', x: 30 }])
    // Out and back for each swing, plus the hold between them, which keeps its own seconds
    expect(plan.seconds).toBeCloseTo(2 * leg + 1.5 + 2 * leg)
    // Full tilt is passed through, not held
    expect(tiltAt(plan, leg).y).toBeCloseTo(20)
    expect(tiltAt(plan, 1.25 * leg).y).toBeCloseTo(15)
    for (const t of [2 * leg, 2 * leg + 0.75, 2 * leg + 1.49]) expect(tiltAt(plan, t)).toEqual({ x: expect.closeTo(0), y: expect.closeTo(0) })
    expect(tiltAt(plan, 2 * leg + 1.5 + leg / 2).x).toBeCloseTo(15)
  })

  it('leaves every other move without a pause, whatever hold an older save set for all of them', () => {
    expect(planOf([{ id: 'a', kind: 'y', y: 20 }], { holdSeconds: 0.5 }).seconds).toBeCloseTo(2 * leg)
    expect(planOf([{ id: 'l', kind: 'light' }], { holdSeconds: 0.5 }).seconds).toBeCloseTo(2 * LIGHT_FADE_SECONDS + LIGHT_HOLD_SECONDS)
  })
})

describe('flip', () => {
  it('stays flat in reflected light while the banknotes turn over, as long as F takes, scaled by speed', () => {
    const plan = planOf([{ id: 'f', kind: 'flip' }])
    expect(plan.seconds).toBeCloseTo(FLIP_SECONDS)
    expect(plan.flips).toEqual([0])
    for (const t of [0, FLIP_SECONDS / 2, FLIP_SECONDS - 0.01]) {
      expect(tiltAt(plan, t)).toEqual({ x: 0, y: 0 })
      expect(lightAt(plan, t)).toBe(0)
    }
    expect(planOf([{ id: 'f', kind: 'flip' }], { speed: 2 })).toMatchObject({ seconds: FLIP_SECONDS / 2, flipSeconds: FLIP_SECONDS / 2 })
  })

  it('turns them once the move before it has come back to flat', () => {
    const plan = planOf([{ id: 'a', kind: 'y', y: 20 }, { id: 'f', kind: 'flip' }, { id: 'b', kind: 'x', x: 30 }])
    expect(plan.seconds).toBeCloseTo(2 * leg + FLIP_SECONDS + 2 * leg)
    expect(plan.flips).toEqual([expect.closeTo(2 * leg)])
    expect(tiltAt(plan, 2 * leg + FLIP_SECONDS / 2)).toEqual({ x: expect.closeTo(0), y: expect.closeTo(0) })
    expect(tiltAt(plan, 2 * leg + FLIP_SECONDS + leg / 2).x).toBeCloseTo(15)
  })

  it('turns them to their other side, so a pass with one Flip leaves the next to play on the other side', () => {
    const plan = planOf([{ id: 'a', kind: 'y', y: 20 }, { id: 'f', kind: 'flip' }])
    const pass = 2 * leg + FLIP_SECONDS
    expect(turnAt(plan, 0)).toBe(0)
    expect(turnAt(plan, leg)).toBe(0)
    // At a steady rate, turnDeg easing it as it eases F
    expect(turnAt(plan, 2 * leg + FLIP_SECONDS / 4)).toBeCloseTo(0.25)
    expect(turnAt(plan, pass)).toBeCloseTo(1)
    expect(turnAt(plan, pass + leg)).toBe(1)
    expect(turnAt(plan, pass + 2 * leg + FLIP_SECONDS / 4)).toBeCloseTo(0.75)
    expect(turnAt(plan, 2 * pass + leg)).toBe(0)
    // Begun on the backs, the other way round
    expect(turnAt(plan, leg, true)).toBe(1)
    expect(turnAt(plan, pass + leg, true)).toBe(0)
    // Two Flips bring them round within the pass, so every pass begins on the same side
    const twice = planOf([{ id: 'f', kind: 'flip' }, { id: 'a', kind: 'y', y: 20 }, { id: 'g', kind: 'flip' }])
    expect(turnAt(twice, FLIP_SECONDS + leg)).toBe(1)
    expect(turnAt(twice, twice.seconds)).toBe(0)
    expect(turnAt(twice, twice.seconds + FLIP_SECONDS + leg)).toBe(1)
    // Without a Flip they stay as they are
    expect(turnAt(planOf([{ id: 'a', kind: 'y', y: 20 }]), leg, true)).toBe(1)
  })

  it('counts the Flips that begin between two moments of a pass, round its end too, for live playback to turn as each begins', () => {
    const plan = planOf([{ id: 'f', kind: 'flip' }, { id: 'a', kind: 'y', y: 20 }, { id: 'g', kind: 'flip' }])
    const second = FLIP_SECONDS + 2 * leg
    expect(plan.flips).toEqual([0, expect.closeTo(second)])
    // From the very start, the first Flip included
    expect(flipsBetween(plan, undefined, 0)).toBe(1)
    expect(flipsBetween(plan, 0, second - 0.01)).toBe(0)
    expect(flipsBetween(plan, second - 0.01, second + 0.01)).toBe(1)
    // Round the end of the pass into the next, where the first one begins again
    expect(flipsBetween(plan, plan.seconds - 0.01, 0.01)).toBe(1)
    expect(flipsBetween(plan, second - 0.01, 0.01)).toBe(2)
  })
})

describe('hold to light', () => {
  it('stays flat while the light fades in, holds and fades out', () => {
    const plan = planOf([{ id: 'l', kind: 'light' }])
    expect(plan.seconds).toBeCloseTo(2 * LIGHT_FADE_SECONDS + LIGHT_HOLD_SECONDS)
    for (const t of [0, 0.25, 1, 2.25]) expect(tiltAt(plan, t)).toEqual({ x: 0, y: 0 })
    expect(lightAt(plan, 0)).toBe(0)
    expect(lightAt(plan, 0.25)).toBeCloseTo(0.5)
    expect(lightAt(plan, 0.5)).toBe(1)
    expect(lightAt(plan, 1.9)).toBe(1)
    expect(lightAt(plan, 2.25)).toBeCloseTo(0.5)
    expect(lightAt(plan, plan.seconds - 1e-6)).toBeCloseTo(0, 4)
  })

  it('holds for the seconds set, scaled by speed', () => {
    expect(planOf([{ id: 'l', kind: 'light', seconds: 3 }]).seconds).toBeCloseTo(4)
    expect(planOf([{ id: 'l', kind: 'light', seconds: 3 }], { speed: 2 }).seconds).toBeCloseTo(2)
    expect(lightHoldSeconds({ seconds: 99 })).toBe(10)
    expect(lightHoldSeconds({ seconds: Number.NaN })).toBe(LIGHT_HOLD_SECONDS)
  })

  it('plays in reflected light between the other moves, which still start and end flat', () => {
    const plan = planOf([{ id: 'a', kind: 'y', from: -10, y: 10 }, { id: 'l', kind: 'light' }])
    const swing = leg + 2 * glide(10)
    expect(plan.seconds).toBeCloseTo(swing + 2.5)
    expect(lightAt(plan, swing / 2)).toBe(0)
    expect(tiltAt(plan, swing)).toEqual({ x: expect.closeTo(0), y: expect.closeTo(0) })
    expect(lightAt(plan, swing + 1)).toBe(1)
  })

  it('fades a lit gesture in and out on its way to and from flat', () => {
    const recording = { id: 'r', name: 'R', points: [{ t: 0, x: 10, y: 0, light: 1 }, { t: 1, x: 14, y: 0, light: 1 }] }
    const plan = planOf([moveFromRecording(recording)])
    // Each join takes at least the light's fade, longer than these short glides take
    expect(plan.seconds).toBeCloseTo(2 * LIGHT_FADE_SECONDS + 1)
    expect(tiltAt(plan, 0.25).x).toBeCloseTo(5)
    expect(lightAt(plan, 0.25)).toBeCloseTo(0.5)
    expect(lightAt(plan, 1)).toBe(1)
    expect(tiltAt(plan, 1.75).x).toBeCloseTo(7)
    expect(lightAt(plan, 1.75)).toBeCloseTo(0.5)
  })

  it('marks the stretches played up to the light, for the pad to draw warm', () => {
    expect(planLitPaths(planOf([{ id: 'a', kind: 'y', from: -10, y: 10 }]))).toEqual([])
    const still = planLitPaths(planOf([{ id: 'a', kind: 'x', x: 20 }, { id: 'l', kind: 'light' }]))
    expect(still).toHaveLength(1)
    expect(still[0].every((p) => p.x === 0 && p.y === 0)).toBe(true)
    const recording = { id: 'r', name: 'R', points: [{ t: 0, x: 10, y: 0, light: 1 }, { t: 1, x: 20, y: 0, light: 1 }] }
    expect(planLitPaths(planOf([moveFromRecording(recording)]))).toEqual([[{ x: 10, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 0 }]])
  })

  it('records the light with the tilt, keeping a point when either changes', () => {
    const recording = recordingFromSamples([
      { t: 0, x: 0, y: 0, light: 0 },
      { t: 0.1, x: 0, y: 0, light: 0.333 },
      // Too little change in tilt or light: the point before just lasts longer
      { t: 0.2, x: 0.1, y: 0, light: 0.35 },
      { t: 0.3, x: 0, y: 0, light: 1 },
      { t: 0.4, x: 0, y: 0, light: 0.97 },
      // Back in reflected light, however small the step
      { t: 0.5, x: 0, y: 0, light: 0.02 },
      { t: 0.6, x: 0, y: 0, light: 0 },
    ], 60, 'R')!
    expect(recording.points).toEqual([
      { t: 0, x: 0, y: 0 },
      { t: 0.2, x: 0, y: 0, light: 0.33 },
      { t: 0.4, x: 0, y: 0, light: 1 },
      { t: 0.5, x: 0, y: 0, light: 0.02 },
      { t: 0.6, x: 0, y: 0 },
    ])
    // Played back, the recorded light comes back with it
    const plan = planOf([moveFromRecording(recording)])
    expect(lightAt(plan, 0.4)).toBeCloseTo(1)
    expect(lightAt(plan, 0.6)).toBe(0)
  })
})
