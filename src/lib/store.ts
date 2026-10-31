import { useWorkspace, putProject } from '../cloud/workspace'
import { copyImage, removeImage } from './images'
import { nextNotePosition } from './notes'
import type { Note, Project } from './types'

const noteImageIds = (note: Note) => [note.faceImageId, ...note.frames.map((f) => f.imageId)].filter((i) => i !== undefined)

/** A copy of a note with fresh ids and its own copies of the images, so deleting one never breaks the other */
async function copyNote(note: Note): Promise<Note> {
  const frames = await Promise.all(
    note.frames.map(async (f) => ({
      ...f,
      id: crypto.randomUUID(),
      imageId: f.imageId ? await copyImage(f.imageId) : undefined,
    })),
  )
  const faceImageId = note.faceImageId ? await copyImage(note.faceImageId) : undefined
  return { ...note, id: crypto.randomUUID(), faceImageId, frames }
}

// Keep the editor's existing actions while the cloud workspace owns persistence.
const actions = {
  add: (project: Project) => putProject(project),
  update: (id: string, change: (project: Project) => Project) => {
    const project = useWorkspace.getState().projects.find((p) => p.id === id)
    if (project) putProject({ ...change(project), updatedAt: Date.now() })
  },
  duplicate: async (id: string) => {
    const workspace = useWorkspace.getState().workspace
    const source = useWorkspace.getState().projects.find((p) => p.id === id)
    if (!source) return undefined
    const now = Date.now()
    const copy: Project = {
      ...source, id: crypto.randomUUID(), name: `${source.name} copy`,
      createdAt: now, updatedAt: now, notes: await Promise.all(source.notes.map(copyNote)),
    }
    if (useWorkspace.getState().workspace !== workspace) throw new Error('The workspace changed. Try again.')
    actions.add(copy)
    return copy
  },
  remove: async (id: string) => {
    const project = useWorkspace.getState().projects.find((p) => p.id === id)
    if (project) putProject(project, true)
  },
}

// Zustand's hook and imperative API are both used by the existing UI.
export const useProjects = Object.assign(
  <T = ReturnType<typeof useWorkspace.getState>>(selector?: (state: ReturnType<typeof useWorkspace.getState>) => T) =>
    useWorkspace(selector ?? ((state) => state as T)),
  { getState: () => ({ ...useWorkspace.getState(), ...actions }) },
)

export const updateProject = (id: string, change: (project: Project) => Project) =>
  useProjects.getState().update(id, change)

export const findNote = (projectId: string, noteId: string) =>
  useProjects
    .getState()
    .projects.find((p) => p.id === projectId)
    ?.notes.find((n) => n.id === noteId)

export const updateNote = (projectId: string, noteId: string, change: (note: Note) => Note) =>
  updateProject(projectId, (p) => ({ ...p, notes: p.notes.map((n) => (n.id === noteId ? change(n) : n)) }))

export const addNote = (projectId: string, note: Note) =>
  updateProject(projectId, (p) => ({ ...p, notes: [...p.notes, note] }))

/** Inserts the copy right after the original and returns its id */
export async function duplicateNote(projectId: string, noteId: string) {
  const source = findNote(projectId, noteId)
  if (!source) return undefined
  const copied = { ...(await copyNote(source)), name: `${source.name} copy` }
  let copy = copied
  updateProject(projectId, (p) => {
    copy = { ...copied, ...nextNotePosition(p.notes) }
    const at = p.notes.findIndex((n) => n.id === noteId)
    const notes = [...p.notes]
    notes.splice(at + 1, 0, copy)
    return { ...p, notes }
  })
  return copy.id
}

export async function removeNote(projectId: string, noteId: string) {
  const note = findNote(projectId, noteId)
  if (!note) return
  updateProject(projectId, (p) => ({ ...p, notes: p.notes.filter((n) => n.id !== noteId) }))
  await Promise.all(noteImageIds(note).map((i) => removeImage(i)))
}
