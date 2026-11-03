// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateWindows, windowEdges } from '../src/lib/thread'
import { FrameFill, NoteView } from '../src/components/NoteView'
import { copyStarts, fitRepeat, fitTiles, imageBox, keepFitted, settleArtwork } from '../src/lib/artwork'
import { createNote, createProject, migrateProject } from '../src/lib/notes'
import { defaultPattern } from '../src/lib/pattern'
import { presetPattern } from '../src/lib/patternPresets'
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

describe('an image in the repeat', () => {
  const layout = (direction: 'vertical' | 'horizontal', offsetMm = 0) => ({ direction, scale: 2, thicknessMm: 10, lengthMm: 90, repeatMm: 25, offsetMm })
  const starts = (container: HTMLElement, direction: 'vertical' | 'horizontal') =>
    [...container.querySelectorAll('img')].map((img) => parseFloat(direction === 'vertical' ? img.style.top : img.style.left) / 2)

  it.each([
    { direction: 'vertical' as const, along: 20, first: 2.5 },
    { direction: 'horizontal' as const, along: 5, first: 10 },
  ])('shows once per repeat on a $direction thread, upright, fitted and centred', async ({ direction, along, first }) => {
    const { container } = render(<FrameFill frame={image} {...layout(direction)} />)
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(4))
    expect(starts(container, direction)).toEqual([0, 1, 2, 3].map((k) => first + 25 * k))
    const copy = container.querySelector('img')!
    expect(copy.style.width).toBe(direction === 'vertical' ? '20px' : `${2 * along}px`)
    expect(copy.style.height).toBe(direction === 'vertical' ? `${2 * along}px` : '20px')
  })

  it('sits where its place puts it, carried on past the repeat’s end, and moves with the repeat’s start', async () => {
    const placed: Frame = { ...image, aspect: 2, place: { alongMm: 20, across: 0.25, size: 0.5 } }
    const { container, rerender } = render(<FrameFill frame={placed} {...layout('vertical')} />)
    expect(starts(container, 'vertical')).toEqual([-5, 20, 45, 70])
    expect(container.querySelector('img')!.style.left).toBe('5px')
    rerender(<FrameFill frame={placed} {...layout('vertical', 3)} />)
    expect(starts(container, 'vertical')).toEqual([-2, 23, 48, 73])
  })

  it('fills the thread with a colour, and leaves an empty frame to the background', () => {
    const { container, rerender } = render(<FrameFill frame={{ ...image, kind: 'color', color: '#ff0088' }} {...layout('vertical')} />)
    expect((container.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(255, 0, 136)')
    rerender(<FrameFill frame={{ ...image, kind: 'none' }} {...layout('vertical')} />)
    expect(container.firstElementChild).toBeNull()
  })

  it('keeps the optional background beneath images and inside the window mask', () => {
    const note = makeNote()
    note.frames = [image, { ...image, id: 'second' }]
    note.thread.backgroundColor = '#ff0088'
    const { container, rerender } = render(<NoteView note={note} scale={2} />)
    const strip = container.firstElementChild?.children[0] as HTMLElement
    expect(strip.style.backgroundColor).toBe('rgb(255, 0, 136)')
    expect(strip.style.maskImage).toContain('linear-gradient')
    rerender(<NoteView note={{ ...note, thread: { ...note.thread, backgroundColor: undefined } }} scale={2} />)
    expect(strip.style.backgroundColor).toBe('')
  })

  it('shows cut guides on the banknote and shifts the cuts without moving the artwork', () => {
    const note = makeNote()
    note.thread.windows = migrateWindows({ enabled: true, windowMm: 8, gapMm: 6, offsetMm: 0 }, 70)
    const { container, rerender } = render(<NoteView note={note} scale={2} showWindowCuts />)
    const ghost = container.querySelector('[data-window-ghost]') as HTMLElement
    expect(ghost.style.opacity).toBe('0.2')
    expect(container.querySelector('[data-window-cuts]')?.children[0].getAttribute('style')).toContain('top: 0px')
    // A new banknote object, as every edit makes: the compiled view redraws only for a new one
    const windows = note.thread.windows
    const shifted = { ...note, thread: { ...note.thread, windows: { ...windows, sections: windows.sections.map((s) => ({ ...s, startMm: s.startMm + 3, endMm: s.endMm + 3 })) } } }
    rerender(<NoteView note={shifted} scale={2} showWindowCuts />)
    expect(container.querySelector('[data-window-cuts]')?.children[0].getAttribute('style')).toContain('top: 6px')
    expect((container.querySelector('[data-window-ghost]') as HTMLElement).style.top).toBe(ghost.style.top)
    rerender(<NoteView note={shifted} scale={2} />)
    expect(container.querySelector('[data-window-cuts]')).toBeNull()
    expect(container.querySelector('[data-window-ghost]')).toBeNull()
  })

  it('handles positive, negative, and wrapped offsets including partial edge windows', () => {
    const thread = makeNote().thread
    thread.windows = migrateWindows({ enabled: true, windowMm: 8, gapMm: 6, offsetMm: 3 }, 30)
    expect(windowEdges(thread, 30)).toEqual([3, 11, 17, 25])
    thread.windows = migrateWindows({ enabled: true, windowMm: 8, gapMm: 6, offsetMm: -3 }, 30)
    expect(windowEdges(thread, 30)).toEqual([0, 5, 11, 19, 25, 30])
    thread.windows = migrateWindows({ enabled: true, windowMm: 8, gapMm: 6, offsetMm: 17 }, 30)
    expect(windowEdges(thread, 30)).toEqual([3, 11, 17, 25])
    thread.windows.enabled = false
    expect(windowEdges(thread, 30)).toEqual([])
  })

  it('keeps an old thread’s gap until its images are read, and gives a new thread none', () => {
    const note = makeNote()
    expect(note.thread).not.toHaveProperty('imageGapMm')
    // Saved before thread patterns, with the cropping length from before gaps
    const { pattern: _pattern, ...old } = note
    const migrated = migrateProject({ ...createProject('Legacy'), notes: [{ ...old, thread: { ...old.thread, tileMm: 2 } }] })
    expect(migrated.notes[0].thread.imageGapMm).toBe(0)
    expect(migrated.notes[0].thread).not.toHaveProperty('tileMm')
    migrated.notes[0].thread.imageGapMm = 2.5
    migrated.notes[0].thread.backgroundColor = '#abcdef'
    expect(migrateProject(JSON.parse(JSON.stringify(migrated))).notes[0].thread).toEqual(migrated.notes[0].thread)
    // A banknote made now loads without one
    expect(migrateProject(JSON.parse(JSON.stringify({ ...createProject('New'), notes: [note] }))).notes[0].thread).not.toHaveProperty('imageGapMm')
  })
})

describe('a tile on Fit', () => {
  const bird = { ...image, aspect: 1.5 }

  it('starts new banknotes on Fit, a square tile as long as the thread is wide', () => {
    const note = makeNote()
    expect(note.pattern).toMatchObject({ fit: true, repeatMm: 4 })
    expect(fitRepeat(note)).toBe(4)
    expect(keepFitted(note)).toBe(note)
  })

  it('follows the width and the first image, so the image fills the thread back to back, and stretches the sections', () => {
    const note = makeNote()
    const wider = keepFitted({ ...note, thread: { ...note.thread, widthMm: 5 } })
    expect(wider.pattern).toMatchObject({ repeatMm: 5, sections: [{ startMm: 0, endMm: 5 }] })
    const withBird = keepFitted({ ...wider, frames: [bird, ...wider.frames] })
    expect(withBird.pattern!.repeatMm).toBe(7.5)
    // Across a horizontal thread the image's width runs along it
    const across = keepFitted({ ...withBird, thread: { ...withBird.thread, direction: 'horizontal' } })
    expect(across.pattern!.repeatMm).toBeCloseTo(5 / 1.5, 9)
  })

  it('leaves a tile set by hand, and banknotes from before Fit, as they are', () => {
    const note = makeNote()
    const thicker = (n: typeof note) => keepFitted({ ...n, thread: { ...n.thread, widthMm: 5 }, frames: [bird] })
    expect(thicker({ ...note, pattern: { ...defaultPattern(9), fit: false } }).pattern!.repeatMm).toBe(9)
    expect(thicker({ ...note, pattern: defaultPattern(9) }).pattern!.repeatMm).toBe(9)
    // A project with nothing to refit is the same project, so an edit elsewhere costs nothing
    const project = { ...createProject('Fit'), notes: [note] }
    expect(fitTiles(project)).toBe(project)
    const moved = fitTiles({ ...project, notes: [{ ...note, thread: { ...note.thread, widthMm: 6 } }] })
    expect(moved.notes[0].pattern!.repeatMm).toBe(6)
  })
})

describe('banknotes from before images sat in the repeat', () => {
  const legacy = () => {
    const note = makeNote()
    return { ...note, frames: [image, { ...image, id: 'wide', imageId: 'wide' }], thread: { ...note.thread, imageGapMm: 1.5 } }
  }

  it('take an untouched thread’s repeat from the first image and the old gap, so their images sit where they did', () => {
    const settled = settleArtwork(legacy(), new Map([['portrait', 2], ['wide', 0.5]]))
    expect(settled.thread).not.toHaveProperty('imageGapMm')
    expect(settled.frames.map((f) => f.aspect)).toEqual([2, 0.5])
    // 4 mm thick and twice as tall as wide: 8 mm of image and 1.5 mm of gap
    expect(settled.pattern!.repeatMm).toBe(9.5)
    expect(settled.frames.map((f) => f.place)).toEqual([0, 1].map(() => ({ alongMm: 0, across: 0, size: 1 })))
    const box = imageBox(settled.frames[0].place, 2, 9.5, 4, 'vertical')
    expect(copyStarts(box, 9.5, 0, 40)).toEqual([0, 9.5, 19, 28.5, 38])
  })

  it('keep the repeat of a thread with sections, fitting their images to it', () => {
    const note = legacy()
    const pattern = presetPattern(note, 'split')
    const settled = settleArtwork({ ...note, pattern }, new Map([['portrait', 2]]))
    expect(settled.pattern).toBe(pattern)
    expect(settled.thread).not.toHaveProperty('imageGapMm')
    expect(settled.frames.every((f) => f.place === undefined)).toBe(true)
  })

  it('leave banknotes made now as they are, apart from reading their images', () => {
    const note = { ...makeNote(), frames: [image] }
    const settled = settleArtwork(note, new Map([['portrait', 2]]))
    expect(settled.pattern).toBe(note.pattern)
    expect(settled.frames[0]).toEqual({ ...image, aspect: 2 })
  })
})
