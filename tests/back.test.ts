import { describe, expect, it, vi } from 'vitest'
import { backOf, designFace, mirrored, sideImageId } from '../src/lib/back'
import { createNote, createProject, migrateProject } from '../src/lib/notes'
import type { Note } from '../src/lib/types'
import { turnDeg } from '../src/tilt/tilt'

// One banknote in place of the project store, and artwork that stores at once
const held = vi.hoisted(() => ({ note: undefined as Note | undefined, removed: [] as string[] }))
vi.mock('../src/lib/store', () => ({
  findNote: () => held.note,
  updateNote: (_project: string, _note: string, change: (note: Note) => Note) => { held.note = change(held.note!) },
}))
vi.mock('../src/lib/images', () => ({
  storeImage: async (file: File) => `stored-${file.name}`,
  removeImage: async (id: string) => { held.removed.push(id) },
  imageAspect: async () => 1,
}))
const { setBackImage, updateBack } = await import('../src/editor/frameActions')

const note = createNote({ name: 'N', x: 0, y: 0, widthMm: 150, heightMm: 75, color: '#86AD96' })
const back = { background: 'image' as const, color: '#F0EAD6', imageId: 'back' }

describe("a banknote's back", () => {
  it('is plain paper of the front’s colour until it is set', () => {
    expect(backOf(note)).toEqual({ background: 'solid', color: '#86AD96' })
    expect(sideImageId({ ...note, background: 'image', faceImageId: 'front' }, 'front')).toBe('front')
    expect(sideImageId({ ...note, background: 'image', faceImageId: 'front' }, 'back')).toBeUndefined()
    expect(backOf({ ...note, back })).toBe(back)
    expect(sideImageId({ ...note, back }, 'back')).toBe('back')
    // A solid back keeps its image for when Image is picked again, without showing it
    expect(sideImageId({ ...note, back: { ...back, background: 'solid' } }, 'back')).toBeUndefined()
  })

  it('shows what lies in the paper the other way round, as the banknote turns over side to side', () => {
    expect(mirrored({ xMm: 10, yMm: 18.5, widthMm: 30, heightMm: 37.5 }, note)).toEqual({ xMm: 110, yMm: 18.5, widthMm: 30, heightMm: 37.5 })
  })

  it('reads as a face of its own for the continuous check and the checks', () => {
    const both: Note = { ...note, background: 'image', faceImageId: 'front', back }
    expect(designFace(both, 'front')).toBe(both)
    expect(designFace(both, 'back')).toMatchObject({ background: 'image', faceImageId: 'back', color: '#F0EAD6' })
  })

  it('is kept as saved, and a damaged one shows the front’s paper again', () => {
    const opened = (saved: unknown) => migrateProject({ ...createProject('P'), notes: [{ ...note, back: saved }] }).notes[0].back
    expect(opened(back)).toEqual(back)
    // An image background with no image shows its colour
    expect(opened({ background: 'image', color: '#F0EAD6' })).toEqual({ background: 'solid', color: '#F0EAD6' })
    expect(opened({ ...back, background: 'solid' })).toEqual({ ...back, background: 'solid' })
    expect(opened({ background: 'image', color: 'red', imageId: 'back' })).toBeUndefined()
    expect(opened('back')).toBeUndefined()
    expect('back' in migrateProject({ ...createProject('P'), notes: [note] }).notes[0]).toBe(false)
  })

  it('is saved once set, its design shown at once and removed again, back to its colour', async () => {
    held.note = note
    held.removed = []
    updateBack({ projectId: 'p', noteId: note.id }, { color: '#F0EAD6' })
    expect(held.note.back).toEqual({ background: 'solid', color: '#F0EAD6' })
    await setBackImage({ projectId: 'p', noteId: note.id }, new File(['x'], 'back.png', { type: 'image/png' }))
    expect(held.note.back).toEqual({ background: 'image', color: '#F0EAD6', imageId: 'stored-back.png' })
    await setBackImage({ projectId: 'p', noteId: note.id }, new File(['x'], 'other.png', { type: 'image/png' }))
    expect(held.removed).toEqual(['stored-back.png'])
    await setBackImage({ projectId: 'p', noteId: note.id }, undefined)
    expect(held.note.back).toEqual({ background: 'solid', color: '#F0EAD6' })
    expect(held.removed).toEqual(['stored-back.png', 'stored-other.png'])
  })
})

describe('turning over', () => {
  it('turns the front away to edge-on, then brings the back round from edge-on to flat', () => {
    expect(turnDeg(0)).toBe(0)
    expect(turnDeg(0.25)).toBeGreaterThan(0)
    expect(turnDeg(0.25)).toBeLessThan(90)
    expect(turnDeg(0.499)).toBeCloseTo(90, 0)
    expect(turnDeg(0.5)).toBe(-90)
    expect(turnDeg(0.75)).toBeGreaterThan(-90)
    expect(turnDeg(0.75)).toBeLessThan(0)
    expect(turnDeg(1)).toBe(0)
  })
})
