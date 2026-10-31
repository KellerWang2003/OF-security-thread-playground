import { createStore, get, set, values } from 'idb-keyval'
import type { CachedProject } from './sync'

const cache = createStore('of-thread-cloud-cache', 'workspaces')
const images = createStore('of-thread-cloud-artwork', 'images')
// Keep separate outboxes per tab so simultaneous edits cannot overwrite each other's device copy.
const tabId = (() => {
  if (typeof sessionStorage === 'undefined') return 'test'
  const existing = sessionStorage.getItem('of-thread-tab')
  if (existing) return existing
  const id = crypto.randomUUID()
  sessionStorage.setItem('of-thread-tab', id)
  return id
})()
interface Snapshot { workspace: string; updatedAt: number; records: CachedProject[] }

// Separate from the original browser-only stores. Import never modifies the originals.
export async function readCache(workspace: string): Promise<CachedProject[]> {
  const own = await get<Snapshot>([workspace, tabId], cache)
  if (own) return own.records
  // A newly opened tab can recover the most recently edited projects from this workspace's older tabs.
  const snapshots = (await values<Snapshot>(cache)).filter((s) => s.workspace === workspace).sort((a, b) => a.updatedAt - b.updatedAt)
  const records = new Map<string, CachedProject>()
  for (const snapshot of snapshots) for (const record of snapshot.records) {
    const previous = records.get(record.project.id)
    if (!previous || !previous.dirty || record.dirty) records.set(record.project.id, record)
  }
  return [...records.values()]
}
export const writeCache = (workspace: string, records: CachedProject[]) => set([workspace, tabId], { workspace, records, updatedAt: Date.now() }, cache)
export const readArtwork = (workspace: string, id: string) => get<Blob>([workspace, id], images)
export const writeArtwork = (workspace: string, id: string, blob: Blob) => set([workspace, id], blob, images)
