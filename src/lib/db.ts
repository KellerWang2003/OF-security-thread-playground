import { createStore, del, get, set, values } from 'idb-keyval'
import { migrateProject } from './notes'
import type { Project } from './types'

// Everything lives in the browser's IndexedDB, so projects survive reloads and nothing is uploaded.
const projectStore = createStore('of-thread-projects', 'projects')
const imageStore = createStore('of-thread-images', 'images')

export const loadProjects = async () => (await values(projectStore)).map(migrateProject)
export const saveProject = (project: Project) => set(project.id, project, projectStore)
export const deleteProject = (id: string) => del(id, projectStore)

export const saveImage = (id: string, blob: Blob) => set(id, blob, imageStore)
export const loadImage = (id: string) => get<Blob>(id, imageStore)
export const deleteImage = (id: string) => del(id, imageStore)
