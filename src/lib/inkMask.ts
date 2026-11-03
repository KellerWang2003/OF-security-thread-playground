import { useEffect, useState } from 'react'
import { clamp } from './frames'
import { AUTO_CLIP, AUTO_MIN_SHARE, SPECKLE_SPREADS, luma, paperOf, sourceOf } from './relief'
import type { MagneticInk } from './types'

/**
 * Where magnetic ink goes on its image: how much ink each pixel takes, worked out once per image and Invert and kept as
 * a mask, which the canvas clips the ink's colours and bar to (a CSS mask over them) and the export draws through. The
 * image's pixels come from the watermark's reader (`sourceOf`, at most 1024 px), which keeps them for both.
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

/** Masks kept, the latest first: each image's two readings and a few more, so Invert, undo and redo never wait */
const MASKS_KEPT = 6

const maskKey = (imageId: string, invert: boolean | undefined) => `${imageId}|${invert ? 'invert' : ''}`
const building = new Map<string, Promise<InkMask | undefined>>()
const ready = new Map<string, InkMask>()
const recent: string[] = []

async function build(imageId: string, invert: boolean, key: string): Promise<InkMask | undefined> {
  const source = await sourceOf(imageId)
  if (!source) return undefined
  const { data, width, height } = source
  const coverage = inkCoverage(data, width, height, invert)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  const image = ctx.createImageData(width, height)
  for (let p = 0; p < coverage.length; p++) image.data[p * 4 + 3] = coverage[p]
  ctx.putImageData(image, 0, 0)
  return { key, canvas, url: canvas.toDataURL() }
}

/** Keeps the latest masks and lets the older ones go */
function remember(key: string) {
  const at = recent.indexOf(key)
  if (at >= 0) recent.splice(at, 1)
  recent.unshift(key)
  for (const old of recent.splice(MASKS_KEPT)) {
    building.delete(old)
    ready.delete(old)
  }
}

/** Magnetic ink's mask, read the way its Invert says */
export function loadInkMask(imageId: string, invert: boolean | undefined): Promise<InkMask | undefined> {
  const key = maskKey(imageId, invert)
  let mask = building.get(key)
  if (!mask) {
    const made = build(imageId, invert === true, key).catch(() => undefined)
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
 * Magnetic ink's mask for the canvas, once worked out. Switching Invert keeps the last mask showing until the new one is
 * ready, so the ink never blinks out.
 */
export function useInkMask(ink: Pick<MagneticInk, 'imageId' | 'invert'> | undefined): InkMask | undefined {
  const imageId = ink?.imageId
  const invert = ink?.invert === true
  const key = imageId ? maskKey(imageId, invert) : undefined
  const [loaded, setLoaded] = useState<{ key: string; imageId: string; mask?: InkMask }>()
  const exact = key ? ready.get(key) ?? (loaded?.key === key ? loaded.mask : undefined) : undefined
  const previous = imageId && loaded?.imageId === imageId ? loaded.mask : undefined
  // Rendered without it: work it out, or pick it up if another view did since this one rendered
  useEffect(() => {
    if (!imageId || !key || exact) return
    let live = true
    void loadInkMask(imageId, invert).then((mask) => {
      if (live) setLoaded({ key, imageId, mask })
    })
    return () => {
      live = false
    }
  }, [imageId, invert, key, exact])
  return exact ?? previous
}
