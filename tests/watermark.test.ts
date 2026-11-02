import { describe, expect, it, vi } from 'vitest'
import { projectImageIds } from '../src/cloud/repository'
import { createNote, migrateProject } from '../src/lib/notes'
import { THINNEST_GAIN, lightPixels, paperOf, thinnessPixels } from '../src/lib/relief'
import type { Watermark } from '../src/lib/types'
import {
  WATERMARK_DEPTH, dragWatermarkCorner, fitWatermark, maxWatermarkWidth, moveWatermark, moveWatermarkTo, newWatermark, resizeWatermark, withWatermarkImage,
} from '../src/lib/watermark'

vi.mock('../src/lib/images', () => ({ loadImageUrl: async () => undefined }))

const note = { widthMm: 100, heightMm: 50 }
const mark = (change: Partial<Watermark> = {}): Watermark => ({ xMm: 20, yMm: 10, widthMm: 20, heightMm: 10, depth: 0.6, ...change })

describe('placing a watermark', () => {
  it('keeps it wholly on the banknote, at least 2 mm and at most the banknote, its proportions kept', () => {
    expect(fitWatermark(mark({ xMm: 90.3, yMm: -5, depth: 2 }), note)).toEqual(mark({ xMm: 80, yMm: 0, depth: 1 }))
    expect(fitWatermark(mark({ widthMm: 200, heightMm: 200 }), note)).toMatchObject({ yMm: 0, widthMm: 50, heightMm: 50 })
    expect(fitWatermark(mark({ widthMm: 1, heightMm: 0.5 }), note)).toMatchObject({ widthMm: 4, heightMm: 2 })
  })

  it('repairs a damaged save, keeping its image', () => {
    const damaged = { imageId: 'img', xMm: Number.NaN, yMm: 'left', widthMm: -3, heightMm: null, depth: undefined } as unknown as Watermark
    expect(fitWatermark(damaged, note)).toEqual({ imageId: 'img', xMm: 0, yMm: 0, widthMm: 20, heightMm: 20, depth: WATERMARK_DEPTH })
  })

  it('starts as a square in the plain part: left of centre on a landscape banknote, low on a portrait one', () => {
    expect(newWatermark({ widthMm: 134, heightMm: 68 })).toEqual({ xMm: 11.5, yMm: 19, widthMm: 30.5, heightMm: 30.5, depth: WATERMARK_DEPTH })
    expect(newWatermark({ widthMm: 68, heightMm: 134 })).toEqual({ xMm: 19, yMm: 89.5, widthMm: 30.5, heightMm: 30.5, depth: WATERMARK_DEPTH })
  })

  it('resizes from its top-left corner up to the banknote edges', () => {
    const w = mark({ xMm: 60 })
    expect(maxWatermarkWidth(w, note)).toBe(40)
    expect(resizeWatermark(w, 100, note)).toEqual(mark({ xMm: 60, widthMm: 40, heightMm: 20 }))
    // Neither side goes under 2 mm
    expect(resizeWatermark(w, 1, note)).toMatchObject({ widthMm: 4, heightMm: 2 })
  })

  it('drags a corner with the opposite corner fixed, the proportions kept and the size snapped', () => {
    // Out from the bottom-right: the top-left stays
    expect(dragWatermarkCorner(mark(), 'se', 10.2, 0, note)).toEqual(mark({ widthMm: 30, heightMm: 15 }))
    // In from the top-left, mostly downwards: the bottom-right stays at 40, 20
    expect(dragWatermarkCorner(mark(), 'nw', 0, 4, note)).toEqual(mark({ xMm: 28, yMm: 14, widthMm: 12, heightMm: 6 }))
    // Stops at the banknote's edges
    expect(dragWatermarkCorner(mark(), 'se', 500, 0, note)).toEqual(mark({ widthMm: 80, heightMm: 40 }))
    expect(dragWatermarkCorner(mark(), 'nw', -500, 0, note)).toEqual(mark({ xMm: 0, yMm: 0, widthMm: 40, heightMm: 20 }))
  })

  it('moves by a drag or a nudge, snapped and kept on the banknote', () => {
    expect(moveWatermark(mark(), 3.2, -20, note)).toEqual(mark({ xMm: 23, yMm: 0 }))
    expect(moveWatermark(mark(), 500, 500, note)).toEqual(mark({ xMm: 80, yMm: 40 }))
  })

  it("takes a new image's proportions about its centre", () => {
    expect(withWatermarkImage(mark({ heightMm: 20 }), 'img', 0.5, note)).toEqual({ imageId: 'img', ...mark({ yMm: 15 }) })
    // An image whose size is unknown keeps the current shape
    expect(withWatermarkImage(mark(), 'img', undefined, note)).toEqual({ imageId: 'img', ...mark() })
  })

  it('keeps Invert only when it is on, and drops what it does not know', () => {
    expect(fitWatermark(mark({ invert: true }), note)).toEqual(mark({ invert: true }))
    expect(fitWatermark(mark({ invert: false }), note)).toEqual(mark())
    expect(fitWatermark({ ...mark(), blend: 'screen', fill: '#ffffff' } as unknown as Watermark, note)).toEqual(mark())
  })

  it('keeps reading a new image the same way round', () => {
    expect(withWatermarkImage(mark({ invert: true }), 'img', undefined, note)).toEqual({ imageId: 'img', ...mark({ invert: true }) })
  })

  it('keeps its place when the banknote turns or changes size', () => {
    const square = mark({ xMm: 10, yMm: 10, heightMm: 20 })
    expect(moveWatermarkTo(square, note, { widthMm: 50, heightMm: 100 })).toEqual(mark({ xMm: 0, yMm: 30, heightMm: 20 }))
  })
})

