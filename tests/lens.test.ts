import { describe, expect, it } from 'vitest'
import { playbackAngles, playbackTilts } from '../src/lib/exportRender'
import { frameMix, frameSpans } from '../src/lib/frames'
import { cyclesFromLens, framesReached, lensAngle, lensCycle, lensMix, lensState, revealCycle, revealOptions, tiltForPosition } from '../src/lib/lens'
import { migrateProject } from '../src/lib/notes'
import type { TiltSettings } from '../src/lib/types'

const frames = (lengths: number[]) => lengths.map((length, i) => ({ id: String(i), kind: 'color' as const, color: '#000', name: '', length }))

describe('projects from before lenses', () => {
  it('show exactly the frames they always did', () => {
    for (const lengths of [[10, 10], [5, 20, 10], [10, 10, 10, 10, 10], [1, 4, 2, 9]]) {
      for (const transition of [0, 0.4, 1]) {
        const note = { frames: frames(lengths), tilt: { cycleDeg: 37, transition, flatAt: 'start' } as TiltSettings }
        for (let angle = -80; angle <= 140; angle += 1.7) {
          const now = lensMix(note, { x: 0, y: angle })
          const before = frameMix(angle, frameSpans(note), transition)
          expect([now.base, now.next, now.current]).toEqual([before.base, before.next, before.current])
          expect(now.blend).toBeCloseTo(before.blend, 9)
        }
      }
    }
  })

  it('ignore side tilt', () => {
    const note = { frames: frames([10, 10, 10]), tilt: { cycleDeg: 30, transition: 0 } as TiltSettings }
    expect(lensMix(note, { x: 25, y: 12 })).toEqual(lensMix(note, { x: 0, y: 12 }))
  })

  it('keep their saved lens settings through the migration, and old ones get none', () => {
    const tilt = { cycleDeg: 30, transition: 0, effect: 'both', cycleXDeg: 80, runY: 'down', viewDeg: 45, playTilt: 'both' }
    const note = { id: 'n', name: 'N', x: 0, y: 0, widthMm: 100, heightMm: 50, background: 'solid', color: '#fff', frames: frames([10, 10]),
      thread: { widthMm: 4, direction: 'vertical', positionMm: 50, imageGapMm: 0, windows: { enabled: false, sections: [] } } }
    const kept = migrateProject({ id: 'p', name: 'P', createdAt: 0, updatedAt: 0, notes: [{ ...note, tilt }] }).notes[0].tilt
    expect(kept).toMatchObject(tilt)
    const old = migrateProject({ id: 'p', name: 'P', createdAt: 0, updatedAt: 0, notes: [{ ...note, tilt: { cycleDeg: 30, transition: 0 } }] }).notes[0].tilt
    expect(old.effect).toBeUndefined()
    expect(old.runY).toBeUndefined()
  })
})

describe('frames run', () => {
  it('plays 1 → 5 tilting down when set to down', () => {
    const note = { frames: frames([10, 10, 10, 10, 10]), tilt: { cycleDeg: 50, transition: 0, runY: 'down', flatAt: 'start' } as TiltSettings }
    expect(lensMix(note, { x: 0, y: -15 }).current).toBe(1)
    // Tilting up plays the loop backwards: 1, 5, 4…
    expect(lensMix(note, { x: 0, y: 15 }).current).toBe(3)
    expect(tiltForPosition(lensState(note.tilt), 0.5)).toEqual({ x: 0, y: -25 })
  })
})

describe('lens angle', () => {
  it('follows from the two cycles, and back', () => {
    const lens = lensState({ cycleDeg: 90, cycleXDeg: 301, effect: 'both', transition: 0 })
    expect(Math.abs(lensAngle(lens))).toBeCloseTo((Math.atan2(90, 301) * 180) / Math.PI)
    const back = cyclesFromLens(lensAngle(lens), lensCycle(lens))
    expect(back.cycleX).toBeCloseTo(301)
    expect(back.cycleY).toBeCloseTo(90)
  })

  it('is horizontal for Up/down and vertical for Side to side', () => {
    expect(lensAngle(lensState({ cycleDeg: 30, transition: 0 }))).toBe(0)
    expect(lensAngle(lensState({ cycleDeg: 30, transition: 0, effect: 'side' }))).toBe(90)
  })
})

