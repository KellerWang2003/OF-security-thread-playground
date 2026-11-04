import { fitMagneticInk, newMagneticInk } from './magneticInk'
import { type PlacedBox, type Size, isWhollyOn, moveBoxTo, onto } from './placed'
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

/**
 * Every security feature a banknote can have, at most one of each, all added from one Add menu and removed the same
 * way (Keller, 4 November: a new banknote coming with a thread made no sense): its thread, then the placed layers, the
 * order the menu and the Banknotes list show them in
 */
export const FEATURES = ['thread', ...PLACED_LAYERS] as const
export type Feature = (typeof FEATURES)[number]

export const FEATURE_NAMES: Record<Feature, string> = { thread: 'Security thread', ...LAYER_NAMES }

/** What each one is, in a line under its name in the Add menu */
export const FEATURE_LINES: Record<Feature, string> = {
  thread: 'A lenticular thread whose frames change as you tilt',
  watermark: 'In the paper, clear when tilted or held to the light',
  magneticInk: 'Ink that shifts colour as a bright bar rolls across it',
}

/** Whether the banknote has its thread: banknotes from before the Add menu all do, new ones not until it is added */
export const hasThread = (note: Pick<Note, 'noThread'>) => !note.noThread

export const hasFeature = (note: Note, feature: Feature) => (feature === 'thread' ? hasThread(note) : !!note[feature])

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

/**
 * Every layer the banknote has kept on it as it is now, after a new size was typed (`from`, the size it had): each
 * where it was, as far as it fits, and one that sat wholly on the banknote still wholly on it
 */
export const fitLayers = (note: Note, from?: Size): Note =>
  PLACED_LAYERS.reduce((n, layer) => {
    const box = n[layer]
    if (!box) return n
    const fitted = fitPlaced(layer, box, n)
    return withPlaced(n, layer, from && isWhollyOn(box, from) ? fitPlaced(layer, onto(fitted, n), n) : fitted)
  }, note)

/** Every layer the banknote has in the same place after it turned from `from`: its middle at the same share across and down */
export const moveLayersTo = (note: Note, from: Size): Note =>
  PLACED_LAYERS.reduce((n, layer) => {
    const box = n[layer]
    return box ? withPlaced(n, layer, moveBoxTo(box, from, n)) : n
  }, note)
