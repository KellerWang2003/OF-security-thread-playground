import { imageAspect, removeImage, storeImage } from '../lib/images'
import { findNote, updateNote } from '../lib/store'
import type { Note, Watermark } from '../lib/types'
import { fitWatermark, newWatermark, withWatermarkImage } from '../lib/watermark'
import type { NoteRef } from './frameActions'

/** A banknote's parts, listed under it in the Banknotes list; the right panel shows one at a time */
export type Layer = 'note' | 'thread' | 'watermark'

/** The layer a banknote can show: a watermark it no longer has (undone, say) falls back to the banknote itself */
export const layerOf = (note: Pick<Note, 'watermark'> | undefined, layer: Layer): Layer =>
  layer === 'watermark' && !note?.watermark ? 'note' : layer

/** Adds an empty watermark in the banknote's plain part; a banknote has at most one */
export function addWatermark({ projectId, noteId }: NoteRef) {
  updateNote(projectId, noteId, (n) => (n.watermark ? n : { ...n, watermark: newWatermark(n) }))
}

export async function removeWatermark({ projectId, noteId }: NoteRef) {
  const old = findNote(projectId, noteId)?.watermark?.imageId
  updateNote(projectId, noteId, (n) => {
    if (!n.watermark) return n
    const { watermark: _removed, ...rest } = n
    return rest
  })
  if (old) await removeImage(old)
}

/** Changes the watermark, kept on the banknote */
export function updateWatermark({ projectId, noteId }: NoteRef, change: (watermark: Watermark, note: Note) => Watermark) {
  updateNote(projectId, noteId, (n) => (n.watermark ? { ...n, watermark: fitWatermark(change(n.watermark, n), n) } : n))
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
