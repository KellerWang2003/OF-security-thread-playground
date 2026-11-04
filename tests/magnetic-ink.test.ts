import { describe, expect, it, vi } from 'vitest'
import { projectImageIds } from '../src/cloud/repository'
import { inkCoverage } from '../src/lib/inkMask'
import { fitLayers, moveLayersTo } from '../src/lib/layers'
import {
  DEFAULT_INK, INK_ROLL_DEG, INK_SHIFT_DEG, barCentre, barShift, fitMagneticInk, inkRoll, inkShift, newMagneticInk, withInkImage,
} from '../src/lib/magneticInk'
import { createNote, migrateProject } from '../src/lib/notes'
import type { MagneticInk } from '../src/lib/types'
import { newWatermark } from '../src/lib/watermark'

vi.mock('../src/lib/images', () => ({ loadImageUrl: async () => undefined }))

const note = { widthMm: 100, heightMm: 50 }
const ink = (change: Partial<MagneticInk> = {}): MagneticInk => ({ xMm: 20, yMm: 10, widthMm: 20, heightMm: 10, ...DEFAULT_INK, ...change })
const banknote = (widthMm = 150, heightMm = 70) => createNote({ name: 'N', x: 0, y: 0, widthMm, heightMm, color: '#fff' })
const overlaps = (a: MagneticInk, b: { xMm: number; yMm: number; widthMm: number; heightMm: number }) =>
  a.xMm < b.xMm + b.widthMm && b.xMm < a.xMm + a.widthMm && a.yMm < b.yMm + b.heightMm && b.yMm < a.yMm + a.heightMm

describe('placing magnetic ink', () => {
  it('starts as a square right of centre and low, clear of a new watermark, gold turning green with a level bar', () => {
    const landscape = banknote()
    expect(newMagneticInk(landscape)).toEqual({ xMm: 109.5, yMm: 38.5, widthMm: 21, heightMm: 21, color: '#c9a227', tiltedColor: '#2e8b57', barAxis: 'y', barWidth: 0.3 })
    expect(overlaps(newMagneticInk(landscape), newWatermark(landscape))).toBe(false)
    // High on a portrait banknote, where the watermark goes low
    const portrait = banknote(70, 150)
    expect(newMagneticInk(portrait)).toMatchObject({ xMm: 38.5, yMm: 19.5, widthMm: 21 })
    expect(overlaps(newMagneticInk(portrait), newWatermark(portrait))).toBe(false)
  })

  it('keeps it on the banknote as the watermark is kept, and repairs a damaged save', () => {
    expect(fitMagneticInk(ink({ xMm: 90.3, yMm: -5 }), note)).toEqual(ink({ xMm: 90.3, yMm: -5 }))
    expect(fitMagneticInk(ink({ xMm: 99, yMm: -9 }), note)).toEqual(ink({ xMm: 95, yMm: -7.5 }))
    expect(fitMagneticInk(ink({ widthMm: 1, heightMm: 0.5 }), note)).toMatchObject({ widthMm: 4, heightMm: 2 })
    const damaged = { imageId: 'img', xMm: Number.NaN, yMm: 'left', widthMm: -3, heightMm: null, color: 'gold', tiltedColor: '#12345',
      barAxis: 'z', barWidth: 7, invert: 'yes', glow: true } as unknown as MagneticInk
    expect(fitMagneticInk(damaged, note)).toEqual({ imageId: 'img', xMm: 0, yMm: 0, widthMm: 20, heightMm: 20, ...DEFAULT_INK, barWidth: 1 })
    expect(fitMagneticInk(ink({ invert: true, barAxis: 'x', barWidth: 0.01 }), note)).toEqual(ink({ invert: true, barAxis: 'x', barWidth: 0.05 }))
    expect(fitMagneticInk(ink({ invert: false }), note)).toEqual(ink())
  })

  it("takes a new image's proportions about its middle, keeping the rest", () => {
    expect(withInkImage(ink({ heightMm: 20, invert: true }), 'img', 0.5, note)).toEqual({ imageId: 'img', ...ink({ yMm: 15, invert: true }) })
  })

  it('stays where it was, with the watermark, when the banknote is resized, and keeps its place when it turns', () => {
    const n = { ...banknote(), watermark: newWatermark(banknote()), magneticInk: newMagneticInk(banknote()) }
    // Wholly on the banknote before, so wholly on it after
    const narrower = fitLayers({ ...n, widthMm: 100 }, n)
    expect(narrower.magneticInk).toEqual({ ...n.magneticInk, xMm: 79 })
    expect(narrower.watermark).toEqual(n.watermark)
    // Hanging off the edge before, so left hanging, a quarter of it on
    const hanging = { ...n, magneticInk: { ...n.magneticInk!, xMm: 140 } }
    expect(fitLayers({ ...hanging, widthMm: 100 }, hanging).magneticInk).toEqual({ ...n.magneticInk, xMm: 94.75 })
    const turned = moveLayersTo({ ...n, widthMm: 70, heightMm: 150 }, n)
    // Its middle stays at 80% across and 70% down
    expect(turned.magneticInk).toEqual({ ...n.magneticInk, xMm: 45.5, yMm: 94.5 })
  })
})

