import { useEffect, useState } from 'react'
import { loadImageUrl } from './images'
import type { Watermark } from './types'

/**
 * A watermark image as it is drawn over the banknote, like light through paper of varying thickness. Paper has no
 * colour of its own, so only each pixel's brightness counts. Thicker paper lets less light through: its layer is
 * multiplied over the design, darkening it. Thinner paper lets more through: its layer is colour-dodged, brightening
 * the design in proportion. Both scale the design's own brightness, so it keeps its colours, plain paper leaves it as
 * it is, and dark print stays dark over either, as ink blocks the light. Worked out per image and Invert, and shared
 * by the canvas (as object URLs) and the export (as canvases).
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
 * How thick the paper is at each pixel, as grey: mid-grey is plain paper, lighter is thinner and darker is thicker.
 * Only brightness counts, so a red and a green of the same brightness are the same thickness. The paper level
 * becomes mid-grey, white stays white (the thinnest) and black stays black (the thickest), whatever the paper level;
 * transparent pixels are plain paper. Inverted, dark parts are thinner and light parts thicker. Returns opaque RGBA
 * pixels the same size as the input.
 */
export function reliefPixels(data: Uint8ClampedArray, width: number, height: number, invert = false) {
  const paper = paperLevel(data, width, height)
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const level = luma(data[i], data[i + 1], data[i + 2])
    let relief = 0.5
    if (level > paper && paper < 1) relief = 0.5 + (0.5 * (level - paper)) / (1 - paper)
    else if (level < paper && paper > 0) relief = 0.5 - (0.5 * (paper - level)) / paper
    if (invert) relief = 1 - relief
    const grey = Math.round((0.5 + (relief - 0.5) * (data[i + 3] / 255)) * 255)
    out[i] = out[i + 1] = out[i + 2] = grey
    out[i + 3] = 255
  }
  return out
}

/** How much more light the thinnest paper (white in the relief) lets through than plain paper */
export const THINNEST_GAIN = 2

/**
 * The two layers light through the paper is drawn with, from the relief (mid-grey plain paper). Thicker parts make
 * a layer to multiply: white where the paper is plain or thinner, down to black (no light) for the thickest. Thinner
 * parts make a layer to colour-dodge: black where the paper is plain or thicker, up to THINNEST_GAIN times the light
 * for the thinnest. At mid-grey design this matches hard light; over darker print, thinner parts show less.
 */
export function lightLayers(relief: Uint8ClampedArray) {
  const thicker = new Uint8ClampedArray(relief.length)
  const thinner = new Uint8ClampedArray(relief.length)
  for (let i = 0; i < relief.length; i += 4) {
    const v = relief[i]
    const gain = v <= 128 ? 1 : 1 + ((v - 128) / 127) * (THINNEST_GAIN - 1)
    thicker[i] = thicker[i + 1] = thicker[i + 2] = v >= 128 ? 255 : Math.round((v * 255) / 128)
    thinner[i] = thinner[i + 1] = thinner[i + 2] = Math.round((1 - 1 / gain) * 255)
    thicker[i + 3] = thinner[i + 3] = 255
  }
  return { thicker, thinner }
}

/** Longest side the relief is worked out at, in px */
const RELIEF_MAX_PX = 1024
/** Both readings kept worked out per image, so Invert, undo and redo never wait */
const LOOKS_KEPT = 2

export interface ReliefLayer {
  canvas: HTMLCanvasElement
  url: string
}

/** A watermark's image worked out for drawing: thicker paper multiplied over the design, thinner colour-dodged */
export interface Relief {
  thicker: ReliefLayer
  thinner: ReliefLayer
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

async function buildLayer(pixels: Uint8ClampedArray, width: number, height: number): Promise<ReliefLayer | undefined> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  const image = ctx.createImageData(width, height)
  image.data.set(pixels)
  ctx.putImageData(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? { canvas, url: URL.createObjectURL(blob) } : undefined
}

async function buildRelief(look: ReliefLook): Promise<Relief | undefined> {
  const source = await sourceOf(look.imageId)
  if (!source) return undefined
  const { data, width, height } = source
  const layers = lightLayers(reliefPixels(data, width, height, look.invert))
  const [thicker, thinner] = await Promise.all([buildLayer(layers.thicker, width, height), buildLayer(layers.thinner, width, height)])
  if (thicker && thinner) return { thicker, thinner }
  for (const layer of [thicker, thinner]) if (layer) URL.revokeObjectURL(layer.url)
  return undefined
}

/** Keeps an image's latest looks and lets the older ones go */
function remember(look: ReliefLook, key: string) {
  const keys = [key, ...(recent.get(look.imageId) ?? []).filter((k) => k !== key)]
  for (const old of keys.splice(LOOKS_KEPT)) {
    const relief = ready.get(old)
    if (relief) for (const layer of [relief.thicker, relief.thinner]) URL.revokeObjectURL(layer.url)
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
 * The relief's layers for CSS, once worked out. Switching Invert keeps the last reading showing until the new one is
 * ready, so the watermark never blinks out.
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
