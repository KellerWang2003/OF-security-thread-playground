import { describe, expect, it, vi } from 'vitest'
import { exportGlow, playbackLights, playbackTilts } from '../src/lib/exportRender'
import { LIGHT_CONE_DEG, LIGHT_FULL_DEG, backlightAt, lightCone, offAxisDeg } from '../src/lib/light'
import { lensState } from '../src/lib/lens'
import { lightAt, playbackPlan, tiltAt } from '../src/lib/moves'
import type { TiltSettings } from '../src/lib/types'

vi.mock('../src/lib/images', () => ({ loadImageUrl: async () => undefined }))

const frames = [10, 10, 10].map((length, i) => ({ id: String(i), kind: 'color' as const, color: '#000', name: '', length }))
const base = { cycleDeg: 40, cycleXDeg: 80, effect: 'both', transition: 0, speed: 1, curve: 'linear', holdSeconds: 0 } as TiltSettings

describe('the light cone', () => {
  it('measures how far the banknote faces away, whichever way it tilts', () => {
    expect(offAxisDeg({ x: 0, y: 0 })).toBe(0)
    expect(offAxisDeg({ x: 0, y: -25 })).toBeCloseTo(25)
    expect(offAxisDeg({ x: 30, y: 0 })).toBeCloseTo(30)
    // Both at once face further away than either alone
    expect(offAxisDeg({ x: 20, y: 20 })).toBeGreaterThan(20)
  })

  it('lets all the light through near flat, none past the cone, and fades smoothly between', () => {
    expect(lightCone({ x: 0, y: 0 })).toBe(1)
    expect(lightCone({ x: 0, y: LIGHT_FULL_DEG })).toBe(1)
    expect(lightCone({ x: 0, y: -LIGHT_CONE_DEG })).toBe(0)
    expect(lightCone({ x: 60, y: 0 })).toBe(0)
    const middle = (LIGHT_FULL_DEG + LIGHT_CONE_DEG) / 2
    expect(lightCone({ x: 0, y: middle })).toBeCloseTo(0.5)
    expect(lightCone({ x: 0, y: 20 })).toBeGreaterThan(lightCone({ x: 0, y: 30 }))
  })

  it('backlights as far as the banknote is held to the light, times what the tilt lets through', () => {
    expect(backlightAt(0, { x: 0, y: 0 })).toBe(0)
    expect(backlightAt(0.4, { x: 0, y: 0 })).toBeCloseTo(0.4)
    expect(backlightAt(1, { x: 0, y: 20 })).toBeCloseTo(lightCone({ x: 0, y: 20 }))
    expect(backlightAt(1, { x: 0, y: 45 })).toBe(0)
    expect(backlightAt(3, { x: 0, y: 0 })).toBe(1)
  })
})

describe('exported light', () => {
  it('holds each frame to the light as live playback does, in step with its tilt', () => {
    const tilt = { ...base, moves: [{ id: 'a', kind: 'y', from: -10, y: 10 }, { id: 'l', kind: 'light' }] } as TiltSettings
    const plan = playbackPlan(tilt, lensState(tilt, frames))
    const fps = 30
    const tilts = playbackTilts({ tilt, frames }, fps)
    const lights = playbackLights({ tilt, frames }, fps)
    expect(lights).toHaveLength(tilts.length)
    lights.forEach((light, i) => {
      expect(light).toBeCloseTo(lightAt(plan, i / fps))
      expect(tilts[i]).toEqual(tiltAt(plan, i / fps))
    })
    // In reflected light while it tilts, and up to the light by the end
    expect(Math.max(...lights.slice(0, fps))).toBe(0)
    expect(Math.max(...lights)).toBe(1)
  })

  it('glows like the canvas: the lamp switch lights every frame, through the light cone at its tilt', () => {
    expect(exportGlow(0, { x: 0, y: 0 })).toBe(0)
    expect(exportGlow(0, { x: 0, y: 0 }, true)).toBe(1)
    expect(exportGlow(0.5, 0)).toBeCloseTo(0.5)
    expect(exportGlow(0.5, 0, true)).toBe(1)
    expect(exportGlow(1, 20)).toBeCloseTo(lightCone({ x: 0, y: 20 }))
    expect(exportGlow(1, { x: 50, y: 0 }, true)).toBe(0)
  })
})
