import { create } from 'zustand'
import * as db from './db'
import { copyImage, removeImage } from './images'
import type { Project } from './types'

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

  // Images are copied too, so deleting one project never breaks the other
  duplicate: async (id) => {
    const source = get().projects.find((p) => p.id === id)
    if (!source) return undefined
    const frames = await Promise.all(
      source.frames.map(async (f) => ({
        ...f,
        id: crypto.randomUUID(),
        imageId: f.imageId ? await copyImage(f.imageId) : undefined,
      })),
    )
    const faceImageId = source.note.faceImageId ? await copyImage(source.note.faceImageId) : undefined
    const now = Date.now()
    const copy: Project = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} copy`,
      createdAt: now,
      updatedAt: now,
      note: { ...source.note, faceImageId },
      frames,
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
    const imageIds = [project.note.faceImageId, ...project.frames.map((f) => f.imageId)]
    await Promise.all(imageIds.filter((i) => i !== undefined).map((i) => removeImage(i)))
  },
}))

export const updateProject = (id: string, change: (project: Project) => Project) =>
  useProjects.getState().update(id, change)
