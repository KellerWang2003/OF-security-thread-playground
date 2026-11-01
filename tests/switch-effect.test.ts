import { describe, expect, it } from 'vitest'
import { framesReached, lensState, type LensEffect } from '../src/lib/lens'
import { migrateProject } from '../src/lib/notes'
import { switchEffect } from '../src/lib/switchEffect'
import type { TiltSettings } from '../src/lib/types'

const frames = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, kind: 'color' as const, color: '#000', length: 10 }))
const PRESETS: LensEffect[] = ['updown', 'side', 'both', 'reveal']
const apply = (tilt: TiltSettings, effect: LensEffect) => {
  const next = { ...tilt, ...switchEffect(tilt, lensState(tilt, frames), effect) }
  return { tilt: next, lens: lensState(next, frames) }
}
const hidden = (tilt: TiltSettings, axis: 'x' | 'y') => {
  const lens = lensState(tilt, frames)
  const on = axis === 'x' ? lens.cycleX : lens.cycleY
  return on ? frames.length - framesReached({ frames, tilt }, axis, lens).size : 0
}

describe('switching lens effects', () => {
  const start = { cycleDeg: 30, transition: 0, effect: 'updown' } as TiltSettings

  it('round-trips through every pair of effects without leaving hidden frames behind', () => {
    const all: LensEffect[] = [...PRESETS, 'custom']
    for (const from of all) for (const via of all) for (const to of PRESETS) {
      let t = apply(start, from).tilt
      t = apply(t, via).tilt
      t = apply(t, to).tilt
      const lens = lensState(t, frames)
      // Every preset's fast tilt plays its Cycle of 30° and so reaches every frame
      expect(Math.min(...[lens.cycleY, lens.cycleX].filter((c): c is number => c != null)), `${from} → ${via} → ${to}`).toBe(30)
      if (to === 'reveal') {
        expect(hidden(t, lens.revealAxis)).toBe(0)
        expect(hidden(t, lens.revealAxis === 'y' ? 'x' : 'y')).toBe(2)
      } else {
        expect(hidden(t, 'x') + hidden(t, 'y'), `${from} → ${via} → ${to}`).toBe(0)
      }
    }
  })

  it('works the same with Partial reveal hidden on up/down', () => {
    const r = apply({ ...start, revealAxis: 'x' }, 'reveal')
    expect(r.lens.cycleX).toBe(30)
    expect(r.lens.cycleY).toBeGreaterThan(180)
    for (const to of ['updown', 'side', 'both'] as const) expect(apply(r.tilt, to).lens).toMatchObject(to === 'side' ? { cycleX: 30, cycleY: null } : { cycleY: 30 })
  })

  it('ignores a stale side cycle on the presets, and resets a carried cycle over 180°', () => {
    expect(lensState({ ...start, effect: 'side', cycleXDeg: 676 }, frames).cycleX).toBe(30)
    const slowCustom = { ...start, effect: 'custom', cycleDeg: 400, cycleXDeg: 676 } as TiltSettings
    expect(apply(slowCustom, 'side').lens.cycleX).toBe(30)
    const fastCustom = { ...start, effect: 'custom', cycleDeg: 400, cycleXDeg: 45 } as TiltSettings
    expect(apply(fastCustom, 'updown').lens.cycleY).toBe(45)
  })

  it('moves an old Vertical cycle from cycleXDeg into the Cycle, once', () => {
    const note = { id: 'n', name: 'n', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#fff', background: 'solid', frames,
      thread: { widthMm: 4, direction: 'vertical', positionMm: 75, windows: [] }, tilt: { cycleDeg: 30, cycleXDeg: 50, effect: 'side', transition: 0 } }
    const tilt = migrateProject({ id: 'p', name: 'p', notes: [note] }).notes[0].tilt
    expect(tilt.cycleDeg).toBe(50)
    expect(tilt.cycleXDeg).toBeUndefined()
    expect(lensState(tilt, frames).cycleX).toBe(50)
  })
})
