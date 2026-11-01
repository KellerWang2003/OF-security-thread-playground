import { describe, expect, it } from 'vitest'
import { playbackAngles, playbackTilts } from '../src/lib/exportRender'
import { frameMix, frameSpans } from '../src/lib/frames'
import { cyclesFromLens, flatLabel, flatOffset, flatStep, framesReached, lensAngle, lensCycle, lensMix, lensState, reachSpans, revealCycle, revealMinFast, revealOptions, revealReaches, tiltForPosition } from '../src/lib/lens'
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
    const lens = lensState({ cycleDeg: 90, cycleXDeg: 301, effect: 'custom', transition: 0 })
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
  it('keeps the middle frame out of the slow tilt, at any tilt up to 90°', () => {
    const f = frames([10, 10, 10, 10, 10])
    // Frame 3 spans 0.4 to 0.6 of the cycle: 60° ÷ 0.4 = 150°, plus a degree
    expect(revealCycle(f, 60)).toBe(151)
    const note = { frames: f, tilt: { cycleDeg: 90, transition: 0, effect: 'reveal', revealWobble: 0, flatAt: 'start' } as TiltSettings }
    const lens = lensState(note.tilt, f)
    // Hidden all the way to 90°: 90° ÷ 0.4 = 225°, plus a degree
    expect(lens.cycleX).toBe(226)
    expect([...framesReached(note, 'x', lens)].sort()).toEqual([0, 1, 3, 4])
    expect([...framesReached(note, 'y', lens)].sort()).toEqual([0, 1, 2, 3, 4])
    for (let x = -90; x <= 90; x += 0.5) expect(lensMix(note, { x, y: 0 }, lens).current).not.toBe(2)
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
    // Diagonal 45°: the side tilt runs at the up/down cycle
    expect(tilts[30].x).toBeCloseTo(-40)
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

describe('flat at the middle of the middle frame', () => {
  const f = frames([10, 10, 10, 10, 10])
  const centred = { cycleDeg: 50, transition: 0 } as TiltSettings

  it('shows frame 3 for half a frame either way, then plays towards 5 one way and 1 the other', () => {
    const note = { frames: f, tilt: centred }
    expect(lensMix(note, { x: 0, y: 0 }).current).toBe(2)
    expect(lensMix(note, { x: 0, y: 4.9 }).current).toBe(2)
    expect(lensMix(note, { x: 0, y: -4.9 }).current).toBe(2)
    expect(lensMix(note, { x: 0, y: 6 }).current).toBe(3)
    expect(lensMix(note, { x: 0, y: 16 }).current).toBe(4)
    expect(lensMix(note, { x: 0, y: -6 }).current).toBe(1)
    expect(lensMix(note, { x: 0, y: -16 }).current).toBe(0)
    expect(tiltForPosition(lensState(centred, f), 0.5)).toEqual({ x: 0, y: 0 })
  })

  it('hides the outer frames on the slow tilt of Partial reveal at any angle, with a wobbling hand', () => {
    expect(revealOptions(f, 0.5)).toEqual([2, 4])
    expect(revealCycle(f, 60, undefined, 0.5)).toBe(201)
    const tilt = { ...centred, effect: 'reveal' } as TiltSettings
    const lens = lensState(tilt, f)
    // 5° of wobble on the 50° fast tilt uses 0.1 of the 0.3 to frame 1's edge: 90° ÷ 0.2 = 450°, plus a degree
    expect(lens.wobble).toBe(5)
    expect(lens.revealSafe).toBe(true)
    expect(lens.cycleX).toBe(451)
    expect([...framesReached({ frames: f, tilt }, 'x', lens)].sort()).toEqual([1, 2, 3])
    for (let x = -90; x <= 90; x += 0.5)
      for (const y of [-5, -2.5, 0, 2.5, 5]) expect([0, 4]).not.toContain(lensMix({ frames: f, tilt }, { x, y }, lens).current)
  })

  it('says when the fast cycle is too short for the wobble', () => {
    // 10° of wobble on a 30° fast tilt is a third of a cycle, past frame 1's edge before any slow tilt
    const lens = lensState({ ...centred, cycleDeg: 30, effect: 'reveal', revealWobble: 10 }, f)
    expect(lens.revealSafe).toBe(false)
    expect(revealMinFast(f, 0.5, 10)).toBe(34)
  })

  it('can still sit at the start of frame 1, where one frame can hide', () => {
    expect(revealOptions(f)).toEqual([1, 3])
    expect(revealCycle(f, 60)).toBe(151)
  })
})

describe('flat position and Partial reveal reach', () => {
  const five = frames([10, 10, 10, 10, 10])
  const four = frames([10, 10, 10, 10])

  it('defaults to the middle of the middle frame, keeps old saves, and wraps steps', () => {
    expect(flatStep({}, 5)).toBe(5)
    expect(flatStep({}, 4)).toBe(3)
    expect(flatStep({ flatAt: 'start' }, 5)).toBe(0)
    expect(flatStep({ flatAt: 'center' }, 5)).toBe(5)
    expect(flatStep({ flatAt: 4 }, 4)).toBe(4)
    expect(flatStep({ flatAt: 8 }, 4)).toBe(0)
    expect(flatLabel(5)).toBe('Middle of 3')
    expect(flatLabel(4)).toBe('Between 2 and 3')
    expect(flatLabel(0)).toBe('Start of 1')
    expect(flatOffset({ flatAt: 4 }, four)).toBeCloseTo(0.5)
  })

  it('hides 1 and 4 of four frames with flat between 2 and 3, at any slow tilt with the wobble', () => {
    const tilt = { cycleDeg: 40, transition: 0, effect: 'reveal', flatAt: 4 } as TiltSettings
    const lens = lensState(tilt, four)
    expect([...framesReached({ frames: four, tilt }, 'x', lens)].sort()).toEqual([1, 2])
    for (let x = -90; x <= 90; x += 0.5)
      for (const y of [-5, 0, 5]) expect([0, 3]).not.toContain(lensMix({ frames: four, tilt }, { x, y }, lens).current)
  })

  it('narrows the slow reach one step at a time, hiding more frames, and clamps a step past the narrowest', () => {
    const base = { cycleDeg: 60, transition: 0, effect: 'reveal', revealWobble: 2 } as TiltSettings
    const reaches = revealReaches(five, 0.5, 60, 2)
    expect(reaches.map((r) => r.hide)).toEqual([2, 4])
    expect(reaches[0].reach).toBeGreaterThan(reaches[1].reach)
    const narrow = lensState({ ...base, revealLevel: 1 }, five)
    expect([...framesReached({ frames: five, tilt: { ...base, revealLevel: 1 } }, 'x', narrow)]).toEqual([2])
    expect(lensState({ ...base, revealLevel: 9 }, five).cycleX).toBe(narrow.cycleX)
  })

  it('splits a reach where it wraps round the loop', () => {
    expect(reachSpans(0.5, 0.2)).toEqual([[0.3, 0.7]])
    expect(reachSpans(0.1, 0.2).map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)])).toEqual([[0, 0.3], [0.9, 1]])
    expect(reachSpans(0.5, 0.6)).toEqual([[0, 1]])
  })
})
