import { useEffect, useState } from 'react'
import { clamp } from './frames'
import { AUTO_CLIP, AUTO_MIN_SHARE, SPECKLE_SPREADS, type Detail, canvasDetail, exportDetail, luma, paperOf, readSource, sourceOf } from './relief'
import type { MagneticInk } from './types'

/**
 * Where magnetic ink goes on its image: how much ink each pixel takes, worked out once per image and Invert and kept as
 * a mask, which the canvas clips the ink's colours and bar to (a CSS mask over them) and the export draws through. The
 * image's pixels come from the watermark's reader (`sourceOf`, 1024 px, or 2048 zoomed in), which keeps them for both.
 */

/**
 * How much ink each pixel takes, 0 (none) to 255 (full), one byte a pixel. The shape is whatever stands out from the
 * image's background, read from its edges as the watermark's plain paper is (`paperOf`): on transparency, whatever is
 * opaque, whatever its colour; on an opaque background, whatever is lighter or darker than it, as far as it is, past the
 * background's own speckle (so a JPEG's stays clear), with the strongest part, bar a few stray pixels, at full ink, so a
 * faint scan prints solid. Only brightness counts, as for the watermark. Inverted, the ink goes round the shape instead.
 */
export function inkCoverage(data: Uint8ClampedArray, width: number, height: number, invert = false) {
  const paper = paperOf(data, width, height)
  const n = width * height
  const out = new Uint8ClampedArray(n)
  if (paper.clear) {
    for (let p = 0; p < n; p++) out[p] = data[p * 4 + 3]
  } else {
    const floor = SPECKLE_SPREADS * paper.spread
    // As far as it can stand out either way, past the speckle
    const room = Math.max(paper.level, 1 - paper.level) - floor
    const counts = new Uint32Array(256)
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const off = Math.abs(luma(data[i], data[i + 1], data[i + 2]) - paper.level) - floor
      const v = off > 0 && room > 0 ? Math.round(clamp(off / room, 0, 1) * data[i + 3]) : 0
      out[p] = v
      counts[v]++
    }
    // The strongest part, bar a few stray pixels, takes full ink; too few pixels stand out to tell, and it is left as read
    const shown = n - counts[0]
    let strongest = 255
    if (shown >= AUTO_MIN_SHARE * n) {
      let skip = AUTO_CLIP * shown
      for (; strongest > 1; strongest--) {
        skip -= counts[strongest]
        if (skip < 0) break
      }
    }
    if (strongest < 255) for (let p = 0; p < n; p++) out[p] = Math.round((out[p] * 255) / strongest)
  }
  if (invert) for (let p = 0; p < n; p++) out[p] = 255 - out[p]
  return out
}

/** Magnetic ink's shape as a mask: its alpha is how much ink each pixel takes */
export interface InkMask {
  key: string
  canvas: HTMLCanvasElement
  /** The same as an image, for a CSS mask */
  url: string
}

/** Masks kept, the latest first: each image both ways round at both details and a few more, so Invert, undo, redo and zooming never wait */
const MASKS_KEPT = 10

const maskKey = (imageId: string, invert: boolean | undefined, detail: Detail) => `${imageId}@${detail.vector}/${detail.raster}|${invert ? 'invert' : ''}`
const building = new Map<string, Promise<InkMask | undefined>>()
const ready = new Map<string, InkMask>()
const recent: string[] = []

/** How much ink each pixel of an image's pixels takes, as a canvas whose alpha it is */
function maskCanvas({ data, width, height }: { data: Uint8ClampedArray; width: number; height: number }, invert: boolean) {
  const coverage = inkCoverage(data, width, height, invert)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  const image = ctx.createImageData(width, height)
  for (let p = 0; p < coverage.length; p++) image.data[p * 4 + 3] = coverage[p]
  ctx.putImageData(image, 0, 0)
  return canvas
}

async function build(imageId: string, invert: boolean, key: string, detail: Detail): Promise<InkMask | undefined> {
  const source = await sourceOf(imageId, detail)
  const canvas = source && maskCanvas(source, invert)
  if (!canvas) return undefined
  // Saved as a PNG in the background, so a big mask doesn't hold up the page
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve))
  return { key, canvas, url: blob ? URL.createObjectURL(blob) : canvas.toDataURL() }
}

/** Keeps the latest masks and lets the older ones go */
function remember(key: string) {
  const at = recent.indexOf(key)
  if (at >= 0) recent.splice(at, 1)
  recent.unshift(key)
  for (const old of recent.splice(MASKS_KEPT)) {
    const mask = ready.get(old)
    if (mask?.url.startsWith('blob:')) URL.revokeObjectURL(mask.url)
    building.delete(old)
    ready.delete(old)
  }
}

/** Magnetic ink's mask, read the way its Invert says, at `detail` (the usual without) */
export function loadInkMask(imageId: string, invert: boolean | undefined, detail: Detail = canvasDetail()): Promise<InkMask | undefined> {
  const key = maskKey(imageId, invert, detail)
  let mask = building.get(key)
  if (!mask) {
    const made = build(imageId, invert === true, key, detail).catch(() => undefined)
    void made.then((done) => {
      if (done && building.get(key) === made) ready.set(key, done)
    })
    building.set(key, made)
    mask = made
  }
  remember(key)
  return mask
}

/**
 * Magnetic ink's mask for an export, drawn `px` across in it: read from the whole image, as uploaded (an SVG at least as
 * big as it is drawn). Read afresh and not kept, as it can be far bigger than the canvas needs
 */
export async function exportInkMask(imageId: string, invert: boolean | undefined, px: number): Promise<InkMask | undefined> {
  const source = await readSource(imageId, exportDetail(px)).catch(() => undefined)
  const canvas = source && maskCanvas(source, invert === true)
  return canvas && { key: '', canvas, url: '' }
}

/**
 * Magnetic ink's mask for the canvas, once worked out: in more detail once it shows `shownPx` device pixels across, past
 * what the usual reading has. Switching Invert, or zooming in, keeps the last mask showing until the new one is ready,
 * so the ink never blinks out.
 */
export function useInkMask(ink: Pick<MagneticInk, 'imageId' | 'invert'> | undefined, shownPx?: number): InkMask | undefined {
  const imageId = ink?.imageId
  const invert = ink?.invert === true
  const detail = canvasDetail(shownPx)
  const key = imageId ? maskKey(imageId, invert, detail) : undefined
  const [loaded, setLoaded] = useState<{ key: string; imageId: string; mask?: InkMask }>()
  const exact = key ? ready.get(key) ?? (loaded?.key === key ? loaded.mask : undefined) : undefined
  const previous = imageId && loaded?.imageId === imageId ? loaded.mask : undefined
  // Rendered without it: work it out, or pick it up if another view did since this one rendered
  useEffect(() => {
    if (!imageId || !key || exact) return
    let live = true
    void loadInkMask(imageId, invert, detail).then((mask) => {
      if (live) setLoaded({ key, imageId, mask })
    })
    return () => {
      live = false
    }
  }, [imageId, invert, key, exact, detail])
  return exact ?? previous
}
