import { describe, it, expect, vi } from 'vitest'
import { ProjectSync, SaveConflict, type CachedProject, type CloudProject, type ProjectRepository } from '../src/cloud/sync'
import { createProject } from '../src/lib/notes'

function fixture() {
  const rows = new Map<string, CloudProject>()
  let online = true
  let loseResponse = false
  const repository: ProjectRepository = {
    list: async () => {
      if (!online) throw new Error('Offline')
      return structuredClone([...rows.values()])
    },
    save: vi.fn(async (record) => {
      if (!online) throw new Error('Offline')
      const current = rows.get(record.project.id)
      if (current?.revision === record.revision) return structuredClone(current)
      if (current && current.revision !== record.baseRevision && current.revision !== record.sentRevision) throw new SaveConflict(structuredClone(current))
      const next = { project: record.project, revision: record.revision, deleted: record.deleted }
      rows.set(record.project.id, structuredClone(next))
      if (loseResponse) { loseResponse = false; throw new Error('Connection lost after commit') }
      return structuredClone(next)
    }),
  }
  let disk: CachedProject[] = []
  const persist = vi.fn(async (records: CachedProject[]) => { disk = structuredClone(records) })
  const engine = () => new ProjectSync(repository, persist, () => {})
  return { engine, repository, rows, persist, disk: () => disk, offline: () => { online = false }, online: () => { online = true }, loseResponse: () => { loseResponse = true } }
}

describe('durable cloud saving', () => {
  it('writes images/project work to the local outbox before attempting the remote save', async () => {
    const f = fixture()
    const sync = f.engine()
    const project = createProject('Local first')
    f.repository.save = vi.fn(async (record) => {
      expect(f.disk()[0].project).toEqual(project)
      expect(f.disk()[0].dirty).toBe(true)
      expect(f.disk()[0].sentRevision).toBe(record.revision)
      return { project, revision: record.revision, deleted: false }
    })
    sync.put(project)
    await sync.flush()
    expect(sync.status).toBe('saved')
    expect(f.disk()[0].dirty).toBe(false)
  })

  it('restores pending changes after offline reload and uploads when the network returns', async () => {
    const f = fixture()
    const first = f.engine()
    f.offline()
    const project = createProject('Offline work')
    first.put(project)
    await first.flush()
    expect(first.status).toBe('error')
    expect(f.disk()[0].dirty).toBe(true)
    first.stop()
    const reopened = f.engine()
    await reopened.initialize(f.disk())
    expect(reopened.records[0].project).toEqual(project)
    f.online()
    await reopened.refresh()
    expect(reopened.status).toBe('saved')
    expect(f.rows.get(project.id)?.project.name).toBe('Offline work')
  })

  it('preserves edits made while an earlier version is uploading', async () => {
    const f = fixture()
    const sync = f.engine()
    const project = createProject('First')
    const original = f.repository.save
    let edit = true
    f.repository.save = vi.fn(async (record) => {
      if (edit) { edit = false; sync.put({ ...project, name: 'Newer edit' }) }
      return original(record)
    })
    sync.put(project)
    await sync.flush()
    expect(f.rows.get(project.id)?.project.name).toBe('Newer edit')
    expect(f.repository.save).toHaveBeenCalledTimes(2)
    expect(sync.hasPending()).toBe(false)
  })

  it('recovers a lost save response even if newer edits arrived before a reload', async () => {
    const f = fixture()
    const sync = f.engine()
    const project = createProject('First')
    sync.put(project)
    f.loseResponse()
    await sync.flush()
    sync.put({ ...project, name: 'Edited after lost response' })
    await sync.durable()
    sync.stop()
    const reopened = f.engine()
    await reopened.initialize(f.disk())
    expect(reopened.status).toBe('saved')
    expect(f.rows.get(project.id)?.project.name).toBe('Edited after lost response')
  })

  it('detects a second device’s save and keeps both versions on request', async () => {
    const f = fixture()
    const first = f.engine()
    const second = f.engine()
    const project = createProject('Original')
    first.put(project)
    await first.flush()
    await second.initialize([])
    first.put({ ...project, name: 'First device' })
    await first.flush()
    second.put({ ...project, name: 'Second device' })
    await second.flush()
    expect(second.status).toBe('conflict')
    expect(f.rows.get(project.id)?.project.name).toBe('First device')
    expect(second.records[0].project.name).toBe('Second device')
    await second.resolve(project.id, true)
    expect([...f.rows.values()].map((r) => r.project.name).sort()).toEqual(['First device', 'Second device (recovered copy)'])
    expect(second.status).toBe('saved')
  })

  it('does not resurrect a project deleted by another device', async () => {
    const f = fixture()
    const first = f.engine()
    const second = f.engine()
    const project = createProject('Original')
    first.put(project)
    await first.flush()
    await second.initialize([])
    first.put(project, true)
    await first.flush()
    second.put({ ...project, name: 'Stale edit' })
    await second.flush()
    expect(second.status).toBe('conflict')
    expect(f.rows.get(project.id)?.deleted).toBe(true)
    await second.resolve(project.id, false)
    expect(second.records[0].deleted).toBe(true)
  })

  it('never claims saved or sends to the server if device storage fails', async () => {
    const f = fixture()
    const sync = new ProjectSync(f.repository, async () => { throw new Error('Quota exceeded') }, () => {})
    sync.put(createProject('Important'))
    await sync.flush()
    expect(sync.status).toBe('error')
    expect(sync.hasPending()).toBe(true)
    expect(f.repository.save).not.toHaveBeenCalled()
  })

  it('serializes simultaneous flushes rather than sending duplicate writes', async () => {
    const f = fixture()
    const sync = f.engine()
    sync.put(createProject('One save'))
    await Promise.all([sync.flush(), sync.flush(), sync.flush()])
    expect(f.repository.save).toHaveBeenCalledTimes(1)
    expect(sync.status).toBe('saved')
  })

  it('does not publish an old workspace’s results after the workspace closes', async () => {
    const f = fixture()
    const notify = vi.fn()
    const sync = new ProjectSync(f.repository, f.persist, notify)
    f.repository.save = vi.fn(async (record) => {
      sync.stop()
      notify.mockClear()
      return { project: record.project, revision: record.revision, deleted: false }
    })
    sync.put(createProject('Workspace A'))
    await sync.flush()
    expect(notify).not.toHaveBeenCalled()
    expect(sync.records[0].dirty).toBe(true)
  })
})
