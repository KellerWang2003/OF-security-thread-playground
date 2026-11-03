import { describe, expect, it, vi } from 'vitest'
import { projectImageIds } from '../src/cloud/repository'
import { createNote, migrateProject } from '../src/lib/notes'
import { type Relief, THINNEST_GAIN, autoLevels, levelsCurve, lightPixels, lightTable, paperOf, reliefPixels, thinness } from '../src/lib/relief'
import type { Watermark } from '../src/lib/types'
import {
  FULL_LEVELS, GAMMA_MAX, WATERMARK_DEPTH, dragWatermarkCorner, fitLevels, fitWatermark, gammaAt, maxWatermarkWidth, midtonesAt, moveWatermark,
  moveWatermarkTo, newWatermark, resizeWatermark, withWatermarkImage,
} from '../src/lib/watermark'

vi.mock('../src/lib/images', () => ({ loadImageUrl: async () => undefined }))

const note = { widthMm: 100, heightMm: 50 }
const mark = (change: Partial<Watermark> = {}): Watermark => ({ xMm: 20, yMm: 10, widthMm: 20, heightMm: 10, depth: 0.6, ...change })

describe('placing a watermark', () => {
  it('lets it hang off the edges with a quarter of it kept on the banknote, at least 2 mm and at most the banknote', () => {
    // Off the right and the top, a quarter still on: kept where it is
    expect(fitWatermark(mark({ xMm: 90.3, yMm: -5, depth: 2 }), note)).toEqual(mark({ xMm: 90.3, yMm: -5, depth: 1 }))
    // Further off, back to a quarter of it on: 5 of its 20 mm across, 2.5 of its 10 down
    expect(fitWatermark(mark({ xMm: 99, yMm: -9 }), note)).toEqual(mark({ xMm: 95, yMm: -7.5 }))
    expect(fitWatermark(mark({ xMm: -30, yMm: 60 }), note)).toEqual(mark({ xMm: -15, yMm: 47.5 }))
    expect(fitWatermark(mark({ widthMm: 200, heightMm: 200 }), note)).toMatchObject({ yMm: 10, widthMm: 50, heightMm: 50 })
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

  it('resizes from its top-left corner, past the edges as long as a quarter stays on, up to the banknote’s size', () => {
    const w = mark({ xMm: 60 })
    expect(maxWatermarkWidth(w, note)).toBe(100)
    expect(resizeWatermark(w, 120, note)).toEqual(mark({ xMm: 60, widthMm: 100, heightMm: 50 }))
    // Near the right edge it can only grow until a quarter of it is on: 5 mm on, so 20 mm wide
    expect(maxWatermarkWidth(mark({ xMm: 95 }), note)).toBe(20)
    // Neither side goes under 2 mm
    expect(resizeWatermark(w, 1, note)).toMatchObject({ widthMm: 4, heightMm: 2 })
  })

  it('drags a corner with the opposite corner fixed, the proportions kept and the size snapped', () => {
    // Out from the bottom-right: the top-left stays
    expect(dragWatermarkCorner(mark(), 'se', 10.2, 0, note)).toEqual(mark({ widthMm: 30, heightMm: 15 }))
    // In from the top-left, mostly downwards: the bottom-right stays at 40, 20
    expect(dragWatermarkCorner(mark(), 'nw', 0, 4, note)).toEqual(mark({ xMm: 28, yMm: 14, widthMm: 12, heightMm: 6 }))
    // Out past the edges, up to the banknote's size
    expect(dragWatermarkCorner(mark(), 'se', 500, 0, note)).toEqual(mark({ widthMm: 100, heightMm: 50 }))
    expect(dragWatermarkCorner(mark(), 'nw', -500, 0, note)).toEqual(mark({ xMm: -60, yMm: -30, widthMm: 100, heightMm: 50 }))
    // Or until only a quarter of it would be on: from 5 mm inside the right edge, 20 mm wide
    expect(dragWatermarkCorner(mark({ xMm: 95, widthMm: 4, heightMm: 2 }), 'se', 500, 0, note)).toEqual(mark({ xMm: 95, widthMm: 20, heightMm: 10 }))
  })

  it('moves by a drag or a nudge, snapped, off the edges as far as keeps a quarter of it on the banknote', () => {
    expect(moveWatermark(mark(), 3.2, -20, note)).toEqual(mark({ xMm: 23, yMm: -7.5 }))
    expect(moveWatermark(mark(), 500, 500, note)).toEqual(mark({ xMm: 95, yMm: 47.5 }))
    expect(moveWatermark(mark(), -500, 0, note)).toEqual(mark({ xMm: -15 }))
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

  it('keeps levels set by hand, in range, and drops what are not levels', () => {
    const levels = { low: 0.1, high: 0.6, gamma: 1.5 }
    expect(fitWatermark(mark({ levels }), note)).toEqual(mark({ levels }))
    // The ends stay in order at least 2% apart, the midtones within 0.1 to 9.99
    expect(fitLevels({ low: 0.7, high: 0.2, gamma: 40 })).toEqual({ low: 0.7, high: 0.72, gamma: GAMMA_MAX })
    expect(fitLevels({ low: -1, high: 2, gamma: 0 })).toEqual({ low: 0, high: 1, gamma: 0.1 })
    expect(fitWatermark(mark({ levels: { low: 0.1, high: Number.NaN, gamma: 1 } }), note)).toEqual(mark())
    expect(fitWatermark({ ...mark(), levels: 'auto' } as unknown as Watermark, note)).toEqual(mark())
  })

  it('starts a new image on Auto levels', () => {
    expect(withWatermarkImage(mark({ levels: { low: 0.1, high: 0.6, gamma: 1 } }), 'img', undefined, note)).toEqual({ imageId: 'img', ...mark() })
  })

  it('places the midtones handle where the thinness comes out halfway, and back', () => {
    expect(midtonesAt(1)).toBe(0.5)
    // Left of the middle brightens the midtones, as in Photoshop
    expect(midtonesAt(2)).toBe(0.25)
    expect(gammaAt(0.25)).toBe(2)
    expect(gammaAt(0.75)).toBeCloseTo(0.42, 2)
    expect(gammaAt(0)).toBe(GAMMA_MAX)
    expect(gammaAt(1)).toBe(0.1)
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
    expect(saved(mark({ xMm: 500 })).watermark).toEqual(mark({ xMm: 95 }))
    expect(saved(mark({ imageId: 'img', invert: true })).watermark).toEqual(mark({ imageId: 'img', invert: true }))
    const levels = { low: 0.05, high: 0.8, gamma: 0.7 }
    expect(saved(mark({ imageId: 'img', levels })).watermark).toEqual(mark({ imageId: 'img', levels }))
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
  const values = (pixels: Uint8ClampedArray) => Array.from(pixels)
  const greys = (pixels: Uint8ClampedArray) => Array.from({ length: pixels.length / 4 }, (_, i) => pixels[i * 4])
  /** A bigger image from a pixel at each place */
  const paint = (width: number, height: number, at: (x: number, y: number) => number[]) =>
    new Uint8ClampedArray(Array.from({ length: width * height }, (_, i) => at(i % width, Math.floor(i / width))).flat())
  const grey = (level: number, alpha = 255) => [level, level, level, alpha]

  it("reads the plain paper from the image's edges, and how much they stray from it", () => {
    expect(paperOf(image(WHITE, BLACK, BLACK), 4, 3)).toEqual({ clear: false, level: 1, spread: 0 })
    expect(paperOf(image(GREY, WHITE, BLACK), 4, 3).level).toBeCloseTo(128 / 255)
    // A transparent background is plain paper
    expect(paperOf(image(CLEAR, WHITE, BLACK), 4, 3)).toEqual({ clear: true, level: 0.5, spread: 0 })
    // A JPEG's speckle: edges a few levels either side of 249
    const speckled = paperOf(paint(8, 6, (x, y) => grey([245, 247, 249, 251][(x + y) % 4])), 8, 6)
    expect(speckled.spread).toBeCloseTo((1.4826 * 2) / 255, 4)
  })

  it('reads the light parts as thinner paper, as far as they are lighter than the background, which stays plain', () => {
    expect(values(thinness(image(BLACK, WHITE, GREY), 4, 3))).toEqual([0, 0, 0, 0, 0, 255, 128, 0, 0, 0, 0, 0])
    // Darker than the background is plain paper too: a watermark is never thicker
    expect(values(thinness(image(GREY, WHITE, BLACK), 4, 3)).slice(5, 7)).toEqual([255, 0])
    expect(values(thinness(image(WHITE, BLACK, GREY), 4, 3))).toEqual(Array(12).fill(0))
  })

  it('reads every shape on transparency as thinner, as far as it is light and opaque', () => {
    expect(values(thinness(image(CLEAR, WHITE, GREY), 4, 3)).slice(5, 7)).toEqual([255, 128])
    expect(values(thinness(image(CLEAR, [255, 255, 255, 128], BLACK), 4, 3)).slice(5, 7)).toEqual([128, 0])
  })

  it('reads the dark parts as thinner instead when inverted, the background staying plain', () => {
    expect(values(thinness(image(WHITE, BLACK, GREY), 4, 3, true))).toEqual([0, 0, 0, 0, 0, 255, 127, 0, 0, 0, 0, 0])
    expect(values(thinness(image(GREY, WHITE, BLACK), 4, 3, true)).slice(5, 7)).toEqual([0, 255])
    expect(values(thinness(image(CLEAR, BLACK, GREY), 4, 3, true)).slice(5, 7)).toEqual([255, 127])
    expect(values(thinness(image(CLEAR, [0, 0, 0, 128], WHITE), 4, 3, true)).slice(5, 7)).toEqual([128, 0])
  })

  it('reads only brightness, as paper has no colour: a red and a green as bright are equally thin', () => {
    expect(values(thinness(image(CLEAR, [255, 0, 0, 255], [0, 76, 0, 255]), 4, 3)).slice(5, 7)).toEqual([54, 54])
  })

  it('turns thinness into light to colour-dodge: none for plain paper, up to THINNEST_GAIN times the light', () => {
    const light = lightPixels(new Uint8ClampedArray([0, 255, 128]), FULL_LEVELS)
    expect(greys(light)).toEqual([0, 128, 85])
    expect(Array.from(light.slice(4, 8))).toEqual([128, 128, 128, 255])
    expect(light.filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true)
  })

  it('reshapes the reading by its levels: nothing below the start, the thinnest from the strongest end, midtones between', () => {
    const curve = levelsCurve({ low: 0.2, high: 0.6, gamma: 1 })
    ;[0, 0, 0, 0.5, 1, 1].forEach((expected, i) => expect(curve([0, 0.1, 0.2, 0.4, 0.6, 0.9][i])).toBeCloseTo(expected))
    // Midtones above 1 brighten them; the midtones handle sits where it comes out halfway
    const bright = levelsCurve({ low: 0.2, high: 0.6, gamma: 2 })
    expect(bright(0.4)).toBeCloseTo(Math.SQRT1_2)
    expect(bright(0.2 + 0.4 * midtonesAt(2))).toBeCloseTo(0.5)
    // Plain paper stays plain whatever the levels
    for (const levels of [FULL_LEVELS, { low: 0, high: 0.02, gamma: 9.99 }, { low: 0.5, high: 0.9, gamma: 0.1 }]) expect(lightTable(levels)[0]).toBe(0)
    expect(lightTable({ low: 0, high: 0.5, gamma: 1 })[128]).toBe(128)
  })

  it('only ever brightens, in proportion, so plain paper stays as it is and black print stays black', () => {
    // The browser's colour dodge at a strength (opacity), over a design brightness 0 to 1, for a thinness 0 to 255
    const through = (design: number, thin: number, strength = 1) => {
      const dodge = lightTable(FULL_LEVELS)[thin] / 255
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

  it('is drawn at as many pixels as it shows at, never more than it has', () => {
    const relief = { canvas: { width: 1024, height: 512 } } as Relief
    expect(reliefPixels(relief, 300.4)).toEqual({ width: 300, height: 150 })
    expect(reliefPixels(relief, 4000)).toEqual({ width: 1024, height: 512 })
    expect(reliefPixels(relief, 0)).toEqual({ width: 1, height: 1 })
  })

  describe('Auto', () => {
    const auto = (data: Uint8ClampedArray, width: number, height: number, invert = false) =>
      autoLevels(data, width, height, thinness(data, width, height, invert), invert)

    it('leaves an image that already spans the full range as it is', () => {
      expect(auto(image(CLEAR, WHITE, WHITE), 4, 3)).toEqual(FULL_LEVELS)
    })

    it('brings a faint image up to full strength', () => {
      // A dark grey shape on transparency reads only a quarter thin
      expect(auto(image(CLEAR, grey(64), grey(64)), 4, 3)).toEqual({ low: 0, high: 0.25, gamma: 1 })
      // A shape a little lighter than a grey background
      const photo = paint(10, 10, (x, y) => grey(x > 2 && x < 7 && y > 2 && y < 7 ? 140 : 100))
      const levels = auto(photo, 10, 10)
      expect(levels).toEqual({ low: 0, high: 0.258, gamma: 1 })
      expect(levelsCurve(levels)(thinness(photo, 10, 10)[55] / 255)).toBe(1)
    })

    it("keeps a JPEG's speckled background plain paper, and lets a dark logo through once inverted", () => {
      const jpeg = paint(40, 30, (x, y) => (x > 12 && x < 28 && y > 8 && y < 22 ? BLACK : grey([245, 247, 249, 251][(x * 7 + y * 3) % 4])))
      const isLogo = (i: number) => {
        const x = i % 40, y = Math.floor(i / 40)
        return x > 12 && x < 28 && y > 8 && y < 22
      }
      // Read the light parts, it is only speckle, and all of it stays plain
      const plain = thinness(jpeg, 40, 30)
      expect(Math.max(...plain)).toBeGreaterThan(0)
      const curve = levelsCurve(auto(jpeg, 40, 30))
      expect(Array.from(plain).every((t) => curve(t / 255) === 0)).toBe(true)
      // Inverted, the logo is the thinnest and the speckle still plain
      const inverted = thinness(jpeg, 40, 30, true)
      const invertedCurve = levelsCurve(auto(jpeg, 40, 30, true))
      Array.from(inverted).forEach((t, i) => expect(invertedCurve(t / 255)).toBe(isLogo(i) ? 1 : 0))
    })

    it("doesn't let a few stray pixels set the strongest end", () => {
      // A grey square on transparency with two white pixels in it
      const stray = paint(52, 52, (x, y) => (x === 0 || y === 0 || x === 51 || y === 51 ? CLEAR : (x === 10 && y < 12 && y > 9) ? WHITE : grey(100)))
      expect(auto(stray, 52, 52).high).toBeCloseTo(100 / 255, 3)
    })
  })
})
