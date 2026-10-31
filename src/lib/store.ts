import { create } from 'zustand'
import * as db from './db'
import { copyImage, removeImage } from './images'
import type { Note, Project } from './types'

// Edits land in memory immediately and are written to IndexedDB shortly after, per project
const saveTimers = new Map<string, number>()

function scheduleSave(id: string) {
  window.clearTimeout(saveTimers.get(id))
  saveTimers.set(
    id,
    window.setTimeout(() => {
      saveTimers.delete(id)
      const project = useProjects.getState().projects.find((p) => p.id === id)
      if (project) void db.saveProject(project)
    }, 250),
  )
}

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

interface ProjectsState {
  projects: Project[]
  loaded: boolean
  load: () => Promise<void>
  add: (project: Project) => void
  update: (id: string, change: (project: Project) => Project) => void
  duplicate: (id: string) => Promise<Project | undefined>
  remove: (id: string) => Promise<void>
}

export const useProjects = create<ProjectsState>()((set, get) => ({
  projects: [],
  loaded: false,

  load: async () => {
    const projects = await db.loadProjects()
    set({ projects, loaded: true })
  },

  add: (project) => {
    set((s) => ({ projects: [...s.projects, project] }))
    void db.saveProject(project)
  },

  update: (id, change) => {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...change(p), updatedAt: Date.now() } : p)),
    }))
    scheduleSave(id)
  },

  duplicate: async (id) => {
    const source = get().projects.find((p) => p.id === id)
    if (!source) return undefined
    const now = Date.now()
    const copy: Project = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} copy`,
      createdAt: now,
      updatedAt: now,
      notes: await Promise.all(source.notes.map(copyNote)),
    }
    get().add(copy)
    return copy
  },

  remove: async (id) => {
    const project = get().projects.find((p) => p.id === id)
    if (!project) return
    window.clearTimeout(saveTimers.get(id))
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
    await db.deleteProject(id)
    await Promise.all(project.notes.flatMap(noteImageIds).map((i) => removeImage(i)))
  },
}))

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
  const copy = { ...(await copyNote(source)), name: `${source.name} copy` }
  updateProject(projectId, (p) => {
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
