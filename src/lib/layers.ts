import { fitMagneticInk, newMagneticInk } from './magneticInk'
import { type PlacedBox, type Size, moveBoxTo } from './placed'
import type { MagneticInk, Note, Watermark } from './types'
import { fitWatermark, newWatermark } from './watermark'

/**
 * The banknote's layers placed on it as a box (placed.ts), siblings of its thread: at most one of each, added from the +
 * on the banknote's row, listed in this order under its thread, and placed the same way on the canvas. They draw in
 * this order too, over the design and under the thread.
 */
export const PLACED_LAYERS = ['watermark', 'magneticInk'] as const
export type PlacedLayer = (typeof PLACED_LAYERS)[number]

interface Placed {
  watermark: Watermark
  magneticInk: MagneticInk
}

export const isPlaced = (layer: string | undefined): layer is PlacedLayer => (PLACED_LAYERS as readonly (string | undefined)[]).includes(layer)

/** Each one's name in the UI */
export const LAYER_NAMES: Record<PlacedLayer, string> = { watermark: 'Watermark', magneticInk: 'Magnetic ink' }

/** A layer kept on its banknote, a damaged save repaired */
export function fitPlaced<K extends PlacedLayer>(layer: K, box: Placed[K], note: Size): Placed[K] {
  return (layer === 'watermark' ? fitWatermark(box as Watermark, note) : fitMagneticInk(box as MagneticInk, note)) as Placed[K]
}

/** A new one, in its own place on the banknote */
export const newPlaced = (layer: PlacedLayer, note: Size): Watermark | MagneticInk =>
  layer === 'watermark' ? newWatermark(note) : newMagneticInk(note)

/** The banknote with this layer set to `box`, or without it */
export function withPlaced(note: Note, layer: PlacedLayer, box: PlacedBox | undefined): Note {
  const next: Record<string, unknown> = { ...note }
  if (box) next[layer] = box
  else delete next[layer]
  return next as unknown as Note
}

/** Every layer the banknote has kept on it as it is now, after a new size was typed: each where it was, as far as it fits */
export const fitLayers = (note: Note): Note =>
  PLACED_LAYERS.reduce((n, layer) => {
    const box = n[layer]
    return box ? withPlaced(n, layer, fitPlaced(layer, box, n)) : n
  }, note)

/** Every layer the banknote has in the same place after it turned from `from`: its middle at the same share across and down */
export const moveLayersTo = (note: Note, from: Size): Note =>
  PLACED_LAYERS.reduce((n, layer) => {
    const box = n[layer]
    return box ? withPlaced(n, layer, moveBoxTo(box, from, n)) : n
  }, note)
