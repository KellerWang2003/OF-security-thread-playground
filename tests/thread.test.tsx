// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FrameFill, NoteView } from '../src/components/NoteView'
import { createNote, createProject, migrateProject } from '../src/lib/notes'
import type { Frame } from '../src/lib/types'

vi.mock('../src/lib/images', () => ({ useImageUrl: (id?: string) => id ? `blob:${id}` : undefined }))

const image: Frame = { id: 'frame', kind: 'image', imageId: 'portrait', name: 'Artwork', color: '#fff', length: 10 }
const makeNote = () => createNote({ name: 'Test', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#123456' })

beforeEach(() => {
  vi.stubGlobal('Image', class {
    naturalWidth = 100
    naturalHeight = 200
    onload?: () => void
    set src(_url: string) { queueMicrotask(() => this.onload?.()) }
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('whole image repeats', () => {
  it.each([
    { direction: 'vertical' as const, imageLength: 20, copies: 8 },
    { direction: 'horizontal' as const, imageLength: 5, copies: 20 },
  ])('fills the thickness and covers the full $direction thread with gaps', async ({ direction, imageLength, copies }) => {
    const { container } = render(<FrameFill frame={image} direction={direction} thicknessPx={10} lengthPx={180} gapPx={4} />)
    await waitFor(() => expect(container.firstElementChild?.children.length).toBe(copies))
    const strip = container.firstElementChild as HTMLElement
    expect(strip.style.gap).toBe('4px')
    const tile = strip.firstElementChild as HTMLElement
    expect(tile.style.width).toBe(direction === 'vertical' ? '100%' : `${imageLength}px`)
    expect(tile.style.height).toBe(direction === 'vertical' ? `${imageLength}px` : '100%')
    // The repeat pattern covers the edge, which can land in an image or its gap.
    expect((copies - 1) * (imageLength + 4)).toBeLessThan(180)
    expect(copies * (imageLength + 4)).toBeGreaterThanOrEqual(180)
  })

  it.each(['vertical', 'horizontal'] as const)('uses uninterrupted native repetition for a zero gap, %s', (direction) => {
    const { container } = render(<FrameFill frame={image} direction={direction} thicknessPx={10} lengthPx={180} gapPx={0} />)
    const strip = container.firstElementChild as HTMLElement
    expect(strip.style.backgroundRepeat).toBe(direction === 'vertical' ? 'repeat-y' : 'repeat-x')
    expect(strip.style.backgroundSize).toBe(direction === 'vertical' ? '100%' : 'auto 100%')
  })

  it('keeps the optional background beneath images and inside the window mask', () => {
    const note = makeNote()
    note.frames = [image, { ...image, id: 'second' }]
    note.thread.backgroundColor = '#ff0088'
    const { container, rerender } = render(<NoteView note={note} scale={2} />)
    const strip = container.firstElementChild?.children[0] as HTMLElement
    expect(strip.style.backgroundColor).toBe('rgb(255, 0, 136)')
    expect(strip.style.maskImage).toContain('repeating-linear-gradient')
    rerender(<NoteView note={{ ...note, thread: { ...note.thread, backgroundColor: undefined } }} scale={2} />)
    expect(strip.style.backgroundColor).toBe('')
  })

  it('loads old cropping settings as whole artwork with zero gap and preserves new settings on reload', () => {
    const note = makeNote()
    const { imageGapMm: _gap, ...oldThread } = note.thread
    const old = { ...createProject('Legacy'), notes: [{ ...note, thread: { ...oldThread, tileMm: 2 } }] }
    const migrated = migrateProject(old)
    expect(migrated.notes[0].thread.imageGapMm).toBe(0)
    expect(migrated.notes[0].thread).not.toHaveProperty('tileMm')
    migrated.notes[0].thread.imageGapMm = 2.5
    migrated.notes[0].thread.backgroundColor = '#abcdef'
    expect(migrateProject(JSON.parse(JSON.stringify(migrated))).notes[0].thread).toEqual(migrated.notes[0].thread)
  })
})
