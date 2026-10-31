import { describe, expect, it } from 'vitest'
import { acrossTilt, axisDirection, coverageAt, cyclesFrom, cycleFraction, fittingRepeat, frameAt, lensFrom, repeatFit, samplesAcrossWidth } from '../src/lib/lens'

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
    expect(frameAt(cycleFraction(0, 64, 'centre'), 5)).toBe(2)
    expect(frameAt(cycleFraction(-25, 64, 'centre'), 5)).toBe(0)
    expect(frameAt(cycleFraction(0, 64, 'start'), 5)).toBe(0)
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
    expect(frameAt(cycleFraction(64, 64, 'start'), 5)).toBe(4)
    expect(frameAt(cycleFraction(70, 64, 'start'), 5)).toBe(0)
  })
})
