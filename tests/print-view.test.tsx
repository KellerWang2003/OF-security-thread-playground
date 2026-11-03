// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrintCanvas } from '../src/editor/PrintView'
import { createNote } from '../src/lib/notes'
import type { Note } from '../src/lib/types'

/** Artwork as a flat colour, so the print can be read back pixel by pixel */
class FakeImage {
  naturalWidth = 120
  naturalHeight = 180
  constructor(public color: string) {}
}
const ARTWORK: Record<string, string> = { 'img-a': '#ff0000', 'img-b': '#00ff00' }
// The artwork arrives after the first draw, as it does from storage
vi.mock('../src/lib/exportRender', async (original) => ({
  ...(await original<typeof import('../src/lib/exportRender')>()),
  loadArtwork: async (id: string) => new FakeImage(ARTWORK[id]),
}))

const rgba = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255)
/** What the print canvas last showed */
const shown: ImageData[] = []

beforeEach(() => {
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  // jsdom has no 2D canvas: a small one that fills rectangles, which is all the print draws
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const { width, height } = this
    const pixels = new Uint8ClampedArray(width * height * 4)
    const fill = (x: number, y: number, w: number, h: number, colour: string) => {
      for (let py = Math.max(0, Math.floor(y)); py < Math.min(height, Math.ceil(y + h)); py++)
        for (let px = Math.max(0, Math.floor(x)); px < Math.min(width, Math.ceil(x + w)); px++) pixels.set(rgba(colour), (py * width + px) * 4)
    }
    return {
      fillStyle: '#000000',
      fillRect(x: number, y: number, w: number, h: number) { fill(x, y, w, h, this.fillStyle) },
      drawImage(img: FakeImage, x: number, y: number, w: number, h: number) { fill(x, y, w, h, img.color) },
      getImageData: () => ({ data: new Uint8ClampedArray(pixels) }),
      putImageData: (data: ImageData) => { shown.push(data) },
    } as unknown as CanvasRenderingContext2D
  } as typeof HTMLCanvasElement.prototype.getContext)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  shown.length = 0
})

function imageNote(): Note {
  const note = createNote({ name: 'Birds', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#112233' })
  return { ...note, frames: ['a', 'b'].map((id) => ({ id, kind: 'image', color: '#ffffff', imageId: `img-${id}`, name: id, length: 10 })) }
}

describe('the print view', () => {
  it('weaves in image artwork that loads after the first draw', async () => {
    render(<PrintCanvas note={imageNote()} ridges={4} sizePx={60} />)
    // Before the artwork arrives the print is only ridge lines
    const before = shown.at(-1)!
    await act(async () => { await new Promise((done) => setTimeout(done, 0)) })
    const after = shown.at(-1)!
    expect(after).not.toBe(before)
    const pixels = after.width * after.height
    let red = 0
    let green = 0
    for (let p = 0; p < pixels; p++) {
      const [r, g] = after.data.subarray(p * 4, p * 4 + 2)
      if (r > 100 && g < 50) red++
      if (g > 100 && r < 50) green++
    }
    // Both frames are woven in, the one the lens shows now lit and the other faded but still there
    expect(red).toBeGreaterThan(pixels / 4)
    expect(green).toBeGreaterThan(pixels / 4)
  })
})
