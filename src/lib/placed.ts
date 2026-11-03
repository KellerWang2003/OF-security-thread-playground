import { clamp } from './frames'
import type { Note } from './types'

/**
 * Where a layer placed on its banknote sits (the watermark, magnetic ink; `layers.ts` lists them): a box by its top-left
 * corner in mm from the banknote's top-left, its height following its image's proportions. Typed positions and widths
 * are kept exactly, in any unit; what drags, nudges or places a box snaps to PLACE_STEP itself. Every function keeps
 * the layer's other settings as they are.
 */
export interface PlacedBox {
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

export type Size = Pick<Note, 'widthMm' | 'heightMm'>

/** Drags, nudges and new boxes snap position and width to this, in mm, as windows do */
export const PLACE_STEP = 0.5
/** Smallest width or height, in mm */
export const PLACE_MIN_MM = 2

const snap = (value: number) => Math.round(value / PLACE_STEP) * PLACE_STEP
const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const positive = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback)

/**
 * A box kept on its banknote: both sides at least PLACE_MIN_MM and no bigger than the banknote (its proportions kept
 * either way), wholly inside it. Its position is kept as it is. Also repairs a damaged save. Only the box comes back.
 */
export function fitBox(box: PlacedBox, note: Size): PlacedBox {
  let widthMm = positive(box.widthMm, 20)
  let heightMm = positive(box.heightMm, widthMm)
  const grow = Math.max(1, PLACE_MIN_MM / widthMm, PLACE_MIN_MM / heightMm)
  const shrink = Math.min(1, note.widthMm / (widthMm * grow), note.heightMm / (heightMm * grow))
  widthMm *= grow * shrink
  heightMm *= grow * shrink
  const xMm = clamp(finite(box.xMm, 0), 0, Math.max(0, note.widthMm - widthMm))
  const yMm = clamp(finite(box.yMm, 0), 0, Math.max(0, note.heightMm - heightMm))
  return { xMm, yMm, widthMm, heightMm }
}

/** The layer with its box moved to `next`, kept on the banknote */
const refit = <T extends PlacedBox>(box: T, next: PlacedBox, note: Size): T => ({ ...box, ...fitBox(next, note) })

/**
 * A new, square box `share` of the banknote's short side wide, centred at those shares of its width and height: one
 * place on a landscape banknote, another on a portrait one
 */
export function newBox(note: Size, share: number, at: { landscape: [number, number]; portrait: [number, number] }): PlacedBox {
  const side = Math.max(PLACE_MIN_MM, snap(Math.min(note.widthMm, note.heightMm) * share))
  const [x, y] = note.widthMm >= note.heightMm ? at.landscape : at.portrait
  return fitBox({ xMm: snap(note.widthMm * x - side / 2), yMm: snap(note.heightMm * y - side / 2), widthMm: side, heightMm: side }, note)
}

/** Height ÷ width */
export const boxAspect = (box: Pick<PlacedBox, 'widthMm' | 'heightMm'>) => box.heightMm / box.widthMm || 1

/** The widest a box can be with its top-left corner where it is: up to the banknote's right and bottom edges */
export const maxBoxWidth = (box: PlacedBox, note: Size) =>
  Math.max(PLACE_MIN_MM, Math.min(note.widthMm - box.xMm, (note.heightMm - box.yMm) / boxAspect(box)))

/** A new width with the same proportions, keeping the top-left corner where it is */
export function resizeBox<T extends PlacedBox>(box: T, widthMm: number, note: Size): T {
  const width = clamp(widthMm, PLACE_MIN_MM, maxBoxWidth(box, note))
  return refit(box, { ...box, widthMm: width, heightMm: width * boxAspect(box) }, note)
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se'

/**
 * Drags a corner by (dx, dy) mm, keeping the proportions and the opposite corner where it was. The direction that
 * moved more sets the size, which snaps to PLACE_STEP and stops at the banknote's edges.
 */
export function dragBoxCorner<T extends PlacedBox>(box: T, corner: Corner, dx: number, dy: number, note: Size): T {
  const aspect = boxAspect(box)
  const sx = corner === 'ne' || corner === 'se' ? 1 : -1
  const sy = corner === 'sw' || corner === 'se' ? 1 : -1
  // The corner that stays put
  const fx = sx > 0 ? box.xMm : box.xMm + box.widthMm
  const fy = sy > 0 ? box.yMm : box.yMm + box.heightMm
  const byX = box.widthMm + sx * dx
  const byY = (box.heightMm + sy * dy) / aspect
  const wanted = Math.abs(byX - box.widthMm) >= Math.abs(byY - box.widthMm) ? byX : byY
  const room = Math.min(sx > 0 ? note.widthMm - fx : fx, (sy > 0 ? note.heightMm - fy : fy) / aspect)
  const widthMm = clamp(snap(wanted), Math.min(PLACE_MIN_MM, room), Math.max(PLACE_MIN_MM, room))
  const heightMm = widthMm * aspect
  return refit(box, { widthMm, heightMm, xMm: snap(sx > 0 ? fx : fx - widthMm), yMm: snap(sy > 0 ? fy : fy - heightMm) }, note)
}

/** Moves a box by (dx, dy) mm from where it was, snapped and kept on the banknote */
export const moveBox = <T extends PlacedBox>(box: T, dx: number, dy: number, note: Size): T =>
  refit(box, { ...box, xMm: snap(box.xMm + dx), yMm: snap(box.yMm + dy) }, note)

/** A new image's proportions (height ÷ width) set the height, keeping the width and the middle where they are */
export function withBoxAspect<T extends PlacedBox>(box: T, aspect: number | undefined, note: Size): T {
  const heightMm = box.widthMm * (aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : box.heightMm / box.widthMm || 1)
  return refit(box, { ...box, heightMm, yMm: snap(box.yMm + (box.heightMm - heightMm) / 2) }, note)
}

/** The same place on a banknote of a new size: its middle at the same share across and down, then fitted */
export function moveBoxTo<T extends PlacedBox>(box: T, from: Size, to: Size): T {
  const cx = ((box.xMm + box.widthMm / 2) / from.widthMm) * to.widthMm
  const cy = ((box.yMm + box.heightMm / 2) / from.heightMm) * to.heightMm
  return refit(box, { ...box, xMm: snap(cx - box.widthMm / 2), yMm: snap(cy - box.heightMm / 2) }, to)
}
