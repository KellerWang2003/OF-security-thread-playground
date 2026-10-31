import { errorMessage } from './errors'
import type { Project } from '../lib/types'

export interface CloudProject {
  project: Project
  revision: string
  deleted: boolean
}
export interface CachedProject extends CloudProject {
  baseRevision: string | null
  dirty: boolean
  sentRevision?: string
  conflict?: CloudProject
}
export interface ProjectRepository {
  list: () => Promise<CloudProject[]>
  save: (record: CachedProject) => Promise<CloudProject>
}
export class SaveConflict extends Error {
  remote: CloudProject
  constructor(remote: CloudProject) {
    super('This project changed in another tab or device.')
    this.remote = remote
  }
}
export type SyncStatus = 'saved' | 'saving' | 'error' | 'conflict'

/** One workspace, one ordered outbox. Project writes use compare-and-swap revisions. */
export class ProjectSync {
  records: CachedProject[] = []
  status: SyncStatus = 'saved'
  error = ''
  private running?: Promise<void>
  private persistence: Promise<void> = Promise.resolve()
  private diskError = false
  private stopped = false
  private refreshRequested = false

  private repository: ProjectRepository
  private persist: (records: CachedProject[]) => Promise<void>
  private notify: () => void
  constructor(
    repository: ProjectRepository,
    persist: (records: CachedProject[]) => Promise<void>,
    notify: () => void,
  ) { this.repository = repository; this.persist = persist; this.notify = notify }

  private emit() { if (!this.stopped) this.notify() }

  private checkpoint() {
    const snapshot = structuredClone(this.records)
    this.persistence = this.persistence.catch(() => {}).then(() => this.persist(snapshot))
    // Attach immediately so a failed local write is never an unhandled rejection.
    void this.persistence.catch((error: unknown) => {
      this.diskError = true
      this.status = 'error'
      this.error = `Couldn’t save on this device: ${errorMessage(error, 'storage unavailable')}`
      this.emit()
    })
    return this.persistence
  }

  async initialize(cached: CachedProject[]) {
    this.records = cached
    this.emit()
    await this.refresh()
  }

  private merge(remote: CloudProject[]) {
    for (const row of remote) {
      const local = this.records.find((r) => r.project.id === row.project.id)
      if (!local) this.records.push({ ...row, baseRevision: row.revision, dirty: false })
      else if (!local.dirty) Object.assign(local, row, { baseRevision: row.revision, conflict: undefined })
      // A dirty record is reconciled by save(), including lost-response recovery.
    }
  }

  async refresh() {
    if (this.stopped) return
    if (this.running) { this.refreshRequested = true; return this.running }
    this.running = this.work(true).finally(() => { this.running = undefined })
    await this.running
    if (this.refreshRequested) { this.refreshRequested = false; await this.refresh() }
  }

  put(project: Project, deleted = false) {
    const previous = this.records.find((r) => r.project.id === project.id)
    const next: CachedProject = {
      project, deleted, revision: crypto.randomUUID(),
      baseRevision: previous?.baseRevision ?? null,
      dirty: true, conflict: previous?.conflict, sentRevision: previous?.sentRevision,
    }
    this.records = [...this.records.filter((r) => r.project.id !== project.id), next]
    this.status = next.conflict ? 'conflict' : 'saving'
    this.error = ''
    this.emit()
    void this.checkpoint().then(() => { this.diskError = false }).catch(() => {})
  }

  async flush(): Promise<void> {
    if (this.stopped) return
    if (this.running) { await this.running; if (this.stopped || !this.hasPending()) return; return this.flush() }
    this.running = this.work(false).finally(() => { this.running = undefined })
    await this.running
  }

  private async work(refresh: boolean) {
    this.status = 'saving'
    this.error = ''
    this.emit()
    try {
      await this.checkpoint()
      this.diskError = false
      if (refresh) {
        this.merge(await this.repository.list())
        if (this.stopped) return
        await this.checkpoint()
        this.emit()
      }
      while (!this.stopped) {
        const record = this.records.find((r) => r.dirty && !r.conflict)
        if (!record) break
        const snapshot = structuredClone(record)
        try {
          record.sentRevision = snapshot.revision
          await this.checkpoint()
          if (this.stopped) return
          const saved = await this.repository.save(snapshot)
          if (this.stopped) return
          const latest = this.records.find((r) => r.project.id === snapshot.project.id)
          if (!latest) continue
          // An edit can arrive during an upload. Rebase it; never mark that newer edit saved.
          latest.baseRevision = saved.revision
          if (latest.revision === snapshot.revision) {
            Object.assign(latest, saved, { dirty: false, conflict: undefined, sentRevision: undefined })
          }
        } catch (error) {
          if (!(error instanceof SaveConflict)) throw error
          const latest = this.records.find((r) => r.project.id === snapshot.project.id)
          if (latest) latest.conflict = error.remote
        }
        await this.checkpoint()
        this.emit()
      }
      this.status = this.records.some((r) => r.conflict) ? 'conflict' : 'saved'
    } catch (error) {
      this.status = 'error'
      this.error = errorMessage(error, 'Couldn’t save. Your edits remain on this device.')
    }
    this.emit()
  }

  /** Keeps local work as a new project, then accepts the remote version of the original. */
  async resolve(id: string, keepCopy: boolean) {
    const local = this.records.find((r) => r.project.id === id)
    if (!local?.conflict) return
    if (keepCopy) {
      this.put({ ...structuredClone(local.project), id: crypto.randomUUID(), name: `${local.project.name} (recovered copy)`, updatedAt: Date.now() })
    }
    const remote = local.conflict
    Object.assign(local, remote, { dirty: false, baseRevision: remote.revision, conflict: undefined })
    await this.checkpoint()
    this.emit()
    await this.flush()
  }

  hasPending() { return this.diskError || this.records.some((r) => r.dirty) }
  async durable() { await this.checkpoint() }
  stop() { this.stopped = true }
}