describe('a saved watermark', () => {
  const saved = (watermark: unknown) => {
    const n = createNote({ name: 'N', x: 0, y: 0, widthMm: 100, heightMm: 50, color: '#fff' })
    return migrateProject({ id: 'p', name: 'P', createdAt: 0, updatedAt: 0, notes: [{ ...n, watermark }] }).notes[0]
  }

  it('comes back from a save, put back on its banknote if it was off it', () => {
    expect(saved(mark({ imageId: 'img' })).watermark).toEqual(mark({ imageId: 'img' }))
    expect(saved(mark({ xMm: 500 })).watermark).toEqual(mark({ xMm: 80 }))
    expect(saved(mark({ imageId: 'img', invert: true })).watermark).toEqual(mark({ imageId: 'img', invert: true }))
  })

  it('is left out when there is none, or it is not a watermark at all', () => {
    expect('watermark' in saved(undefined)).toBe(false)
    expect('watermark' in saved('oops')).toBe(false)
  })

  it('has its artwork uploaded with the project', () => {
    const n = { ...createNote({ name: 'N', x: 0, y: 0, widthMm: 100, heightMm: 50, color: '#fff' }), faceImageId: 'face', watermark: mark({ imageId: 'mark' }) }
    expect(projectImageIds({ id: 'p', name: 'P', createdAt: 0, updatedAt: 0, notes: [n] })).toEqual(['face', 'mark'])
  })
})

