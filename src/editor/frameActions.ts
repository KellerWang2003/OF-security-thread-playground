import { MAX_FRAMES, MIN_FRAMES, colorFrame } from '../lib/notes'
import { removeImage, storeImage } from '../lib/images'
import { updateProject, useProjects } from '../lib/store'
import type { Frame, Project } from '../lib/types'

const findProject = (id: string) => useProjects.getState().projects.find((p) => p.id === id)

const imageName = (file: File) => file.name.replace(/\.[^.]+$/, '')

/**
 * Adds uploaded images as frames, up to the 5-frame limit. Uploading two or more images while the thread
 * still holds only colour frames replaces those placeholders. Returns how many files did not fit.
 */
export async function addImageFrames(projectId: string, files: File[]) {
  const project = findProject(projectId)
  if (!project) return 0
  const images = files.filter((f) => f.type.startsWith('image/'))
  const replacePlaceholders = images.length >= MIN_FRAMES && project.frames.every((f) => f.kind === 'color')
  const room = replacePlaceholders ? MAX_FRAMES : MAX_FRAMES - project.frames.length
  const picked = images.slice(0, room)
  const added: Frame[] = await Promise.all(
    picked.map(async (file) => ({
      id: crypto.randomUUID(),
      kind: 'image' as const,
      color: '#ffffff',
      imageId: await storeImage(file),
      name: imageName(file),
    })),
  )
  updateProject(projectId, (p) => ({
    ...p,
    frames: (replacePlaceholders ? added : [...p.frames, ...added]).slice(0, MAX_FRAMES),
  }))
  return images.length - picked.length
}

export function addColorFrame(projectId: string) {
  updateProject(projectId, (p) =>
    p.frames.length >= MAX_FRAMES ? p : { ...p, frames: [...p.frames, colorFrame(p.frames.length)] },
  )
}

export function updateFrame(projectId: string, frameId: string, patch: Partial<Frame>) {
  updateProject(projectId, (p) => ({
    ...p,
    frames: p.frames.map((f) => (f.id === frameId ? { ...f, ...patch } : f)),
  }))
}

export async function replaceFrameImage(projectId: string, frameId: string, file: File) {
  const old = findProject(projectId)?.frames.find((f) => f.id === frameId)?.imageId
  const imageId = await storeImage(file)
  updateFrame(projectId, frameId, { kind: 'image', imageId, name: imageName(file) })
  if (old) await removeImage(old)
}

export function moveFrame(projectId: string, frameId: string, by: -1 | 1) {
  updateProject(projectId, (p) => {
    const from = p.frames.findIndex((f) => f.id === frameId)
    const to = from + by
    if (from < 0 || to < 0 || to >= p.frames.length) return p
    const frames = [...p.frames]
    const [moved] = frames.splice(from, 1)
    frames.splice(to, 0, moved)
    return { ...p, frames }
  })
}

export async function deleteFrame(projectId: string, frameId: string) {
  const project = findProject(projectId)
  const frame = project?.frames.find((f) => f.id === frameId)
  if (!project || !frame || project.frames.length <= MIN_FRAMES) return
  updateProject(projectId, (p) => ({ ...p, frames: p.frames.filter((f) => f.id !== frameId) }))
  if (frame.imageId) await removeImage(frame.imageId)
}

export async function setFaceImage(project: Project, file: File | undefined) {
  const old = project.note.faceImageId
  const faceImageId = file ? await storeImage(file) : undefined
  updateProject(project.id, (p) => ({ ...p, note: { ...p.note, faceImageId } }))
  if (old) await removeImage(old)
}
