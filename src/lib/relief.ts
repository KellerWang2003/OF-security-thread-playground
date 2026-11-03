import { useEffect, useState } from 'react'
import { clamp } from './frames'
import { loadImageUrl } from './images'
import type { Watermark, WatermarkLevels } from './types'
import { LEVELS_GAP } from './watermark'

/**
 * A watermark image as it is drawn over the banknote: light through paper that is thinner in places. Paper has no
 * colour of its own, so only each pixel's brightness counts, and a watermark only ever gets lighter: the thinner the
 * paper, the more light comes through. Its layer is colour-dodged over the design, brightening it in proportion, so it
 * keeps the banknote's colours, plain paper leaves it as it is, and dark print stays dark, as ink blocks the light.
 * Each image is read once per Invert into how thin the paper is at each pixel; the levels (set by hand, or Auto,
 * fitted to that reading) then shape it into the light layer through a lookup table, which is quick, so dragging a
 * handle redraws the watermark as you go. The canvas and the export draw the same layer.
 */

/** Brightness 0 to 1 of an sRGB pixel, in whole numbers until the end so white comes out exactly 1 */
const luma = (r: number, g: number, b: number) => (2126 * r + 7152 * g + 722 * b) / 2_550_000

/** Middle of some numbers (sorts them) */
const median = (values: number[]) => {
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)]
}

/**
 * The plain paper of a watermark image, from its edge pixels: mostly transparent edges mean transparency is plain paper
 * (`clear`); otherwise it is the median brightness of the opaque edge pixels, and `spread` how far they stray from it
 * (a JPEG's speckle, a scan's grain), as a robust standard deviation.
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
  if (levels.length === 0 || clear > levels.length) return { clear: true, level: 0.5, spread: 0 }
  const level = median(levels)
  return { clear: false, level, spread: 1.4826 * median(levels.map((l) => Math.abs(l - level))) }
}

/**
 * How much thinner the paper is at each pixel, 0 (plain paper) to 255 (the thinnest), one byte a pixel. Only
 * brightness counts, so a red and a green of the same brightness are equally thin. On transparency every shape is
 * thinner as far as it is light (white the thinnest); on an opaque background, as far as it is lighter than the
 * background. Inverted, it is the dark parts: as far as they are dark, or darker than the background. The
 * background, and on an opaque one whatever lies the other side of it, stays plain paper.
 */
export function thinness(data: Uint8ClampedArray, width: number, height: number, invert = false) {
  const paper = paperOf(data, width, height)
  const out = new Uint8ClampedArray(width * height)
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    const level = luma(data[i], data[i + 1], data[i + 2])
    let thin = 0
    if (paper.clear) thin = invert ? 1 - level : level
    else if (!invert && level > paper.level) thin = (level - paper.level) / (1 - paper.level)
    else if (invert && level < paper.level) thin = (paper.level - level) / paper.level
    out[p] = Math.round(thin * (data[i + 3] / 255) * 255)
  }
  return out
}

/** How far above the plain paper's own speckle Auto starts the watermark, in spreads of it */
const SPECKLE_SPREADS = 4
/** Share of what shows that Auto lets reach the thinnest paper, so a few stray pixels don't set the strongest end */
const AUTO_CLIP = 0.005
/** Fewer pixels than this share of the image above the start, and Auto leaves the strongest end at the thinnest */
const AUTO_MIN_SHARE = 0.003

/**
 * Levels fitted to the image as read: the watermark starts just above the plain paper's own speckle (its edges'
 * spread), so a JPEG's background stays plain, and the strongest part of the image, bar a few stray pixels, reaches
 * the thinnest paper, so a faint image comes up to full strength. Midtones are left as they are.
 */
