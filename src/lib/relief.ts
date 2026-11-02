import { useEffect, useState } from 'react'
import { loadImageUrl } from './images'
import type { Watermark } from './types'

/**
 * A watermark image as it is drawn over the banknote: light through paper that is thinner in places. Paper has no
 * colour of its own, so only each pixel's brightness counts, and a watermark only ever gets lighter: the thinner the
 * paper, the more light comes through. Its layer is colour-dodged over the design, brightening it in proportion, so it
 * keeps the banknote's colours, plain paper leaves it as it is, and dark print stays dark, as ink blocks the light.
 * Worked out per image and Invert, and shared by the canvas (as an object URL) and the export (as a canvas).
 */

/** Brightness 0 to 1 of an sRGB pixel, in whole numbers until the end so white comes out exactly 1 */
const luma = (r: number, g: number, b: number) => (2126 * r + 7152 * g + 722 * b) / 2_550_000

/**
 * The plain paper of a watermark image, from its edge pixels: mostly transparent edges mean transparency is plain paper
 * (`clear`); otherwise it is the median brightness of the opaque edge pixels.
 */
export function paperOf(data: Uint8ClampedArray, width: number, height: number) {
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
  if (levels.length === 0 || clear > levels.length) return { clear: true, level: 0.5 }
  levels.sort((a, b) => a - b)
  return { clear: false, level: levels[Math.floor(levels.length / 2)] }
}

/**
 * How much thinner the paper is at each pixel, as grey from black (plain paper) to white (the thinnest). Only
 * brightness counts, so a red and a green of the same brightness are equally thin. On transparency every shape is
 * thinner as far as it is light (white the thinnest); on an opaque background, as far as it is lighter than the
 * background. Inverted, it is the dark parts: as far as they are dark, or darker than the background. The
 * background, and on an opaque one whatever lies the other side of it, stays plain paper. Returns opaque RGBA pixels
 * the same size as the input.
 */
export function thinnessPixels(data: Uint8ClampedArray, width: number, height: number, invert = false) {
  const paper = paperOf(data, width, height)
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const level = luma(data[i], data[i + 1], data[i + 2])
    let thin = 0
    if (paper.clear) thin = invert ? 1 - level : level
    else if (!invert && level > paper.level) thin = (level - paper.level) / (1 - paper.level)
    else if (invert && level < paper.level) thin = (paper.level - level) / paper.level
    const grey = Math.round(thin * (data[i + 3] / 255) * 255)
    out[i] = out[i + 1] = out[i + 2] = grey
    out[i + 3] = 255
  }
  return out
}

/** How much more light the thinnest paper lets through than plain paper */
export const THINNEST_GAIN = 2

/**
 * The layer that colour-dodges light through the paper over the design: black (no change) for plain paper, up to
 * THINNEST_GAIN times the light for the thinnest. Brightening the design in proportion, it keeps its colours and
 * leaves black print black. Its strength is how much of that light comes through, so fading it in is more light
 * coming through, exactly, wherever the design doesn't reach white.
 */
export function lightPixels(thinness: Uint8ClampedArray) {
  const out = new Uint8ClampedArray(thinness.length)
  for (let i = 0; i < thinness.length; i += 4) {
    const gain = 1 + (thinness[i] / 255) * (THINNEST_GAIN - 1)
    out[i] = out[i + 1] = out[i + 2] = Math.round((1 - 1 / gain) * 255)
    out[i + 3] = 255
  }
  return out
}

/** Longest side the relief is worked out at, in px */
const RELIEF_MAX_PX = 1024
/** Both readings kept worked out per image, so Invert, undo and redo never wait */
const LOOKS_KEPT = 2

/** A watermark's image worked out for drawing: its light layer, colour-dodged over the design */
export interface Relief {
  canvas: HTMLCanvasElement
  url: string
}

/** What decides how a watermark's image is drawn */
export type ReliefLook = Pick<Watermark, 'invert'> & { imageId: string }

const lookKey = ({ imageId, invert }: ReliefLook) => `${imageId}|${invert ? 'invert' : ''}`

interface Source {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Each image's pixels, at most RELIEF_MAX_PX on its longest side */
const sources = new Map<string, Promise<Source | undefined>>()
const reliefs = new Map<string, Promise<Relief | undefined>>()
const ready = new Map<string, Relief>()
/** Each image's looks, latest first */
const recent = new Map<string, string[]>()

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The watermark image could not be loaded.'))
    img.src = url
  })
}

async function readSource(imageId: string): Promise<Source | undefined> {
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
  return { data: ctx.getImageData(0, 0, width, height).data, width, height }
}

function sourceOf(imageId: string) {
  let source = sources.get(imageId)
  if (!source) {
    source = readSource(imageId).catch(() => undefined)
    sources.set(imageId, source)
  }
  return source
}

async function buildRelief(look: ReliefLook): Promise<Relief | undefined> {
  const source = await sourceOf(look.imageId)
  if (!source) return undefined
  const { data, width, height } = source
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  const image = ctx.createImageData(width, height)
  image.data.set(lightPixels(thinnessPixels(data, width, height, look.invert)))
  ctx.putImageData(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? { canvas, url: URL.createObjectURL(blob) } : undefined
}

/** Keeps an image's latest looks and lets the older ones go */
function remember(look: ReliefLook, key: string) {
  const keys = [key, ...(recent.get(look.imageId) ?? []).filter((k) => k !== key)]
  for (const old of keys.splice(LOOKS_KEPT)) {
    const relief = ready.get(old)
    if (relief) URL.revokeObjectURL(relief.url)
    ready.delete(old)
    reliefs.delete(old)
  }
  recent.set(look.imageId, keys)
}

/** The watermark's image worked out for drawing over the banknote, read the way its Invert says */
export function loadRelief(look: ReliefLook): Promise<Relief | undefined> {
  const key = lookKey(look)
  let relief = reliefs.get(key)
  if (!relief) {
    const building = buildRelief(look).catch(() => undefined)
    void building.then((built) => {
      if (built && reliefs.get(key) === building) ready.set(key, built)
    })
    reliefs.set(key, building)
    relief = building
  }
  remember(look, key)
  return relief
}

/**
 * The relief for CSS, once worked out. Switching Invert keeps the last reading showing until the new one is ready, so
 * the watermark never blinks out.
 */
export function useRelief(watermark: Pick<Watermark, 'imageId' | 'invert'> | undefined) {
  const imageId = watermark?.imageId
  const invert = watermark?.invert === true
  const key = imageId ? lookKey({ imageId, invert }) : undefined
  const [loaded, setLoaded] = useState<{ key: string; imageId: string; relief?: Relief }>()
  const exact = key ? ready.get(key) ?? (loaded?.key === key ? loaded.relief : undefined) : undefined
  const previous = imageId && loaded?.imageId === imageId ? loaded.relief : undefined
  // Rendered without it: work it out, or pick it up if another view did since this one rendered
  useEffect(() => {
    if (!imageId || !key || exact) return
    let live = true
    void loadRelief({ imageId, invert }).then((relief) => {
      if (live) setLoaded({ key, imageId, relief })
    })
    return () => {
      live = false
    }
  }, [imageId, invert, key, exact])
  return exact ?? previous
}
