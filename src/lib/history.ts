import { create } from 'zustand'
import type { Project } from './types'

const LIMIT = 100
const COALESCE_MS = 750
interface HistoryEntry {
  past: Project[]
  future: Project[]
  current: string
  group?: string
  lastEdit: number
}
export const useHistory = create<{ entries: Record<string, HistoryEntry> }>(() => ({ entries: {} }))
const gestures = new Map<string, string>()

// Save timestamps are transport metadata, not user edits. Projects are never mutated, so each one is
// stringified once: a drag edits on every pointer move, and re-stringifying every project each time lagged
const fingerprints = new WeakMap<Project, string>()
function fingerprint(project: Project) {
  let value = fingerprints.get(project)
  if (value === undefined) {
    value = JSON.stringify({ ...project, updatedAt: 0 })
    fingerprints.set(project, value)
  }
  return value
}

function changedPaths(before: unknown, after: unknown, path = ''): string[] {
  if (before === after) return []
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) return [`${path}[]`]
    return before.flatMap((value, i) => changedPaths(value, after[i], `${path}.${i}`))
  }
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => path || key !== 'updatedAt')
      .flatMap((key) => changedPaths(a[key], b[key], path ? `${path}.${key}` : key))
  }
  return [path]
}

function setEntry(id: string, entry: HistoryEntry) {
  useHistory.setState((state) => ({ entries: { ...state.entries, [id]: entry } }))
}
export function breakHistoryGroup(id: string) {
  const entry = useHistory.getState().entries[id]
  if (entry?.group) setEntry(id, { ...entry, group: undefined })
}
export function beginHistoryGroup(id: string) {
  breakHistoryGroup(id)
  gestures.set(id, crypto.randomUUID())
}
export function endHistoryGroup(id: string) {
  if (gestures.delete(id)) breakHistoryGroup(id)
}

/** Record one user edit; continuous changes to the same field share an undo step. */
export function recordEdit(before: Project, after: Project): boolean {
  const current = fingerprint(after)
  if (fingerprint(before) === current) return false
  const existing = useHistory.getState().entries[before.id]
  const entry = existing?.current === fingerprint(before) ? existing : undefined
  const paths = changedPaths(before, after).sort()
  const structural = paths.some((path) => /\[\]$|\.(id|imageId|faceImageId|kind)$/.test(path))
  const gesture = gestures.get(before.id)
  const group = gesture ?? (structural ? undefined : paths.join('|'))
  const now = Date.now()
  const merge = entry && group && entry.group === group && (gesture || now - entry.lastEdit < COALESCE_MS)
  setEntry(before.id, {
    past: merge ? entry.past : [...(entry?.past ?? []), structuredClone(before)].slice(-LIMIT),
    future: [], current, group, lastEdit: now,
  })
  return true
}

/** Undo/redo produces a normal project edit, so cloud autosave still applies. */
export function historyStep(project: Project, direction: 'undo' | 'redo'): Project | undefined {
  const entry = useHistory.getState().entries[project.id]
  if (!entry || entry.current !== fingerprint(project)) return undefined
  const from = direction === 'undo' ? entry.past : entry.future
  if (!from.length) return undefined
  const snapshot = from.at(-1)!
  const opposite = [...(direction === 'undo' ? entry.future : entry.past), structuredClone(project)].slice(-LIMIT)
  endHistoryGroup(project.id)
  setEntry(project.id, {
    past: direction === 'undo' ? from.slice(0, -1) : opposite,
    future: direction === 'redo' ? from.slice(0, -1) : opposite,
    current: fingerprint(snapshot), lastEdit: 0,
  })
  return { ...structuredClone(snapshot), updatedAt: Date.now() }
}

/** A cloud refresh must never leave undo steps that can overwrite someone else's newer work. */
export function reconcileHistory(projects: Project[]) {
  const current = new Map(projects.map((project) => [project.id, fingerprint(project)]))
  const entries = useHistory.getState().entries
  const retained = Object.fromEntries(Object.entries(entries).filter(([id, entry]) => current.get(id) === entry.current))
  if (Object.keys(retained).length !== Object.keys(entries).length) useHistory.setState({ entries: retained })
}
export function resetHistory() {
  gestures.clear()
  useHistory.setState({ entries: {} })
}
