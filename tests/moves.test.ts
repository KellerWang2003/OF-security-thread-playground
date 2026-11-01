import { describe, expect, it } from 'vitest'
import { playbackTilts } from '../src/lib/exportRender'
import { lensState } from '../src/lib/lens'
import { moveFromRecording, recordingFromSamples, movesOf, playbackPlan, tiltAt } from '../src/lib/moves'
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
  it('swings up/down continuously from −12° to +12° and back, without returning to flat', () => {
    const tilt = { ...base, moves: [{ id: 's', kind: 'y', from: -12, y: 12 }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    expect(plan.seconds).toBeCloseTo(2)
    expect(tiltAt(plan, 0).y).toBeCloseTo(-12)
    expect(tiltAt(plan, 0.5).y).toBeCloseTo(0)
    expect(tiltAt(plan, 1).y).toBeCloseTo(12)
    expect(tiltAt(plan, 2).y).toBeCloseTo(-12)
  })

  it('travels between moves that start and end in different places', () => {
    const tilt = { ...base, moves: [{ id: 'a', kind: 'y', from: -10, y: 10 }, { id: 'b', kind: 'x', x: 20 }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    // Two 2 s moves plus a join from −10° up/down to flat and back
    expect(plan.seconds).toBeGreaterThan(4)
    expect(tiltAt(plan, plan.seconds - 1e-6).y).toBeCloseTo(-10, 0)
  })
})
