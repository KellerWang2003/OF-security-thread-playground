import { clamp } from './frames'
import type { Note, Watermark } from './types'

/** Where a watermark sits on its banknote, how big it is and which way its image reads; drawing it is in relief.ts */

/** Default depth of a new watermark, 0 to 1 */
export const WATERMARK_DEPTH = 0.6
/** Position and width snap to this, in mm, as windows do */
export const WATERMARK_STEP = 0.5
/** Smallest width or height, in mm */
export const WATERMARK_MIN_MM = 2

type Size = Pick<Note, 'widthMm' | 'heightMm'>

const snap = (value: number) => Math.round(value / WATERMARK_STEP) * WATERMARK_STEP
const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const positive = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback)

/**
 * Keeps a watermark on its banknote: both sides at least WATERMARK_MIN_MM and no bigger than the banknote (its
 * proportions kept either way), wholly inside it, with position snapped to WATERMARK_STEP and depth between 0
 * and 1. Also repairs a damaged save: Invert is kept only when it is on, and anything unknown is dropped.
 */
export function fitWatermark(watermark: Watermark, note: Size): Watermark {
  let widthMm = positive(watermark.widthMm, 20)
  let heightMm = positive(watermark.heightMm, widthMm)
  const grow = Math.max(1, WATERMARK_MIN_MM / widthMm, WATERMARK_MIN_MM / heightMm)
  const shrink = Math.min(1, note.widthMm / (widthMm * grow), note.heightMm / (heightMm * grow))
  widthMm *= grow * shrink
  heightMm *= grow * shrink
  const xMm = clamp(snap(finite(watermark.xMm, 0)), 0, Math.max(0, note.widthMm - widthMm))
  const yMm = clamp(snap(finite(watermark.yMm, 0)), 0, Math.max(0, note.heightMm - heightMm))
  const fitted: Watermark = { xMm, yMm, widthMm, heightMm, depth: clamp(finite(watermark.depth, WATERMARK_DEPTH), 0, 1) }
  if (watermark.invert === true) fitted.invert = true
  return typeof watermark.imageId === 'string' ? { imageId: watermark.imageId, ...fitted } : fitted
}

/** A new, empty watermark: a square in the plain part of the banknote, left of centre (or low on a portrait one) */
export function newWatermark(note: Size): Watermark {
  const side = Math.max(WATERMARK_MIN_MM, snap(Math.min(note.widthMm, note.heightMm) * 0.45))
  const landscape = note.widthMm >= note.heightMm
  const cx = landscape ? note.widthMm * 0.2 : note.widthMm / 2
  const cy = landscape ? note.heightMm / 2 : note.heightMm * 0.78
  return fitWatermark({ xMm: cx - side / 2, yMm: cy - side / 2, widthMm: side, heightMm: side, depth: WATERMARK_DEPTH }, note)
}

/** Height ÷ width */
export const watermarkAspect = (watermark: Pick<Watermark, 'widthMm' | 'heightMm'>) => watermark.heightMm / watermark.widthMm || 1

/** The widest a watermark can be with its top-left corner where it is: up to the banknote's right and bottom edges */
export const maxWatermarkWidth = (watermark: Watermark, note: Size) =>
  Math.max(WATERMARK_MIN_MM, Math.min(note.widthMm - watermark.xMm, (note.heightMm - watermark.yMm) / watermarkAspect(watermark)))

/** A new width with the same proportions, keeping the top-left corner where it is */
export function resizeWatermark(watermark: Watermark, widthMm: number, note: Size): Watermark {
  const width = clamp(widthMm, WATERMARK_MIN_MM, maxWatermarkWidth(watermark, note))
  return fitWatermark({ ...watermark, widthMm: width, heightMm: width * watermarkAspect(watermark) }, note)
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'

/**
 * Drags a corner by (dx, dy) mm, keeping the proportions and the opposite corner where it was. The direction that
 * moved more sets the size, which snaps to WATERMARK_STEP and stops at the banknote's edges.
 */
export function dragWatermarkCorner(watermark: Watermark, corner: Corner, dx: number, dy: number, note: Size): Watermark {
  const aspect = watermarkAspect(watermark)
  const sx = corner === 'ne' || corner === 'se' ? 1 : -1
  const sy = corner === 'sw' || corner === 'se' ? 1 : -1
  // The corner that stays put
  const fx = sx > 0 ? watermark.xMm : watermark.xMm + watermark.widthMm
  const fy = sy > 0 ? watermark.yMm : watermark.yMm + watermark.heightMm
  const byX = watermark.widthMm + sx * dx
  const byY = (watermark.heightMm + sy * dy) / aspect
  const wanted = Math.abs(byX - watermark.widthMm) >= Math.abs(byY - watermark.widthMm) ? byX : byY
  const room = Math.min(sx > 0 ? note.widthMm - fx : fx, (sy > 0 ? note.heightMm - fy : fy) / aspect)
  const widthMm = clamp(snap(wanted), Math.min(WATERMARK_MIN_MM, room), Math.max(WATERMARK_MIN_MM, room))
  const heightMm = widthMm * aspect
  return fitWatermark({ ...watermark, widthMm, heightMm, xMm: sx > 0 ? fx : fx - widthMm, yMm: sy > 0 ? fy : fy - heightMm }, note)
}

/** Moves a watermark by (dx, dy) mm from where it was, snapped and kept on the banknote */
export const moveWatermark = (watermark: Watermark, dx: number, dy: number, note: Size): Watermark =>
  fitWatermark({ ...watermark, xMm: watermark.xMm + dx, yMm: watermark.yMm + dy }, note)

/** A new image: its proportions set the height, keeping the width and the centre where they are */
export function withWatermarkImage(watermark: Watermark, imageId: string, aspect: number | undefined, note: Size): Watermark {
  const heightMm = watermark.widthMm * (aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : watermark.heightMm / watermark.widthMm || 1)
  const yMm = watermark.yMm + (watermark.heightMm - heightMm) / 2
  return fitWatermark({ ...watermark, imageId, heightMm, yMm }, note)
}

/** The same place on a banknote of a new size: relative position kept, then fitted */
export function moveWatermarkTo(watermark: Watermark, from: Size, to: Size): Watermark {
  const cx = ((watermark.xMm + watermark.widthMm / 2) / from.widthMm) * to.widthMm
  const cy = ((watermark.yMm + watermark.heightMm / 2) / from.heightMm) * to.heightMm
  return fitWatermark({ ...watermark, xMm: cx - watermark.widthMm / 2, yMm: cy - watermark.heightMm / 2 }, to)
}
