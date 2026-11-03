import { describe, expect, it, vi } from 'vitest'
import { colorFrame, createNote } from '../src/lib/notes'
import { preparePattern } from '../src/lib/pattern'
import { presetPattern } from '../src/lib/patternPresets'
import type { Note } from '../src/lib/types'

// One banknote in place of the project store, and artwork that stores at once
const held = vi.hoisted(() => ({ note: undefined as Note | undefined }))
vi.mock('../src/lib/store', () => ({
  findNote: () => held.note,
  updateNote: (_project: string, _note: string, change: (note: Note) => Note) => { held.note = change(held.note!) },
}))
vi.mock('../src/lib/images', () => ({ storeImage: async () => crypto.randomUUID(), removeImage: async () => {} }))
const { addImageFrames } = await import('../src/editor/frameActions')

const png = (name: string) => new File(['x'], `${name}.png`, { type: 'image/png' })

describe('artwork dropped onto colour placeholders', () => {
  it('takes their places, so each section keeps its story', async () => {
    const base = createNote({ name: 'Banknote', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#123456' })
    const placeholders = { ...base, frames: [0, 1, 2, 3, 4].map(colorFrame) }
    held.note = { ...placeholders, pattern: presetPattern(placeholders, 'split') }
    const before = preparePattern(held.note).sections.map((p) => p.slots)
    expect(before[0]).not.toEqual(before[1])

    await addImageFrames({ projectId: 'p', noteId: base.id }, ['a', 'b', 'c', 'd', 'e'].map(png))
    expect(held.note.frames.map((f) => [f.kind, f.name])).toEqual(['a', 'b', 'c', 'd', 'e'].map((name) => ['image', name]))
    // The side lane still shows only the middle three frames
    expect(preparePattern(held.note).sections.map((p) => p.slots)).toEqual(before)
  })
})
