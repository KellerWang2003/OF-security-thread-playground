import { useEffect, useState } from 'react'
import { loadImageUrl } from './images'
import type { Watermark, WatermarkBlend } from './types'
import { DEFAULT_BLEND } from './watermark'

/**
 * A watermark image as it is drawn over the banknote: a layer blended in the watermark's blend mode, where the mode's
 * neutral leaves the design as it is (mid-grey for Hard and Soft light, white for Multiply, black for Screen), so
 * plain paper never shows. Worked out per image, blend and fill, and shared by the canvas (as an object URL) and
 * the export (a canvas).
 */

/** Brightness 0 to 1 of an sRGB pixel, in whole numbers until the end so white comes out exactly 1 */
const luma = (r: number, g: number, b: number) => (2126 * r + 7152 * g + 722 * b) / 2_550_000

/**
 * The plain paper of a watermark image, from its edge pixels: mostly transparent edges mean transparency is plain
 * paper (`clear`, at mid-grey); otherwise it is the median brightness of the opaque edge pixels.
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

/** The plain-paper level of a watermark image, 0 to 1 (mid-grey when transparency is plain paper) */
export const paperLevel = (data: Uint8ClampedArray, width: number, height: number) => paperOf(data, width, height).level

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

/**
 * An SVG with every shape recoloured to `fill` (#rrggbb), as a layer for hard-light blending: the fill's lightness
 * is how thin (white) or thick (black) the paper is under every shape, whatever colour it was drawn in, and its hue
 * tints the design, which no paper can (so it is there to explore). Plain paper stays mid-grey: transparency, or on
 * an opaque background its edge colour, with shapes as strong as they stand out from it.
 */
export function fillPixels(data: Uint8ClampedArray, width: number, height: number, fill: string) {
  const paper = paperOf(data, width, height)
  const colour = [1, 3, 5].map((at) => parseInt(fill.slice(at, at + 2), 16) / 255)
  const away = (i: number) => (Math.abs(luma(data[i], data[i + 1], data[i + 2]) - paper.level) * data[i + 3]) / 255
  // On an opaque background the shape that stands out most is all shape
  let most = 0
  if (!paper.clear) for (let i = 0; i < data.length; i += 4) most = Math.max(most, away(i))
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const shape = paper.clear ? data[i + 3] / 255 : most > 0 ? away(i) / most : 0
    for (let c = 0; c < 3; c++) out[i + c] = Math.round((0.5 + (colour[c] - 0.5) * shape) * 255)
    out[i + 3] = 255
  }
  return out
}

/**
 * The layer for a blend mode, from the one for Hard light (mid-grey plain paper): Soft light uses it as it is;
 * Multiply keeps only what darkens, with plain paper white; Screen only what lightens, with plain paper black. Each
 * part that shows comes out as strong as Hard light draws it.
 */
export function blendPixels(layer: Uint8ClampedArray, blend: WatermarkBlend) {
  if (blend === 'hard-light' || blend === 'soft-light') return layer
  const out = new Uint8ClampedArray(layer.length)
  for (let i = 0; i < layer.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = layer[i + c]
      out[i + c] = blend === 'multiply' ? (v >= 128 ? 255 : Math.round((v * 255) / 128)) : v <= 128 ? 0 : Math.round(((v - 128) * 255) / 127)
    }
    out[i + 3] = 255
  }
  return out
}

/** Longest side the relief is worked out at, in px */
const RELIEF_MAX_PX = 1024
/** Blends and fills kept worked out per image, so undo and redo don't wait; older ones are let go */
const LOOKS_KEPT = 4
/** While a fill is dragged through colours, a new look is only worked out once it settles this long */
const SETTLE_MS = 60

export interface Relief {
  canvas: HTMLCanvasElement
  url: string
}

/** What decides how a watermark's image is drawn */
export type ReliefLook = Pick<Watermark, 'blend' | 'fill'> & { imageId: string }

const lookKey = ({ imageId, blend = DEFAULT_BLEND, fill }: ReliefLook) => `${imageId}|${blend}|${fill ?? ''}`

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
  const layer = look.fill ? fillPixels(data, width, height, look.fill) : reliefPixels(data, width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  const pixels = ctx.createImageData(width, height)
  pixels.data.set(blendPixels(layer, look.blend ?? DEFAULT_BLEND))
  ctx.putImageData(pixels, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return undefined
  return { canvas, url: URL.createObjectURL(blob) }
}

/** Keeps an image's latest few looks and lets the older ones go */
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

/** The watermark's image worked out for drawing over the banknote in its blend and fill */
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
 * The relief's object URL for CSS, once worked out. Changing the blend or fill keeps the last one showing until the
 * new one is ready, so the watermark never blinks out.
 */
export function useRelief(watermark: Pick<Watermark, 'imageId' | 'blend' | 'fill'> | undefined) {
  const imageId = watermark?.imageId
  const blend = watermark?.blend
  const fill = watermark?.fill
  const key = imageId ? lookKey({ imageId, blend, fill }) : undefined
  const [loaded, setLoaded] = useState<{ key: string; imageId: string; url?: string }>()
  const exact = key ? ready.get(key)?.url ?? (loaded?.key === key ? loaded.url : undefined) : undefined
  const previous = imageId && loaded?.imageId === imageId ? loaded.url : undefined
  // Rendered without it: work it out (once a changing fill settles), or pick it up if another view did since
  useEffect(() => {
    if (!imageId || !key || exact) return
    let live = true
    const timer = setTimeout(() => {
      void loadRelief({ imageId, blend, fill }).then((relief) => {
        if (live) setLoaded({ key, imageId, url: relief?.url })
      })
    }, previous ? SETTLE_MS : 0)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [imageId, blend, fill, key, exact, previous])
  return exact ?? previous
}
