// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setTilt, useTilt, useTiltLoop } from '../src/tilt/tilt'
import { cyclePhase, frameMix, frameSpans, sliceRange } from '../src/lib/frames'
import { lensState } from '../src/lib/lens'
import { playbackPlan } from '../src/lib/moves'
import type { TiltSettings } from '../src/lib/types'

const lensFor = (cycleDeg: number) => lensState({ cycleDeg, transition: 0 })
const planFor = (cycleDeg: number, settings: Partial<TiltSettings> = {}) => playbackPlan({ cycleDeg, transition: 0, ...settings }, lensFor(cycleDeg))

let now = 0
let nextId = 0
let callbacks = new Map<number, FrameRequestCallback>()
function tick(milliseconds: number) {
  act(() => {
    now += milliseconds
    const pending = [...callbacks.values()]
    callbacks.clear()
    for (const callback of pending) callback(now)
  })
}
function advance(milliseconds: number) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 20) tick(20)
}
beforeEach(() => {
  now = 0
  nextId = 0
  callbacks = new Map()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++nextId; callbacks.set(id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
  setTilt({ source: 'drag', angle: 0, target: 0 })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('flat-to-upward playback', () => {
  it.each([30, 75, 120])('reaches the %s° cycle (at most the ±90° tilt range), returns flat, and never tilts below it', (cycle) => {
    const top = Math.min(cycle, 90)
    renderHook(() => useTiltLoop(planFor(cycle)))
    setTilt({ source: 'wobble' })
    tick(20)
    expect(useTilt.getState().angle).toBe(0)
    const angles = [useTilt.getState().angle]
    for (let i = 0; i < 100; i++) { tick(20); angles.push(useTilt.getState().angle) }
    expect(angles[50]).toBeCloseTo(top, 8)
    expect(angles[100]).toBeCloseTo(0, 8)
    expect(Math.min(...angles)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...angles)).toBeLessThanOrEqual(top)
  })

  it.each([
    ['smooth', (1 - Math.cos(Math.PI * 0.2)) / 2],
    ['linear', 0.2],
    ['ease-in', 0.04],
    ['ease-out', 0.36],
  ] as const)('uses the %s curve while still reaching the full tilt', (curve, expected) => {
    renderHook(() => useTiltLoop(planFor(30, { curve })))
    setTilt({ source: 'wobble' })
    tick(20)
    advance(200)
    expect(useTilt.getState().angle).toBeCloseTo(expected * 30, 8)
    advance(800)
    expect(useTilt.getState().angle).toBeCloseTo(30, 8)
  })

  it('changes speed during playback without restarting the motion', () => {
    const { rerender } = renderHook(({ speed }) => useTiltLoop(planFor(30, { speed, curve: 'linear' })), { initialProps: { speed: 1 } })
    setTilt({ source: 'wobble' })
    tick(20)
    advance(200)
    expect(useTilt.getState().angle).toBeCloseTo(6, 8)
    rerender({ speed: 2 })
    tick(20)
    expect(useTilt.getState().angle).toBeCloseTo(7.2, 8)
    advance(380)
    expect(useTilt.getState().angle).toBeCloseTo(30, 8)
    advance(500)
    expect(useTilt.getState().angle).toBeCloseTo(0, 8)
  })

  it('holds at both ends for the requested time', () => {
    renderHook(() => useTiltLoop(planFor(30, { curve: 'linear', holdSeconds: 0.4 })))
    setTilt({ source: 'wobble' })
    tick(20)
    advance(1000)
    expect(useTilt.getState().angle).toBeCloseTo(30, 8)
    advance(400)
    expect(useTilt.getState().angle).toBeCloseTo(30, 8)
    advance(1000)
    expect(useTilt.getState().angle).toBeCloseTo(0, 8)
    advance(400)
    expect(useTilt.getState().angle).toBeCloseTo(0, 8)
    advance(200)
    expect(useTilt.getState().angle).toBeCloseTo(6, 8)
  })

  it('holds the current angle on pause and starts the next play run flat', () => {
    renderHook(() => useTiltLoop(planFor(30)))
    setTilt({ source: 'wobble' })
    tick(20)
    advance(500)
    const angle = useTilt.getState().angle
    expect(angle).toBeCloseTo(15, 8)
    setTilt({ source: 'slider', target: angle })
    advance(400)
    expect(useTilt.getState().angle).toBe(angle)
    setTilt({ source: 'wobble' })
    tick(20)
    expect(useTilt.getState().angle).toBe(0)
  })

  it('can scrub to the full cycle while retaining negative manual tilt', () => {
    renderHook(() => useTiltLoop(planFor(120)))
    setTilt({ source: 'slider', target: 120 })
    advance(2000)
    expect(useTilt.getState().angle).toBeCloseTo(120, 1)
    setTilt({ source: 'drag', target: -30 })
    advance(2000)
    expect(useTilt.getState().angle).toBeCloseTo(-30, 1)
  })
})

describe('frame and timeline alignment', () => {
  it('starts with the first weighted frame flat and reaches the last at the cycle endpoint', () => {
    const spans = frameSpans({ frames: [{ length: 1 }, { length: 2 }, { length: 1 }], tilt: { cycleDeg: 40 } })
    expect(sliceRange(0, spans)).toEqual([0, 10])
    expect(sliceRange(1, spans)).toEqual([10, 30])
    expect(frameMix(0, spans, 0).current).toBe(0)
    expect(frameMix(10, spans, 0).current).toBe(1)
    expect(frameMix(40, spans, 0).current).toBe(2)
    expect(frameMix(41, spans, 0).current).toBe(0)
    expect(frameMix(-1, spans, 0).current).toBe(2)
    expect(cyclePhase(0, 40)).toBe(0)
    expect(cyclePhase(40, 40)).toBe(1)
    expect(cyclePhase(41, 40)).toBeCloseTo(0.025)
  })

  it('preserves a continuous crossfade around the loop boundary', () => {
    const flat = frameMix(0, [10, 20, 10], 1)
    const end = frameMix(40, [10, 20, 10], 1)
    expect(flat.base).toBe(end.base)
    expect(flat.next).toBe(end.next)
    expect(flat.blend).toBeCloseTo(end.blend, 8)
  })
})