export function autoLevels(data: Uint8ClampedArray, width: number, height: number, thin: Uint8ClampedArray, invert = false): WatermarkLevels {
  const paper = paperOf(data, width, height)
  // How thin the speckle reads: thinness is brightness past the paper, over the room it has that way
  const room = invert ? paper.level : 1 - paper.level
  let low = paper.clear || room <= 0 ? 0 : Math.min(1, (SPECKLE_SPREADS * paper.spread) / room)
  const counts = new Uint32Array(256)
  for (const t of thin) counts[t]++
  const from = Math.floor(low * 255) + 1
  let shown = 0
  for (let v = from; v < 256; v++) shown += counts[v]
  let high = 1
  if (shown >= AUTO_MIN_SHARE * thin.length) {
    let skip = AUTO_CLIP * shown
    let v = 255
    for (; v > from; v--) {
      skip -= counts[v]
      if (skip < 0) break
    }
    high = v / 255
  }
  // Rounded so the speckle stays under the start and the strongest part still reaches the end
  low = Math.ceil(Math.min(low, 1 - LEVELS_GAP) * 1000) / 1000
  return { low, high: Math.floor(clamp(high, low + LEVELS_GAP, 1) * 1000) / 1000, gamma: 1 }
}

/** How much more light the thinnest paper lets through than plain paper */
export const THINNEST_GAIN = 2

/** The levels as a curve on how thin the paper is, 0 to 1: nothing below the start, the thinnest from the strongest end */
export function levelsCurve({ low, high, gamma }: WatermarkLevels) {
  const span = Math.max(1e-6, high - low)
  return (t: number) => clamp((t - low) / span, 0, 1) ** (1 / gamma)
}

/**
 * The light that colour-dodges through each thinness 0 to 255, through the levels: black (no change) for plain paper,
 * up to THINNEST_GAIN times the light for the thinnest. Brightening the design in proportion, it keeps its colours and
 * leaves black print black. Its strength is how much of that light comes through, so fading it in is more light
 * coming through, exactly, wherever the design doesn't reach white.
 */
export function lightTable(levels: WatermarkLevels) {
  const curve = levelsCurve(levels)
  const table = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) table[v] = Math.round((1 - 1 / (1 + curve(v / 255) * (THINNEST_GAIN - 1))) * 255)
  return table
}

/** The light layer for a reading, through its levels, as opaque grey RGBA pixels */
export function lightPixels(thin: Uint8ClampedArray, levels: WatermarkLevels) {
  const table = lightTable(levels)
  const out = new Uint8ClampedArray(thin.length * 4)
  // Whole pixels at a time; the byte order of the platform decides where alpha goes
  const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1
  const words = new Uint32Array(256)
  for (let v = 0; v < 256; v++) {
    const g = table[v]
    words[v] = little ? ((255 << 24) | (g << 16) | (g << 8) | g) >>> 0 : ((g << 24) | (g << 16) | (g << 8) | 255) >>> 0
  }
  const pixels = new Uint32Array(out.buffer)
  for (let p = 0; p < thin.length; p++) pixels[p] = words[thin[p]]
  return out
}

/** Longest side the image is read at, in px */
const RELIEF_MAX_PX = 1024
/** Both readings kept per image, so Invert, undo and redo never wait */
const READINGS_KEPT = 2
/** Light layers kept per reading: a drag draws one at every step, and undo usually goes back only a little */
const DRAWN_KEPT = 3

/** An image read the way its Invert says: how thin the paper is at each pixel, and the levels Auto fits to it */
export interface Reading {
  key: string
  thin: Uint8ClampedArray
  width: number
  height: number
  auto: WatermarkLevels
}

/** A watermark's light layer, drawn from its reading through its levels, to colour-dodge over the design */
export interface Relief {
  canvas: HTMLCanvasElement
}

/** What decides how a watermark's image is drawn */
export type ReliefLook = Pick<Watermark, 'invert' | 'levels'> & { imageId: string }

const readingKey = (imageId: string, invert: boolean | undefined) => `${imageId}|${invert ? 'invert' : ''}`