describe('how magnetic ink looks at a tilt', () => {
  it('shifts from its Flat colour to its Tilted one as the banknote turns away, either way', () => {
    expect(inkShift({ x: 0, y: 0 })).toBe(0)
    expect(inkShift({ x: 0, y: INK_SHIFT_DEG })).toBe(1)
    expect(inkShift({ x: -INK_SHIFT_DEG, y: 0 })).toBe(1)
    expect(inkShift({ x: 0, y: 60 })).toBe(1)
    expect(inkShift({ x: 0, y: INK_SHIFT_DEG / 2 })).toBeCloseTo(0.5)
    expect(inkShift({ x: 0, y: -10 })).toBeCloseTo(inkShift({ x: 0, y: 10 }))
    // Both tilts together turn it further away than either alone
    expect(inkShift({ x: 10, y: 10 })).toBeGreaterThan(inkShift({ x: 0, y: 10 }))
  })

  it('rolls its bar on its own tilt only, from the middle of the shape right off its edge', () => {
    const level = ink({ barAxis: 'y', barWidth: 0.2 })
    expect(barCentre(level, inkRoll(level, { x: 0, y: 0 }))).toBe(0.5)
    expect(inkRoll(level, { x: 25, y: 0 })).toBe(0)
    // Tilting the top away rolls a level bar down, until it is wholly past the bottom edge, and no further
    expect(barCentre(level, inkRoll(level, { x: 0, y: INK_ROLL_DEG / 2 }))).toBeCloseTo(0.8)
    expect(barCentre(level, inkRoll(level, { x: 0, y: INK_ROLL_DEG }))).toBeCloseTo(1.1)
    expect(barCentre(level, inkRoll(level, { x: 0, y: -60 }))).toBeCloseTo(-0.1)
    // Turning the right side away rolls an upright bar left; up/down tilt doesn't roll it
    const upright = ink({ barAxis: 'x', barWidth: 0.2 })
    expect(inkRoll(upright, { x: INK_ROLL_DEG / 2, y: 30 })).toBe(-0.5)
    expect(inkRoll(upright, { x: 0, y: 30 })).toBe(0)
  })

  it('moves the bar on the canvas by a translate of its own size that puts its middle where the export draws it', () => {
    const level = ink({ barWidth: 0.25 })
    for (const roll of [-1, -0.3, 0, 0.6, 1]) expect(0.5 + (barShift(level, roll) / 100) * level.barWidth).toBeCloseTo(barCentre(level, roll))
  })
})