describe('reveal on one tilt', () => {
  it('keeps the middle frame out of the slow tilt, even at the edge of the viewing range', () => {
    const f = frames([10, 10, 10, 10, 10])
    // Frame 3 spans 0.4 to 0.6 of the cycle: 60° ÷ 0.4 = 150°, plus a degree
    expect(revealCycle(f, 60)).toBe(151)
    const note = { frames: f, tilt: { cycleDeg: 90, transition: 0, effect: 'reveal', viewDeg: 60, flatAt: 'start' } as TiltSettings }
    const lens = lensState(note.tilt, f)
    expect(lens.cycleX).toBe(151)
    expect([...framesReached(note, 'x', lens)].sort()).toEqual([0, 1, 3, 4])
    expect([...framesReached(note, 'y', lens)].sort()).toEqual([0, 1, 2, 3, 4])
    for (let x = -60; x <= 60; x += 0.5) expect(lensMix(note, { x, y: 0 }, lens).current).not.toBe(2)
  })

  it('needs at least three frames', () => {
    expect(revealCycle(frames([10, 10]), 60)).toBeNull()
  })
})

describe('playback', () => {
  it('sweeps each chosen tilt in turn, flat → full cycle → flat', () => {
    const note = { frames: frames([10, 10, 10]), tilt: { cycleDeg: 40, cycleXDeg: 80, effect: 'both', runX: 'left', playTilt: 'both', transition: 0, speed: 1, curve: 'linear', holdSeconds: 0 } as TiltSettings }
    const tilts = playbackTilts(note, 10)
    expect(tilts).toHaveLength(40)
    expect(tilts[10].x).toBeCloseTo(0)
    expect(tilts[10].y).toBeCloseTo(40)
    expect(tilts[30].x).toBeCloseTo(-80)
    expect(tilts[30].y).toBeCloseTo(0)
  })

  it('matches the up/down angles of a project from before lenses', () => {
    const tilt = { cycleDeg: 30, transition: 0, speed: 1, curve: 'smooth' } as TiltSettings
    const old = playbackAngles(tilt, 30)
    const now = playbackTilts({ tilt, frames: frames([1, 1]) }, 30)
    expect(now).toHaveLength(old.length)
    now.forEach((t, i) => expect(t.y).toBeCloseTo(old[i], 9))
  })
})

describe('flat at the centre of frame 1', () => {
  const f = frames([10, 10, 10, 10, 10])
  const centred = { cycleDeg: 50, transition: 0 } as TiltSettings

  it('shows frame 1 for half a frame either way, then frame 2 one way and 5 the other', () => {
    const note = { frames: f, tilt: centred }
    expect(lensMix(note, { x: 0, y: 0 }).current).toBe(0)
    expect(lensMix(note, { x: 0, y: 4.9 }).current).toBe(0)
    expect(lensMix(note, { x: 0, y: -4.9 }).current).toBe(0)
    expect(lensMix(note, { x: 0, y: 6 }).current).toBe(1)
    expect(lensMix(note, { x: 0, y: -6 }).current).toBe(4)
    expect(tiltForPosition(lensState(centred, f), 0.1)).toEqual({ x: 0, y: 0 })
  })

  it('hides frames in pairs on Reveal: 2 by default, or 4', () => {
    expect(revealOptions(f, 0.1)).toEqual([2, 4])
    expect(revealCycle(f, 60, undefined, 0.1)).toBe(201)
    expect(revealCycle(f, 60, 4, 0.1)).toBe(601)
    const tilt = { ...centred, effect: 'reveal', viewDeg: 60 } as TiltSettings
    const lens = lensState(tilt, f)
    expect(lens.cycleX).toBe(201)
    expect([...framesReached({ frames: f, tilt }, 'x', lens)].sort()).toEqual([0, 1, 4])
    for (let x = -60; x <= 60; x += 0.5) expect([2, 3]).not.toContain(lensMix({ frames: f, tilt }, { x, y: 0 }, lens).current)
  })

  it('can still sit at the start edge, where one frame can hide', () => {
    expect(revealOptions(f)).toEqual([1, 3])
    expect(revealCycle(f, 60)).toBe(151)
  })
})
