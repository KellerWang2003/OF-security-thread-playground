// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// An image as the reader gets it: an SVG of its own small size, or pixels
const picture = vi.hoisted(() => ({ value: { width: 80, height: 100, vector: true } }))
vi.mock('../src/lib/images', () => ({ loadImageUrl: async () => 'blob:test' }))
vi.mock('../src/lib/imageWork', () => ({ pictureOf: async () => ({ source: {}, ...picture.value }) }))

import { canvasDetail, exportDetail, readSource } from '../src/lib/relief'

beforeEach(() => {
  // jsdom has no 2D canvas: one that reads back as many pixels as it is big
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    drawImage: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  }) as unknown as CanvasRenderingContext2D)
})
afterEach(() => vi.restoreAllMocks())

const sizeOf = async (detail: Parameters<typeof readSource>[1]) => {
  const source = await readSource('image', detail)
  return source && [source.width, source.height]
}

describe('how much detail watermarks and magnetic ink are read at', () => {
  it('reads more once the canvas shows them bigger than the usual reading', () => {
    expect(canvasDetail()).toEqual({ vector: 1024, raster: 1024 })
    expect(canvasDetail(900)).toEqual({ vector: 1024, raster: 1024 })
    expect(canvasDetail(1500)).toEqual({ vector: 2048, raster: 2048 })
  })

  it('draws an SVG as big as the detail asks, however small its own size, so it stays sharp', async () => {
    picture.value = { width: 80, height: 100, vector: true }
    expect(await sizeOf(canvasDetail())).toEqual([819, 1024])
    expect(await sizeOf(canvasDetail(1500))).toEqual([1638, 2048])
  })

  it('never reads an image past its own pixels', async () => {
    picture.value = { width: 600, height: 400, vector: false }
    expect(await sizeOf(canvasDetail(1500))).toEqual([600, 400])
    picture.value = { width: 4000, height: 3000, vector: false }
    expect(await sizeOf(canvasDetail())).toEqual([1024, 768])
  })

  it('exports from the whole image, and an SVG at least as big as the video draws it', async () => {
    picture.value = { width: 4000, height: 3000, vector: false }
    expect(await sizeOf(exportDetail(900))).toEqual([4000, 3000])
    picture.value = { width: 80, height: 100, vector: true }
    expect(await sizeOf(exportDetail(3000))).toEqual([2400, 3000])
    expect(await sizeOf(exportDetail(300))).toEqual([819, 1024])
  })
})
