import { describe, expect, it, vi } from 'vitest'
import { projectImageIds } from '../src/cloud/repository'
import { createNote, migrateProject } from '../src/lib/notes'
import { THINNEST_GAIN, lightLayers, paperLevel, reliefPixels } from '../src/lib/relief'
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
    expect(paperLevel(image(WHITE, BLACK, BLACK), 4, 3)).toBe(1)
    expect(paperLevel(image(GREY, WHITE, BLACK), 4, 3)).toBeCloseTo(128 / 255)
    // A transparent background is plain paper at mid-grey
    expect(paperLevel(image(CLEAR, WHITE, BLACK), 4, 3)).toBe(0.5)
  })

  it('turns plain paper into mid-grey, which hard light leaves as it is, keeping white white and black black', () => {
    const relief = reliefPixels(image(GREY, WHITE, BLACK), 4, 3)
    expect(greys(relief)).toEqual([128, 128, 128, 128, 128, 255, 0, 128, 128, 128, 128, 128])
    // Opaque, so the blend never shows through to the paper unchanged
    expect(relief.filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true)
  })

  it('reads a design drawn dark on white as thicker paper, and a transparent background as plain', () => {
    expect(greys(reliefPixels(image(WHITE, BLACK, GREY), 4, 3)).slice(5, 7)).toEqual([0, 64])
    expect(greys(reliefPixels(image(CLEAR, WHITE, CLEAR), 4, 3)).slice(5, 7)).toEqual([255, 128])
  })

  it('reads only brightness, as paper has no colour: a red and a green as bright are the same grey thickness', () => {
    const relief = reliefPixels(image(CLEAR, [255, 0, 0, 255], [0, 76, 0, 255]), 4, 3)
    expect(greys(relief).slice(5, 7)).toEqual([54, 54])
    expect(Array.from(relief.slice(20, 24))).toEqual([54, 54, 54, 255])
  })

  it('reads dark parts as thinner and light parts as thicker when inverted, plain paper staying plain', () => {
    expect(greys(reliefPixels(image(GREY, WHITE, BLACK), 4, 3, true))).toEqual([128, 128, 128, 128, 128, 0, 255, 128, 128, 128, 128, 128])
    expect(greys(reliefPixels(image(CLEAR, BLACK, CLEAR), 4, 3, true)).slice(5, 7)).toEqual([255, 128])
  })

  it('splits into a layer for thicker paper to multiply and one for thinner paper to colour-dodge, plain paper neutral in both', () => {
    const relief = new Uint8ClampedArray([128, 0, 255, 64, 192].flatMap((grey) => [grey, grey, grey, 255]))
    const { thicker, thinner } = lightLayers(relief)
    expect(greys(thicker)).toEqual([255, 0, 255, 128, 255])
    expect(greys(thinner)).toEqual([0, 0, 128, 0, 85])
    expect([...thicker, ...thinner].filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true)
  })

  it('works like light through paper: thinner lets more through and thicker less, so black print stays black', () => {
    // The browser's own multiply and colour dodge, design brightness 0 to 1 under a layer value 0 to 255
    const through = (design: number, grey: number) => {
      const { thicker, thinner } = lightLayers(new Uint8ClampedArray([grey, grey, grey, 255]))
      const multiplied = design * (thicker[0] / 255)
      const dodge = thinner[0] / 255
      return multiplied === 0 ? 0 : dodge >= 1 ? 1 : Math.min(1, multiplied / (1 - dodge))
    }
    for (const design of [0, 0.2, 0.5, 1]) expect(through(design, 128)).toBeCloseTo(design)
    expect(through(0.25, 255)).toBeCloseTo(0.25 * THINNEST_GAIN, 2)
    expect(through(0, 255)).toBe(0)
    expect(through(0.8, 0)).toBe(0)
    expect(through(0.5, 64)).toBeCloseTo(0.25, 2)
    // On a mid-grey design, thinner paper shows as hard light would
    const hardLight = (design: number, grey: number) => design + (2 * grey / 255 - 1) * (1 - design)
    expect(through(0.5, 192)).toBeCloseTo(hardLight(0.5, 192), 1)
  })
})
