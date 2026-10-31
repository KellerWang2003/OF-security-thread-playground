import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNote, createProject } from '../src/lib/notes'
import * as legacy from '../src/lib/db'
import { openWorkspace, closeWorkspace, importBrowserProjects, useWorkspace, putProject } from '../src/cloud/workspace'
import { readArtwork, readCache } from '../src/cloud/cache'
import { createRepository } from '../src/cloud/repository'

vi.mock('../src/cloud/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/cloud/repository')>()
  return { ...actual, createRepository: vi.fn(() => ({
    list: async () => [],
    save: async (record: import('../src/cloud/sync').CachedProject) => ({ project: record.project, revision: record.revision, deleted: record.deleted }),
  })) }
})
afterEach(() => { closeWorkspace(); vi.clearAllMocks() })

describe('username workspaces and browser import', () => {
  it('imports artwork and preserves the original browser project; retry makes no duplicate', async () => {
    const project = createProject('Original browser work')
    const imageId = crypto.randomUUID()
    const note = createNote({ name: 'Test banknote', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#112233' })
    note.frames[0] = { ...note.frames[0], kind: 'image', imageId }
    project.notes.push(note)
    const blob = new Blob(['test artwork'], { type: 'image/png' })
    await legacy.saveProject(project)
    await legacy.saveImage(imageId, blob)
    const owner = crypto.randomUUID()
    await openWorkspace(owner)
    await importBrowserProjects()
    const imported = useWorkspace.getState().projects.find((p) => p.name === project.name)!
    expect(imported).toBeDefined()
    expect(imported.id).not.toBe(project.id)
    expect(imported.notes).toEqual(project.notes)
    expect((await readArtwork(owner, imageId))?.size).toBe(blob.size)
    expect((await legacy.loadProjects()).find((p) => p.id === project.id)).toEqual(project)
    expect(await legacy.loadImage(imageId)).toBeDefined()
    await importBrowserProjects()
    expect(useWorkspace.getState().projects.filter((p) => p.name === project.name)).toHaveLength(1)
    await legacy.deleteProject(project.id)
    await legacy.deleteImage(imageId)
  })

  it('separates workspace caches and restores a pending draft after reopening a workspace', async () => {
    const accountA = crypto.randomUUID()
    const accountB = crypto.randomUUID()
    const draft = createProject('Private A')
    await openWorkspace(accountA)
    putProject(draft)
    // Read after the queued persistence operation completes.
    await vi.waitFor(async () => expect((await readCache(accountA)).some((r) => r.project.id === draft.id)).toBe(true))
    closeWorkspace()
    await openWorkspace(accountB)
    expect(useWorkspace.getState().projects).toEqual([])
    expect(await readCache(accountB)).toEqual([])
    closeWorkspace()
    await openWorkspace(accountA)
    expect(useWorkspace.getState().projects.some((p) => p.id === draft.id)).toBe(true)
  })

  it('retains originals and retries a failed upload using the same imported project ID', async () => {
    const project = createProject('Retry import')
    await legacy.saveProject(project)
    const owner = crypto.randomUUID()
    const savedIds: string[] = []
    let fail = true
    vi.mocked(createRepository).mockReturnValueOnce({
      list: async () => [],
      save: async (record) => {
        savedIds.push(record.project.id)
        if (fail) throw new Error('Disconnected')
        return { project: record.project, revision: record.revision, deleted: false }
      },
    })
    await openWorkspace(owner)
    await expect(importBrowserProjects()).rejects.toThrow('Import is saved on this device')
    expect((await legacy.loadProjects()).some((p) => p.id === project.id)).toBe(true)
    expect(useWorkspace.getState().legacyProjects.some((p) => p.id === project.id)).toBe(true)
    fail = false
    await importBrowserProjects()
    expect(new Set(savedIds).size).toBe(1)
    expect(useWorkspace.getState().projects.filter((p) => p.name === project.name)).toHaveLength(1)
    await legacy.deleteProject(project.id)
  })
})
