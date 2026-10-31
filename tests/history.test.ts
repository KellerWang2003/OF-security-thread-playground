import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNote, createProject } from '../src/lib/notes'
import { beginHistoryGroup, endHistoryGroup, historyStep, recordEdit, reconcileHistory, resetHistory, useHistory } from '../src/lib/history'
import type { Project } from '../src/lib/types'

beforeEach(() => { resetHistory(); vi.useRealTimers() })
function fixture(): Project {
  return { ...createProject('Test'), notes: [createNote({ name: 'Banknote', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#123456' })] }
}

describe('project undo history', () => {
  it('undoes and redoes deletion with artwork references intact', () => {
    const before = fixture()
    before.notes[0].frames[0].imageId = 'retained-artwork'
    before.notes[0].frames[0].kind = 'image'
    const after = { ...before, notes: [] }
    recordEdit(before, after)
    const restored = historyStep(after, 'undo')!
    expect(restored.notes).toEqual(before.notes)
    expect(historyStep(restored, 'redo')!.notes).toEqual([])
  })

  it('groups a long drag into one undo even across pauses between pointer moves', () => {
    vi.useFakeTimers()
    let project = fixture()
    const initial = structuredClone(project)
    beginHistoryGroup(project.id)
    for (let x = 1; x <= 25; x++) {
      vi.advanceTimersByTime(1000)
      const next = { ...project, notes: project.notes.map((note) => ({ ...note, x })) }
      recordEdit(project, next)
      project = next
    }
    endHistoryGroup(project.id)
    expect(useHistory.getState().entries[project.id].past).toHaveLength(1)
    const restored = historyStep(project, 'undo')!
    expect(restored.notes).toEqual(initial.notes)
    expect(historyStep(restored, 'undo')).toBeUndefined()
    vi.useRealTimers()
  })

  it('coalesces typing but separates different properties and structural edits', () => {
    const original = fixture()
    let project = original
    for (const name of ['B', 'Ba', 'Banknote name']) {
      const next = { ...project, name }
      recordEdit(project, next)
      project = next
    }
    const resized = { ...project, notes: project.notes.map((note) => ({ ...note, widthMm: 160 })) }
    recordEdit(project, resized)
    const extraNote = { ...resized, notes: [...resized.notes, { ...resized.notes[0], id: crypto.randomUUID() }] }
    recordEdit(resized, extraNote)
    const undoAdd = historyStep(extraNote, 'undo')!
    expect(undoAdd.notes).toHaveLength(1)
    const undoSize = historyStep(undoAdd, 'undo')!
    expect(undoSize.notes[0].widthMm).toBe(150)
    expect(historyStep(undoSize, 'undo')!.name).toBe(original.name)
  })

  it('ignores timestamp-only changes and clears redo after a new edit', () => {
    const original = fixture()
    expect(recordEdit(original, { ...original, updatedAt: original.updatedAt + 100 })).toBe(false)
    const renamed = { ...original, name: 'Renamed' }
    recordEdit(original, renamed)
    const restored = historyStep(renamed, 'undo')!
    const other = { ...restored, name: 'Another edit' }
    recordEdit(restored, other)
    expect(historyStep(other, 'redo')).toBeUndefined()
  })

  it('invalidates history when a cloud version replaces the local project', () => {
    const original = fixture()
    const local = { ...original, name: 'Local edit' }
    recordEdit(original, local)
    reconcileHistory([{ ...local, name: 'Another device' }])
    expect(useHistory.getState().entries[original.id]).toBeUndefined()
    expect(historyStep(local, 'undo')).toBeUndefined()
  })

  it('caps history and keeps separate projects independent', () => {
    let project = fixture()
    const other = fixture()
    for (let i = 0; i < 110; i++) {
      beginHistoryGroup(project.id)
      const next = { ...project, name: String(i) }
      recordEdit(project, next)
      project = next
      endHistoryGroup(project.id)
    }
    recordEdit(other, { ...other, name: 'Other' })
    expect(useHistory.getState().entries[project.id].past).toHaveLength(100)
    expect(useHistory.getState().entries[other.id].past).toHaveLength(1)
  })
})
