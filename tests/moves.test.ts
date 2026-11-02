import { describe, expect, it } from 'vitest'
import { playbackTilts } from '../src/lib/exportRender'
import { lensState } from '../src/lib/lens'
import {
  LIGHT_FADE_SECONDS, LIGHT_HOLD_SECONDS, lightAt, lightHoldSeconds, moveFromRecording, movesOf, planLitPaths, playbackPlan, recordingFromSamples, tiltAt,
} from '../src/lib/moves'
import { migrateProject } from '../src/lib/notes'
import type { TiltSettings } from '../src/lib/types'

const frames = [10, 10, 10].map((length, i) => ({ id: String(i), kind: 'color' as const, color: '#000', name: '', length }))
const base = { cycleDeg: 40, cycleXDeg: 80, effect: 'both', transition: 0, speed: 1, curve: 'linear', holdSeconds: 0 } as TiltSettings

describe('playback moves', () => {
  it('falls back to the old Tilt choice when there is no list', () => {
    const lens = lensState({ ...base, playTilt: 'both' }, frames)
    expect(movesOf({ ...base, playTilt: 'both' }, lens).map((m) => m.kind)).toEqual(['y', 'x'])
  })

  it('moves both tilts at once on a diagonal, to the angles set', () => {
    const tilt = { ...base, moves: [{ id: 'a', kind: 'diagonal', x: -30, y: 20 }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    expect(plan.seconds).toBeCloseTo(2)
    expect(tiltAt(plan, 0.5)).toEqual({ x: -15, y: 10 })
    expect(tiltAt(plan, 1)).toEqual({ x: -30, y: 20 })
    expect(tiltAt(plan, 2)).toEqual({ x: 0, y: 0 })
  })

  it('goes out, once round and back on a circle, and export follows it', () => {
    const tilt = { ...base, moves: [{ id: 'c', kind: 'circle', x: 30, y: 30 }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    expect(plan.seconds).toBeCloseTo(4)
    expect(tiltAt(plan, 1).y).toBeCloseTo(30)
    expect(tiltAt(plan, 1.5).x).toBeCloseTo(30, 0)
    expect(tiltAt(plan, 2).y).toBeCloseTo(-30, 0)
    expect(playbackTilts({ tilt, frames }, 10)).toHaveLength(40)
  })

  it('plays a recorded gesture in its own time, joined to flat', () => {
    const move = recordingFromSamples([{ t: 5, x: 0, y: 0 }, { t: 5.5, x: 10, y: 0 }, { t: 6, x: 10, y: 10 }], 60, 'R')!
    expect(move.points).toHaveLength(3)
    const tilt = { ...base, moves: [moveFromRecording(move)] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    expect(tiltAt(plan, 0.75)).toEqual({ x: 10, y: 5 })
  })

  it('keeps the moves through the migration', () => {
    const tilt = { ...base, moves: [{ id: 'a', kind: 'x' }] }
    const note = { id: 'n', name: 'N', x: 0, y: 0, widthMm: 100, heightMm: 50, background: 'solid', color: '#fff', frames, tilt,
      thread: { widthMm: 4, direction: 'vertical', positionMm: 50, imageGapMm: 0, windows: { enabled: false, sections: [] } } }
    expect(migrateProject({ id: 'p', name: 'P', createdAt: 0, updatedAt: 0, notes: [note] }).notes[0].tilt.moves).toEqual(tilt.moves)
  })
})

describe('swing moves', () => {
  it('glides from flat to −12°, makes one pass to +12°, then glides back to flat', () => {
    const tilt = { ...base, moves: [{ id: 's', kind: 'y', from: -12, y: 12 }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    const join = 12 / 60
    expect(plan.seconds).toBeCloseTo(1 + 2 * join)
    expect(tiltAt(plan, 0).y).toBeCloseTo(0)
    expect(tiltAt(plan, join).y).toBeCloseTo(-12)
    expect(tiltAt(plan, join + 1).y).toBeCloseTo(12)
    expect(tiltAt(plan, plan.seconds - 1e-6).y).toBeCloseTo(0, 1)
  })

  it('swings an unset up/down move once across a full cycle centred on flat', () => {
    const tilt = { ...base, moves: [{ id: 'u', kind: 'y' }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    const join = 20 / 60
    // Cycle 40°, frames run up: −20° → +20°
    expect(tiltAt(plan, join).y).toBeCloseTo(-20)
    expect(tiltAt(plan, join + 1).y).toBeCloseTo(20)
  })

  it('returns to flat between moves', () => {
    const tilt = { ...base, moves: [{ id: 'a', kind: 'y', from: -10, y: 10 }, { id: 'b', kind: 'x', from: 0, x: 20 }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    const first = 1 + 2 * (10 / 60)
    expect(tiltAt(plan, first).x).toBeCloseTo(0)
    expect(tiltAt(plan, first).y).toBeCloseTo(0)
    expect(tiltAt(plan, first + 1).x).toBeCloseTo(20)
  })
})

describe('hold to light', () => {
  const planOf = (moves: TiltSettings['moves'], settings: Partial<TiltSettings> = {}) => {
    const tilt = { ...base, ...settings, moves } as TiltSettings
    return playbackPlan(tilt, lensState(tilt, frames))
  }

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

  it('holds for the seconds set, scaled by speed, then pauses at flat in reflected light', () => {
    expect(planOf([{ id: 'l', kind: 'light', seconds: 3 }]).seconds).toBeCloseTo(4)
    expect(planOf([{ id: 'l', kind: 'light', seconds: 3 }], { speed: 2 }).seconds).toBeCloseTo(2)
    const held = planOf([{ id: 'l', kind: 'light' }], { holdSeconds: 0.5 })
    expect(held.seconds).toBeCloseTo(3)
    expect(lightAt(held, 2.75)).toBe(0)
    expect(lightHoldSeconds({ seconds: 99 })).toBe(10)
    expect(lightHoldSeconds({ seconds: Number.NaN })).toBe(LIGHT_HOLD_SECONDS)
  })

  it('plays in reflected light between the other moves, which still start and end flat', () => {
    const plan = planOf([{ id: 'a', kind: 'y', from: -10, y: 10 }, { id: 'l', kind: 'light' }])
    const swing = 1 + 2 * (10 / 60)
    expect(plan.seconds).toBeCloseTo(swing + 2.5)
    expect(lightAt(plan, swing / 2)).toBe(0)
    expect(tiltAt(plan, swing)).toEqual({ x: 0, y: 0 })
    expect(lightAt(plan, swing + 1)).toBe(1)
  })

  it('fades a lit gesture in and out on its way to and from flat', () => {
    const recording = { id: 'r', name: 'R', points: [{ t: 0, x: 10, y: 0, light: 1 }, { t: 1, x: 20, y: 0, light: 1 }] }
    const plan = planOf([moveFromRecording(recording)])
    // Each join takes at least the light's fade
    expect(plan.seconds).toBeCloseTo(2 * LIGHT_FADE_SECONDS + 1)
    expect(tiltAt(plan, 0.25).x).toBeCloseTo(5)
    expect(lightAt(plan, 0.25)).toBeCloseTo(0.5)
    expect(lightAt(plan, 1)).toBe(1)
    expect(tiltAt(plan, 1.75).x).toBeCloseTo(10)
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
