import { beginHistoryGroup, endHistoryGroup } from '../lib/history'
import { imageAspect, removeImage, storeImage } from '../lib/images'
import { type PlacedLayer, fitPlaced, isPlaced, newPlaced, withPlaced } from '../lib/layers'
import { withInkImage } from '../lib/magneticInk'
import type { PlacedBox } from '../lib/placed'
import { findNote, updateNote } from '../lib/store'
import { standIn } from '../lib/standIns'
import type { MagneticInk, Note, Watermark } from '../lib/types'
import { fitWatermark, withWatermarkImage } from '../lib/watermark'
import type { NoteRef } from './frameActions'

/** A banknote's parts, listed under it in the Banknotes list; the right panel shows one at a time */
export type Layer = 'note' | 'thread' | PlacedLayer

/** The layer a banknote can show: a placed layer it no longer has (undone, say) falls back to the banknote itself */
export const layerOf = (note: Pick<Note, PlacedLayer> | undefined, layer: Layer): Layer =>
  isPlaced(layer) && !note?.[layer] ? 'note' : layer

/**
 * Adds a layer in its own place on the banknote (a banknote has at most one of each), with a stand-in image so it shows
 * what it does straight away (`standIn`): the box at once, the image a moment later, both one undo step
 */
export function addLayer(ref: NoteRef, layer: PlacedLayer) {
  const { projectId, noteId } = ref
  if (findNote(projectId, noteId)?.[layer]) return
  beginHistoryGroup(projectId)
  updateNote(projectId, noteId, (n) => (n[layer] ? n : withPlaced(n, layer, newPlaced(layer, n))))
  void standIn(layer)
    .then((file) => {
      // Unless it went (undone) or got an image of its own meanwhile
      const added = findNote(projectId, noteId)?.[layer]
      if (!added || added.imageId) return
      return layer === 'watermark' ? setWatermarkImage(ref, file) : setMagneticInkImage(ref, file)
    })
    // Where it can't be drawn (an old browser, the tests), the layer starts empty, as it used to
    .catch(() => {})
    .finally(() => endHistoryGroup(projectId))
}

/** Removes a layer, and its image with it */
export async function removeLayer({ projectId, noteId }: NoteRef, layer: PlacedLayer) {
  const old = findNote(projectId, noteId)?.[layer]?.imageId
  updateNote(projectId, noteId, (n) => (n[layer] ? withPlaced(n, layer, undefined) : n))
  if (old) await removeImage(old)
}

/** Moves or resizes a layer's box on its banknote, kept on it (the canvas's drags and the placing box); only its box changes */
export function placeLayer({ projectId, noteId }: NoteRef, layer: PlacedLayer, { xMm, yMm, widthMm, heightMm }: PlacedBox) {
  updateNote(projectId, noteId, (n) => {
    const old = n[layer]
    return old ? withPlaced(n, layer, fitPlaced(layer, { ...old, xMm, yMm, widthMm, heightMm }, n)) : n
  })
}

/** Changes the watermark, kept on the banknote */
export function updateWatermark({ projectId, noteId }: NoteRef, change: (watermark: Watermark, note: Note) => Watermark) {
  updateNote(projectId, noteId, (n) => (n.watermark ? { ...n, watermark: fitWatermark(change(n.watermark, n), n) } : n))
}

/** Changes the magnetic ink, kept on the banknote */
export function updateMagneticInk({ projectId, noteId }: NoteRef, change: (ink: MagneticInk, note: Note) => MagneticInk) {
  updateNote(projectId, noteId, (n) => (n.magneticInk ? { ...n, magneticInk: fitPlaced('magneticInk', change(n.magneticInk, n), n) } : n))
}

/** Uploads the watermark's image (its proportions set the height; it starts on Auto levels), or removes it */
export async function setWatermarkImage(ref: NoteRef, file: File | undefined) {
  const old = findNote(ref.projectId, ref.noteId)?.watermark?.imageId
  if (file) {
    const [imageId, aspect] = await Promise.all([storeImage(file), imageAspect(file)])
    updateWatermark(ref, (w, n) => withWatermarkImage(w, imageId, aspect, n))
  } else {
    // Its levels were for that image
    updateWatermark(ref, ({ imageId: _removed, levels: _levels, ...rest }) => rest)
  }
  if (old) await removeImage(old)
}

/** Uploads the magnetic ink's image, whose shape takes the ink (its proportions set the height), or removes it */
export async function setMagneticInkImage(ref: NoteRef, file: File | undefined) {
  const old = findNote(ref.projectId, ref.noteId)?.magneticInk?.imageId
  if (file) {
    const [imageId, aspect] = await Promise.all([storeImage(file), imageAspect(file)])
    updateMagneticInk(ref, (ink, n) => withInkImage(ink, imageId, aspect, n))
  } else {
    updateMagneticInk(ref, ({ imageId: _removed, ...rest }) => rest)
  }
  if (old) await removeImage(old)
}