describe("magnetic ink's shape", () => {
  /** An image from a pixel at each place */
  const paint = (width: number, height: number, at: (x: number, y: number) => number[]) =>
    new Uint8ClampedArray(Array.from({ length: width * height }, (_, i) => at(i % width, Math.floor(i / width))).flat())
  const grey = (level: number, alpha = 255) => [level, level, level, alpha]
  const inside = (x: number, y: number, size = 4) => x > 0 && y > 0 && x < size - 1 && y < size - 1
  /** Transparent all round; inside, white, black and red, and a white half see-through */
  const cutout = paint(4, 4, (x, y) => (!inside(x, y) ? grey(0, 0) : [[255, 255, 255, 255], [0, 0, 0, 255], [255, 0, 0, 255], [255, 255, 255, 128]][(y - 1) * 2 + (x - 1)]))

  it('is whatever is opaque on transparency, whatever its colour', () => {
    expect(Array.from(inkCoverage(cutout, 4, 4))).toEqual([0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 128, 0, 0, 0, 0, 0])
  })

  it('follows a cutout that runs to its edges, rounded corners and all', () => {
    // A red card with rounded corners: only its corners show through, its own red no background to stand out from
    const corner = (x: number, y: number) => (x === 0 || x === 5) && (y === 0 || y === 3)
    const card = paint(6, 4, (x, y) => (corner(x, y) ? grey(0, 0) : [200, 40, 40, 255]))
    const shape = Array.from({ length: 24 }, (_, p) => (corner(p % 6, Math.floor(p / 6)) ? 0 : 255))
    expect(Array.from(inkCoverage(card, 6, 4))).toEqual(shape)
    // Inverted, only the corners take ink
    expect(Array.from(inkCoverage(card, 6, 4, true))).toEqual(shape.map((v) => 255 - v))
  })

  it('is whatever is darker or lighter than an opaque background, as far as it is', () => {
    // On white, black takes full ink and mid-grey about half
    const onWhite = paint(4, 4, (x, y) => (x === 1 && y === 1 ? grey(0) : x === 2 && y === 1 ? grey(128) : grey(255)))
    expect(Array.from(inkCoverage(onWhite, 4, 4))).toEqual([0, 0, 0, 0, 0, 255, 127, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    // On black, white takes full ink
    const onBlack = paint(4, 4, (x, y) => grey(x === 2 && y === 2 ? 255 : 0))
    expect(Array.from(inkCoverage(onBlack, 4, 4))[10]).toBe(255)
  })

  it("keeps a JPEG's speckled background clear and brings a faint scan up to full ink", () => {
    // Speckled white all round and in the middle, and a faint grey ring round it
    const speckle = (x: number, y: number) => grey((x + y) % 2 ? 250 : 255)
    const scan = paint(5, 5, (x, y) => (inside(x, y, 5) && !(x === 2 && y === 2) ? grey(180) : x === 2 && y === 2 ? grey(250) : speckle(x, y)))
    const coverage = Array.from(inkCoverage(scan, 5, 5))
    expect(coverage.filter((_, p) => inside(p % 5, Math.floor(p / 5), 5) && p !== 12).every((v) => v === 255)).toBe(true)
    expect(coverage.filter((_, p) => !inside(p % 5, Math.floor(p / 5), 5) || p === 12).every((v) => v === 0)).toBe(true)
  })

  it('goes round the shape instead when inverted', () => {
    expect(Array.from(inkCoverage(cutout, 4, 4, true))).toEqual([255, 255, 255, 255, 255, 0, 0, 255, 255, 0, 127, 255, 255, 255, 255, 255])
  })
})

describe('saved magnetic ink', () => {
  const saved = (magneticInk: unknown) =>
    migrateProject({ id: 'p', name: 'P', createdAt: 0, updatedAt: 0, notes: [{ ...banknote(100, 50), magneticInk }] }).notes[0]

  it('comes back from a save, put back on its banknote if it was off it', () => {
    expect(saved(ink({ imageId: 'img', invert: true, barAxis: 'x' })).magneticInk).toEqual(ink({ imageId: 'img', invert: true, barAxis: 'x' }))
    expect(saved(ink({ xMm: 500 })).magneticInk).toEqual(ink({ xMm: 95 }))
  })

  it('is left out when there is none, or it is not magnetic ink at all', () => {
    expect('magneticInk' in saved(undefined)).toBe(false)
    expect('magneticInk' in saved('oops')).toBe(false)
  })

  it('has its artwork uploaded with the project', () => {
    const n = { ...banknote(100, 50), faceImageId: 'face', watermark: { ...newWatermark(note), imageId: 'mark' }, magneticInk: ink({ imageId: 'ink' }) }
    expect(projectImageIds({ id: 'p', name: 'P', createdAt: 0, updatedAt: 0, notes: [n] })).toEqual(['face', 'mark', 'ink'])
  })
})
