import { create } from 'zustand'
import { get, set, createStore } from 'idb-keyval'
import { clearWorkspaceName } from './identity'
import { readCache, writeCache, writeArtwork } from './cache'
import { createRepository, projectImageIds } from './repository'
import { ProjectSync, type SyncStatus } from './sync'
import * as legacy from '../lib/db'
import { createDemoProject } from '../lib/demo'
import { setImageWorkspace } from '../lib/images'
import type { Project } from '../lib/types'

interface WorkspaceState {
  projects: Project[]
  demoPreview?: Project
  /** The demo is being made (its artwork drawn, a moment the first time): the editor's skeleton shows meanwhile */
  demoLoading: boolean
  /** This device's copy of the workspace has been read: projects can be shown and edited */
  loaded: boolean
  /** The cloud has answered once with its projects (or failed to), so an empty list means no projects (`ProjectSync.listed`) */
  listed: boolean
  status: SyncStatus
  error: string
  conflicts: string[]
  workspace?: string
  legacyProjects: Project[]
  importing: boolean
}
export const useWorkspace = create<WorkspaceState>(() => ({
  projects: [], demoLoading: false, loaded: false, listed: false, status: 'saving', error: '', conflicts: [], legacyProjects: [], importing: false,
}))
let sync: ProjectSync | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
const imports = createStore('of-thread-imports', 'imports')

export async function openWorkspace(workspace: string) {
  const token = ++generation
  sync?.stop()
  clearTimeout(timer)
  setImageWorkspace(workspace)
  useWorkspace.setState({ projects: [], demoPreview: undefined, demoLoading: false, loaded: false, listed: false, status: 'saving', error: '', conflicts: [], workspace, legacyProjects: [] })
  const repository = createRepository(workspace)
  const engine = new ProjectSync(repository, (records) => writeCache(workspace, records), () => {
    if (token !== generation) return
    useWorkspace.setState({
      projects: engine.records.filter((r) => !r.deleted).map((r) => r.project),
      listed: engine.listed, status: engine.status, error: engine.error,
      conflicts: engine.records.filter((r) => r.conflict).map((r) => r.project.id),
    })
  })
  sync = engine
  try {
    const [cached, browserProjects] = await Promise.all([readCache(workspace), legacy.loadProjects()])
    if (token !== generation) return
    const available: Project[] = []
    for (const project of browserProjects) {
      const importedId = await get<string>([workspace, project.id], imports)
      if (!importedId || !cached.some((r) => r.project.id === importedId)) available.push(project)
    }
    if (token !== generation) return
    useWorkspace.setState({ legacyProjects: available })
    // Restore drafts before contacting the network; editing works with a cached session offline.
    engine.records = cached
    useWorkspace.setState({ projects: cached.filter((r) => !r.deleted).map((r) => r.project), loaded: true })
    await engine.initialize(cached)

  } catch (error) {
    if (token === generation) useWorkspace.setState({ loaded: false, status: 'error', error: error instanceof Error ? error.message : 'Couldn’t open projects.' })
  }
}

/**
 * A fresh demo exists only in memory and never enters the save queue. It comes with the app (`createDemoProject`),
 * built with fresh ids each time; the shared template in Supabase is no longer read. It opens straight away, on the
 * editor's skeleton while it is made; left meanwhile (back to Projects), it isn't opened once made.
 */
export async function openDemoPreview() {
  const { workspace } = useWorkspace.getState()
  const token = generation
  if (!workspace) throw new Error('Open a workspace first.')
  useWorkspace.setState({ demoLoading: true })
  location.hash = '#/demo'
  try {
    const project = await createDemoProject()
    if (token !== generation) throw new Error('The workspace changed. Try again.')
    if (location.hash === '#/demo') useWorkspace.setState({ demoPreview: project })
    return project
  } catch (error) {
    if (location.hash === '#/demo') location.hash = ''
    throw error
  } finally {
    if (token === generation) useWorkspace.setState({ demoLoading: false })
  }
}

export function clearDemoPreview() {
  if (useWorkspace.getState().demoPreview) useWorkspace.setState({ demoPreview: undefined })
}

export function editorProject(id: string) {
  const { projects, demoPreview } = useWorkspace.getState()
  return demoPreview?.id === id ? demoPreview : projects.find((project) => project.id === id)
}

export function putProject(project: Project, deleted = false) {
  if (useWorkspace.getState().demoPreview?.id === project.id) {
    useWorkspace.setState({ demoPreview: deleted ? undefined : project })
    return
  }
  if (!sync || !useWorkspace.getState().loaded) throw new Error('Projects are still loading.')
  sync.put(project, deleted)
  clearTimeout(timer)
  timer = setTimeout(() => { void sync?.flush() }, 350)
}
export const retrySync = () => {
  const { loaded, workspace } = useWorkspace.getState()
  return !loaded && workspace ? openWorkspace(workspace) : sync?.refresh()
}
export const resolveConflict = (id: string, keepCopy: boolean) => sync?.resolve(id, keepCopy)
export const hasPendingSaves = () => sync?.hasPending() ?? false

export async function signOut() {
  // Preserve drafts before leaving the workspace, including when offline.
  await sync?.durable()
  clearWorkspaceName()
}
export function closeWorkspace() {
  generation++
  sync?.stop()
  sync = undefined
  clearTimeout(timer)
  setImageWorkspace(undefined)
  useWorkspace.setState({ projects: [], demoPreview: undefined, demoLoading: false, loaded: false, listed: false, workspace: undefined, conflicts: [], error: '', legacyProjects: [], importing: false })
}

export async function importBrowserProjects() {
  const { workspace, legacyProjects, importing } = useWorkspace.getState()
  const engine = sync
  const token = generation
  if (!workspace || !engine || importing) return
  useWorkspace.setState({ importing: true })
  try {
    for (const project of legacyProjects) {
      // Stable target IDs make a half-finished import safe to retry after a reload.
      let target = await get<string>([workspace, project.id], imports)
      if (!target) { target = crypto.randomUUID(); await set([workspace, project.id], target, imports) }
      const existing = engine.records.find((r) => r.project.id === target)
      if (!existing) {
        for (const id of projectImageIds(project)) {
          const blob = await legacy.loadImage(id)
          if (!blob) throw new Error(`Missing browser artwork in “${project.name}”. The original project has been kept.`)
          await writeArtwork(workspace, id, blob)
        }
        if (token !== generation) return
        engine.put({ ...structuredClone(project), id: target })
      }
      await engine.durable()
      await engine.flush()
      if (token !== generation) return
      const saved = engine.records.find((r) => r.project.id === target)
      if (saved?.dirty) throw new Error('Import is saved on this device and will finish uploading when the connection returns.')
      useWorkspace.setState((s) => ({ legacyProjects: s.legacyProjects.filter((p) => p.id !== project.id) }))
    }
  } finally { if (token === generation) useWorkspace.setState({ importing: false }) }
}

export function watchWorkspace() {
  const retry = () => { void retrySync() }
  const visibility = () => { if (document.visibilityState === 'visible') retry() }
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (hasPendingSaves()) { event.preventDefault(); event.returnValue = '' }
  }
  window.addEventListener('online', retry)
  window.addEventListener('focus', retry)
  window.addEventListener('beforeunload', beforeUnload)
  document.addEventListener('visibilitychange', visibility)
  const poll = setInterval(retry, 30_000)
  return () => {
    window.removeEventListener('online', retry)
    window.removeEventListener('focus', retry)
    window.removeEventListener('beforeunload', beforeUnload)
    document.removeEventListener('visibilitychange', visibility)
    clearInterval(poll)
  }
}