interface Source {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Each image's pixels, at most RELIEF_MAX_PX on its longest side */
const sources = new Map<string, Promise<Source | undefined>>()
const readings = new Map<string, Promise<Reading | undefined>>()
const ready = new Map<string, Reading>()
/** Each image's readings, latest first */
const recent = new Map<string, string[]>()
/** Each reading's light layers, latest first, by levels */
const drawn = new Map<string, { levels: string; relief: Relief }[]>()

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

async function read(imageId: string, invert: boolean, key: string): Promise<Reading | undefined> {
  const source = await sourceOf(imageId)
  if (!source) return undefined
  const { data, width, height } = source
  const thin = thinness(data, width, height, invert)
  return { key, thin, width, height, auto: autoLevels(data, width, height, thin, invert) }
}

/** Keeps an image's latest readings and lets the older ones go, with their light layers */
function remember(imageId: string, key: string) {
  const keys = [key, ...(recent.get(imageId) ?? []).filter((k) => k !== key)]
  for (const old of keys.splice(READINGS_KEPT)) {
    ready.delete(old)
    readings.delete(old)
    drawn.delete(old)
  }
  recent.set(imageId, keys)
}

/** The watermark's image read the way its Invert says */
export function loadReading(imageId: string, invert: boolean | undefined): Promise<Reading | undefined> {
  const key = readingKey(imageId, invert)
  let reading = readings.get(key)
  if (!reading) {
    const building = read(imageId, invert === true, key).catch(() => undefined)
    void building.then((done) => {
      if (done && readings.get(key) === building) ready.set(key, done)
    })
    readings.set(key, building)
    reading = building
  }
  remember(imageId, key)
  return reading
}

/** The light layer for a reading through these levels; drawn once and kept while it is among the latest */
export function reliefOf(reading: Reading, levels: WatermarkLevels): Relief | undefined {
  const key = `${levels.low}|${levels.high}|${levels.gamma}`
  const kept = drawn.get(reading.key) ?? []
  const found = kept.find((d) => d.levels === key)
  if (found) {
    drawn.set(reading.key, [found, ...kept.filter((d) => d !== found)])
    return found.relief
  }
  const canvas = document.createElement('canvas')
  canvas.width = reading.width
  canvas.height = reading.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  const image = ctx.createImageData(reading.width, reading.height)
  image.data.set(lightPixels(reading.thin, levels))
  ctx.putImageData(image, 0, 0)
  const relief = { canvas }
  drawn.set(reading.key, [{ levels: key, relief }, ...kept].slice(0, DRAWN_KEPT))
  return relief
}

/** The watermark's light layer for an export: read the way its Invert says, through its levels (Auto's without) */
export async function loadRelief({ imageId, invert, levels }: ReliefLook): Promise<Relief | undefined> {
  const reading = await loadReading(imageId, invert)
  return reading && reliefOf(reading, levels ?? reading.auto)
}

/**
 * The watermark's image as read, once worked out. Switching Invert keeps the last reading showing until the new one is
 * ready, so the watermark never blinks out.
 */
export function useReading(watermark: Pick<Watermark, 'imageId' | 'invert'> | undefined): Reading | undefined {
  const imageId = watermark?.imageId
  const invert = watermark?.invert === true
  const key = imageId ? readingKey(imageId, invert) : undefined
  const [loaded, setLoaded] = useState<{ key: string; imageId: string; reading?: Reading }>()
  const exact = key ? ready.get(key) ?? (loaded?.key === key ? loaded.reading : undefined) : undefined
  const previous = imageId && loaded?.imageId === imageId ? loaded.reading : undefined
  // Rendered without it: work it out, or pick it up if another view did since this one rendered
  useEffect(() => {
    if (!imageId || !key || exact) return
    let live = true
    void loadReading(imageId, invert).then((reading) => {
      if (live) setLoaded({ key, imageId, reading })
    })
    return () => {
      live = false
    }
  }, [imageId, invert, key, exact])
  return exact ?? previous
}

/** The watermark's light layer for the canvas, through its levels (Auto's without), once its image is read */
export function useRelief(watermark: Pick<Watermark, 'imageId' | 'invert' | 'levels'> | undefined): Relief | undefined {
  const reading = useReading(watermark)
  return reading && reliefOf(reading, watermark?.levels ?? reading.auto)
}

/** Pixels for a light layer shown `px` wide: as many as it shows at, never more than it has */
export function reliefPixels(relief: Relief, px: number) {
  const { width, height } = relief.canvas
  const k = Math.min(1, Math.max(1, Math.round(px)) / width)
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

/** Draws a light layer onto a canvas, smoothly scaled to its size */
export function paintRelief(canvas: HTMLCanvasElement, relief: Relief) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(relief.canvas, 0, 0, canvas.width, canvas.height)
}
