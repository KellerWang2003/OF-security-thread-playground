import { describe, expect, it, vi } from 'vitest'
import { projectImageIds } from '../src/cloud/repository'
import { createNote, migrateProject } from '../src/lib/notes'
import { blendPixels, fillPixels, paperLevel, paperOf, reliefPixels } from '../src/lib/relief'
import type { Watermark, WatermarkBlend } from '../src/lib/types'
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

  it('keeps its fill only for a new SVG, and its blend for any image', () => {
    const filled = mark({ blend: 'screen', fill: '#ff0000' })
    expect(withWatermarkImage(filled, 'svg', undefined, note, true)).toEqual({ imageId: 'svg', ...filled })
    expect(withWatermarkImage(filled, 'png', undefined, note)).toEqual({ imageId: 'png', ...mark({ blend: 'screen' }) })
  })

  it('keeps a blend and a fill, dropping ones it does not know and leaving Hard light unsaid', () => {
    expect(fitWatermark(mark({ blend: 'multiply', fill: '#FFAA00' }), note)).toEqual(mark({ blend: 'multiply', fill: '#ffaa00' }))
    expect(fitWatermark(mark({ blend: 'hard-light' }), note)).toEqual(mark())
    expect(fitWatermark({ ...mark(), blend: 'difference', fill: 'red' } as unknown as Watermark, note)).toEqual(mark())
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
    expect(saved(mark({ imageId: 'img', blend: 'soft-light', fill: '#123abc' })).watermark).toEqual(mark({ imageId: 'img', blend: 'soft-light', fill: '#123abc' }))
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

  it('tells transparent plain paper from an opaque one', () => {
    expect(paperOf(image(CLEAR, WHITE, BLACK), 4, 3)).toEqual({ clear: true, level: 0.5 })
    expect(paperOf(image(WHITE, BLACK, BLACK), 4, 3)).toEqual({ clear: false, level: 1 })
  })

  it("recolours every shape of an SVG to its fill, whatever colour it was drawn in, and leaves plain paper mid-grey", () => {
    const pixel = (pixels: Uint8ClampedArray, at: number) => Array.from(pixels.slice(at * 4, at * 4 + 4))
    // On transparency a grey shape takes the fill as fully as a black one would; a half-covered pixel takes half
    const white = fillPixels(image(CLEAR, GREY, [0, 0, 0, 128]), 4, 3, '#ffffff')
    expect(pixel(white, 5)).toEqual([255, 255, 255, 255])
    expect(pixel(white, 6)).toEqual([192, 192, 192, 255])
    expect(greys(white).filter((_, i) => i !== 5 && i !== 6).every((grey) => grey === 128)).toBe(true)
    // Its hue shows too, which no paper could do
    expect(pixel(fillPixels(image(CLEAR, BLACK, CLEAR), 4, 3, '#ff0000'), 5)).toEqual([255, 0, 0, 255])
    // On an opaque background a shape counts as far as it stands out from it
    expect(greys(fillPixels(image(WHITE, BLACK, GREY), 4, 3, '#000000')).slice(4, 7)).toEqual([128, 0, 64])
  })

  it("makes plain paper each blend's neutral, and keeps only what that blend can show, as strong as hard light draws it", () => {
    const layer = new Uint8ClampedArray([128, 0, 255, 64, 192].flatMap((grey) => [grey, grey, grey, 255]))
    const shown = (blend: WatermarkBlend) => greys(blendPixels(layer, blend))
    expect(shown('hard-light')).toEqual([128, 0, 255, 64, 192])
    expect(shown('soft-light')).toEqual([128, 0, 255, 64, 192])
    expect(shown('multiply')).toEqual([255, 0, 255, 128, 255])
    expect(shown('screen')).toEqual([0, 0, 255, 0, 129])
  })
})