describe('the watermark relief', () => {
  const WHITE = [255, 255, 255, 255]
  const BLACK = [0, 0, 0, 255]
  const GREY = [128, 128, 128, 255]
  const CLEAR = [0, 0, 0, 0]
  /** A 4 × 3 image: `edge` all round, and two pixels inside */
  const image = (edge: number[], a: number[], b: number[]) =>
    new Uint8ClampedArray([edge, edge, edge, edge, edge, a, b, edge, edge, edge, edge, edge].flat())
  const greys = (pixels: Uint8ClampedArray) => Array.from({ length: pixels.length / 4 }, (_, i) => pixels[i * 4])

  it("reads the plain paper from the image's edges", () => {
    expect(paperOf(image(WHITE, BLACK, BLACK), 4, 3)).toEqual({ clear: false, level: 1 })
    expect(paperOf(image(GREY, WHITE, BLACK), 4, 3).level).toBeCloseTo(128 / 255)
    // A transparent background is plain paper
    expect(paperOf(image(CLEAR, WHITE, BLACK), 4, 3)).toEqual({ clear: true, level: 0.5 })
  })

  it('reads the light parts as thinner paper, as far as they are lighter than the background, which stays plain', () => {
    const thin = thinnessPixels(image(BLACK, WHITE, GREY), 4, 3)
    expect(greys(thin)).toEqual([0, 0, 0, 0, 0, 255, 128, 0, 0, 0, 0, 0])
    expect(thin.filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true)
    // Darker than the background is plain paper too: a watermark is never thicker
    expect(greys(thinnessPixels(image(GREY, WHITE, BLACK), 4, 3)).slice(5, 7)).toEqual([255, 0])
    expect(greys(thinnessPixels(image(WHITE, BLACK, GREY), 4, 3))).toEqual(Array(12).fill(0))
  })

  it('reads every shape on transparency as thinner, as far as it is light and opaque', () => {
    expect(greys(thinnessPixels(image(CLEAR, WHITE, GREY), 4, 3)).slice(5, 7)).toEqual([255, 128])
    expect(greys(thinnessPixels(image(CLEAR, [255, 255, 255, 128], BLACK), 4, 3)).slice(5, 7)).toEqual([128, 0])
  })

  it('reads the dark parts as thinner instead when inverted, the background staying plain', () => {
    expect(greys(thinnessPixels(image(WHITE, BLACK, GREY), 4, 3, true))).toEqual([0, 0, 0, 0, 0, 255, 127, 0, 0, 0, 0, 0])
    expect(greys(thinnessPixels(image(GREY, WHITE, BLACK), 4, 3, true)).slice(5, 7)).toEqual([0, 255])
    expect(greys(thinnessPixels(image(CLEAR, BLACK, GREY), 4, 3, true)).slice(5, 7)).toEqual([255, 127])
    expect(greys(thinnessPixels(image(CLEAR, [0, 0, 0, 128], WHITE), 4, 3, true)).slice(5, 7)).toEqual([128, 0])
  })

  it('reads only brightness, as paper has no colour: a red and a green as bright are equally thin', () => {
    const thin = thinnessPixels(image(CLEAR, [255, 0, 0, 255], [0, 76, 0, 255]), 4, 3)
    expect(greys(thin).slice(5, 7)).toEqual([54, 54])
    expect(Array.from(thin.slice(20, 24))).toEqual([54, 54, 54, 255])
  })

  it('turns thinness into light to colour-dodge: none for plain paper, up to THINNEST_GAIN times the light', () => {
    const thin = new Uint8ClampedArray([0, 255, 128].flatMap((grey) => [grey, grey, grey, 255]))
    const light = lightPixels(thin)
    expect(greys(light)).toEqual([0, 128, 85])
    expect(light.filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true)
  })

  it('only ever brightens, in proportion, so plain paper stays as it is and black print stays black', () => {
    // The browser's colour dodge at a strength (opacity), over a design brightness 0 to 1, for a thinness 0 to 255
    const through = (design: number, thin: number, strength = 1) => {
      const dodge = lightPixels(new Uint8ClampedArray([thin, thin, thin, 255]))[0] / 255
      const dodged = design === 0 ? 0 : dodge >= 1 ? 1 : Math.min(1, design / (1 - dodge))
      return design + strength * (dodged - design)
    }
    for (const design of [0, 0.2, 0.5, 1]) expect(through(design, 0)).toBeCloseTo(design)
    for (const design of [0.1, 0.3, 0.5]) for (const thin of [64, 128, 255]) expect(through(design, thin)).toBeGreaterThan(design)
    expect(through(0, 255)).toBe(0)
    expect(through(0.25, 255)).toBeCloseTo(0.25 * THINNEST_GAIN, 2)
    // Fading it in is more light coming through: at half strength, half the extra light
    expect(through(0.25, 255, 0.5)).toBeCloseTo(0.25 * (1 + (THINNEST_GAIN - 1) / 2), 2)
  })
})
