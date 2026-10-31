import { describe, expect, it } from 'vitest'
import { minCycleToHide, firstReveal, slotOrder, acrossTilt, axisDirection, coverageAt, cyclesFrom, cycleFraction, fittingRepeat, frameAt, lensFrom, repeatFit, samplesAcrossWidth } from '../src/lib/lens'

describe('lens maths', () => {
  it('turns two tilt cycles into a lens and back', () => {
    const lens = lensFrom({ cycleX: 67.3, cycleY: 207, lean: 1 })
    expect(lens.angleDeg).toBeCloseTo(72, 0)
    expect(lens.cycleDeg).toBeCloseTo(64, 0)
    const back = cyclesFrom(lens)
    expect(back.cycleX).toBeCloseTo(67.3, 1)
    expect(back.cycleY).toBeCloseTo(207, 1)
  })

  it('keeps today’s horizontal lens when left/right is off', () => {
    const lens = lensFrom({ cycleX: null, cycleY: 64, lean: 1 })
    expect(lens).toEqual({ angleDeg: 0, cycleDeg: 64 })
    expect(acrossTilt(lens, 30, 10)).toBeCloseTo(10)
    expect(axisDirection(lens, 'x')).toBe(0)
  })

  it('plays a full cycle after each tilt cycle', () => {
    const lens = lensFrom({ cycleX: 40, cycleY: 120, lean: 1 })
    expect(Math.abs(acrossTilt(lens, 40, 0))).toBeCloseTo(lens.cycleDeg)
    expect(acrossTilt(lens, 0, 120)).toBeCloseTo(lens.cycleDeg)
  })

  it('flips the left/right direction with the lean', () => {
    expect(axisDirection(lensFrom({ cycleX: 60, cycleY: 60, lean: 1 }), 'x')).toBe(-1)
    expect(axisDirection(lensFrom({ cycleX: 60, cycleY: 60, lean: -1 }), 'x')).toBe(1)
  })

  it('finds frames from a centred cycle', () => {
    // Flat is frame 1 either way; outward, one side runs 2, 3 and the other 4, 5
    expect(slotOrder(5, 'centre')).toEqual([4, 3, 0, 1, 2])
    expect(frameAt(cycleFraction(0, 64, 'centre', 5), 5, 'centre')).toBe(0)
    expect(frameAt(cycleFraction(25, 64, 'centre', 5), 5, 'centre')).toBe(2)
    expect(frameAt(cycleFraction(-25, 64, 'centre', 5), 5, 'centre')).toBe(4)
    expect(frameAt(cycleFraction(0, 64, 'start', 5), 5, 'start')).toBe(0)
  })

  it('marks sideways-only parts of the cycle', () => {
    // Steep setup, reach 30°: left/right reaches 30/67 of the cycle, up/down 30/207
    expect(coverageAt(0.5 - 0.35, 0.5, 30 / 67.3, 30 / 207)).toBe('x')
    expect(coverageAt(0.5, 0.5, 30 / 67.3, 30 / 207)).toBe('both')
  })

  it('checks the print layer', () => {
    const lens = lensFrom({ cycleX: null, cycleY: 64, lean: 1 })
    const thread = { direction: 'vertical' as const, widthMm: 4, lengthMm: 75, repeatMm: 4.02 }
    expect(samplesAcrossWidth(lens, thread, 40)).toBe(Infinity)
    expect(repeatFit(lens, thread, 40, 5).fits).toBe(false)
    expect(repeatFit(lens, { ...thread, repeatMm: fittingRepeat(lens, 'vertical', 4.02, 40) }, 40, 5).fits).toBe(true)
  })
})

describe('cycle end', () => {
  it('shows the last frame at exactly one cycle, then loops', () => {
    expect(frameAt(cycleFraction(64, 64, 'start', 5), 5, 'start')).toBe(4)
    expect(frameAt(cycleFraction(70, 64, 'start', 5), 5, 'start')).toBe(0)
  })
})

describe('ping-pong and reveal check', () => {
  it('runs 1 to 5 and back down, with flat on frame 1', () => {
    expect(slotOrder(5, 'pingpong')).toEqual([3, 2, 1, 0, 1, 2, 3, 4])
    expect(frameAt(cycleFraction(0, 60, 'pingpong', 5), 5, 'pingpong')).toBe(0)
  })

  it('keeps up/down away from the aircraft even at 90° on the Steep preset', () => {
    const lens = lensFrom({ cycleX: 60, cycleY: 320, lean: 1 })
    const aircraft = [false, false, false, true, true]
    expect(firstReveal(lens, 'y', aircraft, { count: 5, flatAt: 'pingpong' })).toBeNull()
    expect(firstReveal(lens, 'x', aircraft, { count: 5, flatAt: 'pingpong' })).toBeLessThan(25)
  })
})

describe('three frames up/down, five sideways', () => {
  const hidden = [true, false, false, false, true]
  it('needs an up/down cycle over 300° with equal frames', () => {
    expect(minCycleToHide(hidden, { count: 5, flatAt: 'across' })).toBeCloseTo(300)
  })
  it('needs less when the edge frames are shorter', () => {
    // Frames 1 and 5 at half length: 1 + 1 + 1 out of 4 for the middle, edges at 0.5/4 each
    expect(minCycleToHide(hidden, { count: 5, flatAt: 'across', lengths: [0.5, 1, 1, 1, 0.5] })).toBeCloseTo(240)
  })
  it('never shows frames 1 or 5 up/down just above that cycle', () => {
    const lens = lensFrom({ cycleX: 90, cycleY: 301, lean: 1 })
    expect(firstReveal(lens, 'y', hidden, { count: 5, flatAt: 'across' })).toBeNull()
    expect(firstReveal(lens, 'x', hidden, { count: 5, flatAt: 'across' })).toBeCloseTo(27, 0)
  })
})
