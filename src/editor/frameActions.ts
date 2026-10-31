import { DEFAULT_LENGTH, MAX_FRAMES, MIN_FRAMES, colorFrame } from '../lib/notes'
import { removeImage, storeImage } from '../lib/images'
import { findNote, updateNote } from '../lib/store'
import type { Frame } from '../lib/types'

// Every action addresses one note inside one project
export interface NoteRef {
  projectId: string
  noteId: string
}

const imageName = (file: File) => file.name.replace(/\.[^.]+$/, '')

/**
 * Adds uploaded images as frames, up to the 5-frame limit. Uploading two or more images while the thread
 * still holds only colour frames replaces those placeholders. Returns how many files did not fit.
 */
export async function addImageFrames({ projectId, noteId }: NoteRef, files: File[]) {
  const note = findNote(projectId, noteId)
  if (!note) return 0
  const images = files.filter((f) => f.type.startsWith('image/'))
  const replacePlaceholders = images.length >= MIN_FRAMES && note.frames.every((f) => f.kind === 'color')
  const room = replacePlaceholders ? MAX_FRAMES : MAX_FRAMES - note.frames.length
  const picked = images.slice(0, room)
  const added: Frame[] = await Promise.all(
    picked.map(async (file) => ({
      id: crypto.randomUUID(),
      kind: 'image' as const,
      color: '#ffffff',
      imageId: await storeImage(file),
      name: imageName(file),
      length: DEFAULT_LENGTH,
    })),
  )
  updateNote(projectId, noteId, (n) => ({
    ...n,
    frames: (replacePlaceholders ? added : [...n.frames, ...added]).slice(0, MAX_FRAMES),
  }))
  return images.length - picked.length
}

export function addColorFrame({ projectId, noteId }: NoteRef) {
  updateNote(projectId, noteId, (n) =>
    n.frames.length >= MAX_FRAMES ? n : { ...n, frames: [...n.frames, colorFrame(n.frames.length)] },
  )
}

export function updateFrame({ projectId, noteId }: NoteRef, frameId: string, patch: Partial<Frame>) {
  updateNote(projectId, noteId, (n) => ({
    ...n,
    frames: n.frames.map((f) => (f.id === frameId ? { ...f, ...patch } : f)),
  }))
}

export async function replaceFrameImage(ref: NoteRef, frameId: string, file: File) {
  const old = findNote(ref.projectId, ref.noteId)?.frames.find((f) => f.id === frameId)?.imageId
  const imageId = await storeImage(file)
  updateFrame(ref, frameId, { kind: 'image', imageId, name: imageName(file) })
  if (old) await removeImage(old)
}

export function moveFrame({ projectId, noteId }: NoteRef, frameId: string, by: -1 | 1) {
  updateNote(projectId, noteId, (n) => {
    const from = n.frames.findIndex((f) => f.id === frameId)
    const to = from + by
    if (from < 0 || to < 0 || to >= n.frames.length) return n
    const frames = [...n.frames]
    const [moved] = frames.splice(from, 1)
    frames.splice(to, 0, moved)
    return { ...n, frames }
  })
}

export async function deleteFrame({ projectId, noteId }: NoteRef, frameId: string) {
  const note = findNote(projectId, noteId)
  const frame = note?.frames.find((f) => f.id === frameId)
  if (!note || !frame || note.frames.length <= MIN_FRAMES) return
  updateNote(projectId, noteId, (n) => ({ ...n, frames: n.frames.filter((f) => f.id !== frameId) }))
  if (frame.imageId) await removeImage(frame.imageId)
}

export async function setFaceImage({ projectId, noteId }: NoteRef, file: File | undefined) {
  const old = findNote(projectId, noteId)?.faceImageId
  const faceImageId = file ? await storeImage(file) : undefined
  // Uploading a design switches the background to it; removing it falls back to the solid colour
  updateNote(projectId, noteId, (n) => ({ ...n, faceImageId, background: faceImageId ? 'image' : 'solid' }))
  if (old) await removeImage(old)
}
