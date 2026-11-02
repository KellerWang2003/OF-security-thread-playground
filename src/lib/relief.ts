import { useEffect, useState } from 'react'
import { loadImageUrl } from './images'

/**
 * A watermark image as it is drawn over the banknote: a grey layer, hard-light blended, where mid-grey leaves the
 * design as it is. Worked out once per image and shared by the canvas (as an object URL) and the export (a canvas).
 */

/** Brightness 0 to 1 of an sRGB pixel, in whole numbers until the end so white comes out exactly 1 */
const luma = (r: number, g: number, b: number) => (2126 * r + 7152 * g + 722 * b) / 2_550_000

/**
 * The plain-paper level of a watermark image: its edge pixels count as plain paper. Mostly transparent edges mean
 * mid-grey is plain paper; otherwise it is the median brightness of the opaque edge pixels.
 */
export function paperLevel(data: Uint8ClampedArray, width: number, height: number) {
  const levels: number[] = []
  let clear = 0
  const visit = (x: number, y: number) => {
    const i = (y * width + x) * 4
    if (data[i + 3] < 128) clear++
    else levels.push(luma(data[i], data[i + 1], data[i + 2]))
  }
  for (let x = 0; x < width; x++) {
    visit(x, 0)
    if (height > 1) visit(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    visit(0, y)
    if (width > 1) visit(width - 1, y)
  }
  if (levels.length === 0 || clear > levels.length) return 0.5
  levels.sort((a, b) => a - b)
  return levels[Math.floor(levels.length / 2)]
}

/**
 * The watermark as a grey layer for hard-light blending over the banknote: mid-grey leaves it as it is, lighter
 * brightens it (thinner paper) and darker darkens it (thicker). The paper level becomes mid-grey, white stays
 * white (the brightest highlight) and black stays black, whatever the paper level; transparent pixels are plain paper.
 * Returns opaque RGBA pixels the same size as the input.
 */
export function reliefPixels(data: Uint8ClampedArray, width: number, height: number) {
  const paper = paperLevel(data, width, height)
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const level = luma(data[i], data[i + 1], data[i + 2])
    let relief = 0.5
    if (level > paper && paper < 1) relief = 0.5 + (0.5 * (level - paper)) / (1 - paper)
    else if (level < paper && paper > 0) relief = 0.5 - (0.5 * (paper - level)) / paper
    const grey = Math.round((0.5 + (relief - 0.5) * (data[i + 3] / 255)) * 255)
    out[i] = out[i + 1] = out[i + 2] = grey
    out[i + 3] = 255
  }
  return out
}

/** Longest side the relief is worked out at, in px */
const RELIEF_MAX_PX = 1024

export interface Relief {
  canvas: HTMLCanvasElement
  url: string
}

const reliefs = new Map<string, Promise<Relief | undefined>>()
const ready = new Map<string, Relief>()

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The watermark image could not be loaded.'))
    img.src = url
  })
}

async function buildRelief(imageId: string): Promise<Relief | undefined> {
  const url = await loadImageUrl(imageId)
  if (!url) return undefined
  const img = await loadImage(url)
  // SVGs without a size of their own draw at 512 px
  const naturalWidth = img.naturalWidth || 512
  const naturalHeight = img.naturalHeight || 512
  const k = Math.min(1, RELIEF_MAX_PX / Math.max(naturalWidth, naturalHeight))
  const width = Math.max(1, Math.round(naturalWidth * k))
  const height = Math.max(1, Math.round(naturalHeight * k))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return undefined
  ctx.drawImage(img, 0, 0, width, height)
  const pixels = ctx.getImageData(0, 0, width, height)
  pixels.data.set(reliefPixels(pixels.data, width, height))
  ctx.putImageData(pixels, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return undefined
  const relief = { canvas, url: URL.createObjectURL(blob) }
  ready.set(imageId, relief)
  return relief
}

/** The watermark image worked out for drawing over the banknote, once per image */
export function loadRelief(imageId: string): Promise<Relief | undefined> {
  let relief = reliefs.get(imageId)
  if (!relief) {
    relief = buildRelief(imageId).catch(() => undefined)
    reliefs.set(imageId, relief)
  }
  return relief
}

/** The relief's object URL for CSS, once worked out */
export function useRelief(imageId: string | undefined) {
  const [loaded, setLoaded] = useState<{ id: string; url?: string }>()
  const url = imageId ? ready.get(imageId)?.url ?? (loaded?.id === imageId ? loaded.url : undefined) : undefined
  // Rendered without it: work it out, or pick it up if another view did since this one rendered
  useEffect(() => {
    if (!imageId || url) return
    let live = true
    void loadRelief(imageId).then((relief) => {
      if (live) setLoaded({ id: imageId, url: relief?.url })
    })
    return () => {
      live = false
    }
  }, [imageId, url])
  return url
}
