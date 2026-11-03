// @vitest-environment jsdom
import React from 'react'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { addNote, updateNote, useProjects } from '../src/lib/store'
import { createNote, migrateProject } from '../src/lib/notes'
import { newWatermark } from '../src/lib/watermark'
import { presetPattern } from '../src/lib/patternPresets'
import { setTilt, useTilt } from '../src/tilt/tilt'
import { TooltipProvider } from '../src/components/ui/tooltip'

const saves = vi.hoisted(() => vi.fn())

vi.mock('../src/cloud/client', () => ({ cloudConfigured: true }))
// Artwork a test names `fixture-…` counts as already loaded, without uploading it (jsdom has no object URLs)
vi.mock('../src/lib/images', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/images')>()
  const fixture = (id?: string) => (id?.startsWith('fixture-') ? `blob:${id}` : undefined)
  return {
    ...actual,
    useImageUrl: (id?: string) => {
      const url = actual.useImageUrl(fixture(id) ? undefined : id)
      return fixture(id) ?? url
    },
    loadImageUrl: async (id: string) => fixture(id) ?? actual.loadImageUrl(id),
  }
})
// jsdom can't read an image's pixels: a fixture reads as one Auto fits from 10% to 80%
vi.mock('../src/lib/relief', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/relief')>()
  const fixture = { key: 'fixture', thin: new Uint8ClampedArray(), width: 0, height: 0, auto: { low: 0.1, high: 0.8, gamma: 1 } }
  return {
    ...actual,
    useReading: (watermark?: { imageId?: string }) => {
      const reading = actual.useReading(watermark)
      return watermark?.imageId?.startsWith('fixture-') ? fixture : reading
    },
  }
})
vi.mock('../src/cloud/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/cloud/repository')>()
  const { createProject, createNote } = await import('../src/lib/notes')
  return { ...actual, createRepository: () => ({
    list: async () => [],
    save: async (record: import('../src/cloud/sync').CachedProject) => { saves(record); return { project: record.project, revision: record.revision, deleted: record.deleted } },
    demo: async () => ({ ...createProject('Demo fixture'), notes: [createNote({ name: 'Demo banknote', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#123456' })] }),
  }) }
})
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  localStorage.clear()
  location.hash = ''
  saves.mockClear()
  setTilt({ source: 'drag', angle: 0, target: 0 })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/** The right panel's open tab, the part of the banknote picked: Banknote, Thread or Watermark */
const tab = () => screen.queryByRole('tab', { selected: true })?.textContent

describe('username workspace editor', () => {
  it('creates a project and banknote, autosaves a rename, and duplicates the project', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'disposable-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'New project', exact: true }))
    await user.type(await screen.findByPlaceholderText('Untitled project'), 'UI test project')
    await user.click(screen.getByRole('button', { name: 'Create', exact: true }))
    await user.type(await screen.findByPlaceholderText('Banknote 1'), 'UI test banknote')
    await user.click(screen.getByRole('button', { name: 'Add', exact: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('button', { name: 'Sign out', exact: true })).toBeNull()
    const projectName = screen.getByRole('textbox', { name: 'Project name' })
    await user.clear(projectName)
    await user.type(projectName, 'Renamed UI project')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved'))
    await user.click(screen.getByRole('button', { name: 'Projects', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Duplicate', exact: true }))
    await waitFor(() => expect(screen.getByText('Renamed UI project copy')).toBeDefined())
    expect(screen.getByText('Renamed UI project', { exact: true })).toBeDefined()
    expect(screen.getAllByText('1 banknote')).toHaveLength(2)
  })
  it('edits windows without an edit mode, undoes deletion, and preserves sections when windows are off', async () => {
    vi.stubGlobal('ResizeObserver', class {
      callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) { this.callback = callback }
      observe() { this.callback([{ contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
      unobserve() {} disconnect() {}
    })
    for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: vi.fn(() => true) })
    }
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'window-editor-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Security thread', exact: true }))
    const row = (n: number) => screen.getByRole('button', { name: new RegExp(`^Window ${n},`) })
    expect(screen.queryByRole('group', { name: 'Edit thread windows' })).toBeNull()
    await user.click(row(2))
    expect(screen.getByRole('group', { name: 'Edit thread windows' })).toBeDefined()
    const start = screen.getByTitle('Window 2: visible section starts here').querySelector('input')!
    fireEvent.change(start, { target: { value: '16' } })
    expect(start.value).toBe('16')
    await user.click(screen.getByRole('button', { name: 'Window 2', exact: true }))
    await user.keyboard('{Delete}')
    expect(screen.queryByRole('button', { name: 'Delete window', exact: true })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Undo', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Window 2', exact: true }))
    expect(screen.getByTitle('Window 2: visible section starts here').querySelector('input')!.value).toBe('16')
    // Clicking the banknote away from its windows ends editing and picks the banknote itself, not its thread
    fireEvent.pointerDown(document.querySelector('[data-note-body]')!, { button: 0, pointerId: 1 })
    fireEvent.pointerUp(document.querySelector('[data-note-body]')!, { button: 0, pointerId: 1 })
    expect(screen.queryByRole('group', { name: 'Edit thread windows' })).toBeNull()
    expect(tab()).toBe('Banknote')
    await user.click(screen.getByRole('button', { name: 'Security thread', exact: true }))
    expect(row(2)).toBeDefined()
    await user.click(screen.getByRole('switch', { name: 'Windows' }))
    expect(screen.queryByRole('button', { name: /^Window 2,/ })).toBeNull()
    await user.click(screen.getByRole('switch', { name: 'Windows' }))
    expect(screen.getByRole('group', { name: 'Edit thread windows' })).toBeDefined()
    await user.click(row(2))
    expect(screen.getByTitle('Window 2: visible section starts here').querySelector('input')!.value).toBe('16')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Edit thread windows' })).toBeNull()
    expect(saves).not.toHaveBeenCalled()
  })
  it('picks only what a click lands on: the banknote itself, its thread or its watermark, never a layer picked before', async () => {
    vi.stubGlobal('ResizeObserver', class {
      callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) { this.callback = callback }
      observe() { this.callback([{ contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
      unobserve() {} disconnect() {}
    })
    for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: vi.fn(() => true) })
    }
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'selection-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    const demo = useProjects.getState().demoPreview!
    act(() => addNote(demo.id, createNote({ name: 'Other', x: 200, y: 0, widthMm: 100, heightMm: 50, color: '#654321' })))
    act(() => updateNote(demo.id, demo.notes[0].id, (n) => ({ ...n, watermark: { ...newWatermark(n), imageId: 'fixture-watermark' } })))
    const width = () => screen.getByText('W', { exact: true }).parentElement!.querySelector('input')!.value
    const body = (i: number) => document.querySelectorAll('[data-note-body]')[i]
    const click = (target: Element) => {
      fireEvent.pointerDown(target, { button: 0, buttons: 1, pointerId: 1, clientX: 100, clientY: 100 })
      fireEvent.pointerUp(target, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    }

    // The thread, then another banknote: that banknote itself, not its thread
    click(body(0).querySelector('[data-thread]')!)
    expect(tab()).toBe('Thread')
    click(body(1))
    expect(tab()).toBe('Banknote')
    expect(width()).toBe('100')

    // Tilting the selected banknote by dragging it leaves its layer showing; a click picks the banknote itself
    click(body(1).querySelector('[data-thread]')!)
    expect(tab()).toBe('Thread')
    fireEvent.pointerDown(body(1), { button: 0, buttons: 1, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(body(1), { buttons: 1, pointerId: 1, clientX: 100, clientY: 60 })
    fireEvent.pointerUp(body(1), { button: 0, pointerId: 1, clientX: 100, clientY: 60 })
    expect(tab()).toBe('Thread')
    click(body(1))
    expect(tab()).toBe('Banknote')

    // The watermark, then the banknote under it, then the other banknote: each time just what was clicked
    click(body(0).querySelector('[data-watermark]')!)
    expect(tab()).toBe('Watermark')
    click(body(0))
    expect(tab()).toBe('Banknote')
    expect(width()).toBe('150')
    click(body(0).querySelector('[data-watermark]')!)
    click(body(1))
    expect(tab()).toBe('Banknote')
    expect(width()).toBe('100')

    // The same in the list: a layer row, then another banknote's row
    await user.click(screen.getByRole('button', { name: 'Security thread', exact: true }))
    expect(tab()).toBe('Thread')
    await user.click(screen.getByRole('button', { name: 'Demo banknote', exact: true }))
    expect(tab()).toBe('Banknote')
    expect(width()).toBe('150')

    // And the other way round: turning to a tab picks that part, on the canvas too
    await user.click(screen.getByRole('tab', { name: 'Thread' }))
    expect(screen.getByRole('button', { name: 'Security thread', exact: true }).classList.contains('bg-muted')).toBe(true)
    expect(body(0).querySelector('[data-outline="selected"]')).not.toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Watermark' }))
    expect(screen.getByRole('group', { name: 'Place watermark' })).toBeDefined()
    await user.click(screen.getByRole('tab', { name: 'Banknote' }))
    expect(body(0).classList.contains('outline-2')).toBe(true)
    expect(saves).not.toHaveBeenCalled()
  })
  it('shows one tab per part, the thread’s with its lens: basic controls and preview under Edit thread', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'panel-lens-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Security thread', exact: true }))
    const note = () => useProjects.getState().demoPreview!.notes[0]
    // A tab per part, as the list has them (Watermark only once added); the banknote's own settings are a tab away
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Banknote', 'Thread'])
    expect(tab()).toBe('Thread')
    expect(screen.queryByText('W', { exact: true })).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Banknote' }))
    expect(screen.getByText('W', { exact: true })).toBeDefined()
    await user.click(screen.getByRole('tab', { name: 'Thread' }))

    // The lens's controls and its tilt map, edited for this banknote right here
    expect(screen.getByRole('combobox', { name: 'Effect' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Tilt map' })).toBeDefined()
    fireEvent.change(screen.getByText('Cycle', { exact: true }).closest('div')!.querySelector('input')!, { target: { value: '41' } })
    expect(note().tilt.cycleDeg).toBe(41)

    // With mixed angles there is no one lens: the whole print instead
    const demo = useProjects.getState().demoPreview!
    act(() => updateNote(demo.id, demo.notes[0].id, (n) => ({ ...n, pattern: { ...presetPattern(n, 'split'), mixed: true } })))
    expect(screen.getByText('Mixed', { exact: true })).toBeDefined()
    expect(screen.getByRole('img', { name: 'Print' })).toBeDefined()
    expect(screen.queryByRole('combobox', { name: 'Effect' })).toBeNull()
    expect(saves).not.toHaveBeenCalled()
  })
  it('switches the panel between tabs, folder tags and a tree, each picking parts the same way', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'panel-options-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    const tabs = () => screen.getAllByRole('tab').map((t) => t.textContent)
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).not.toBe('vertical')

    // Folder tags beside the panel, the open part named under the banknote
    await user.click(screen.getByRole('button', { name: 'Tags', exact: true }))
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe('vertical')
    expect(tabs()).toEqual(['Banknote', 'Thread'])
    await user.click(screen.getByRole('tab', { name: 'Thread' }))
    expect(tab()).toBe('Thread')
    // Named under the banknote too, beside its row in the list
    expect(screen.getAllByText('Security thread', { selector: 'span' })).toHaveLength(2)

    // The tree: the banknote by its name, its parts under it
    await user.click(screen.getByRole('button', { name: 'Tree', exact: true }))
    expect(tabs()).toEqual(['Demo banknote', 'Security thread'])
    expect(tab()).toBe('Security thread')
    await user.click(screen.getByRole('tab', { name: 'Demo banknote' }))
    expect(screen.getByText('W', { exact: true })).toBeDefined()
    // Remembered in this browser
    expect(localStorage.getItem('of-playground.panel-option')).toBe('tree')
    await user.click(screen.getByRole('button', { name: 'Tabs', exact: true }))
    expect(tabs()).toEqual(['Banknote', 'Thread'])
    expect(saves).not.toHaveBeenCalled()
  })
  it('outlines what a click would pick under the pointer, and only what is picked', async () => {
    vi.stubGlobal('ResizeObserver', class {
      callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) { this.callback = callback }
      observe() { this.callback([{ contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
      unobserve() {} disconnect() {}
    })
    for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: vi.fn(() => true) })
    }
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'hover-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    const demo = useProjects.getState().demoPreview!
    act(() => addNote(demo.id, createNote({ name: 'Other', x: 200, y: 0, widthMm: 100, heightMm: 50, color: '#654321' })))
    act(() => updateNote(demo.id, demo.notes[0].id, (n) => ({ ...n, watermark: { ...newWatermark(n), imageId: 'fixture-watermark' } })))
    const body = (i: number) => document.querySelectorAll<HTMLElement>('[data-note-body]')[i]
    const thread = () => body(0).querySelector<HTMLElement>('[data-thread]')!
    const watermark = () => body(0).querySelector<HTMLElement>('[data-watermark]')!
    const outline = (kind: 'hover' | 'selected') => body(0).querySelector<HTMLElement>(`[data-outline="${kind}"]`)
    // Where an outline sits, to tell the thread's from the watermark's
    const box = (element: HTMLElement | null) => element && [element.style.left, element.style.top, element.style.width, element.style.height]
    const banknote = (i: number) => ['outline-0', 'outline-1', 'outline-2'].find((c) => body(i).classList.contains(c))
    const move = (target: Element) => fireEvent.pointerMove(target, { pointerId: 1, buttons: 0 })
    const click = (target: Element) => {
      fireEvent.pointerDown(target, { button: 0, buttons: 1, pointerId: 1, clientX: 100, clientY: 100 })
      fireEvent.pointerUp(target, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    }

    // The banknote itself is picked from its row; over its thread or its watermark, that part is outlined lightly
    expect(banknote(0)).toBe('outline-2')
    move(thread())
    expect(box(outline('hover'))).toEqual(box(thread()))
    move(watermark())
    expect(box(outline('hover'))).toEqual(box(watermark()))
    // Over the other banknote, that banknote is, and leaving the canvas clears it
    move(body(1))
    expect(outline('hover')).toBeNull()
    expect(banknote(1)).toBe('outline-1')
    fireEvent.pointerLeave(body(1).parentElement!.parentElement!.parentElement!)
    expect(banknote(1)).toBe('outline-0')

    // A click on the thread outlines the thread instead of the banknote, and the pointer over it adds nothing more
    click(thread())
    expect(box(outline('selected'))).toEqual(box(thread()))
    expect(banknote(0)).toBe('outline-0')
    move(thread())
    expect(outline('hover')).toBeNull()
    // Over the banknote around it, the banknote is outlined lightly, the thread still firmly
    move(body(0))
    expect(banknote(0)).toBe('outline-1')
    expect(box(outline('selected'))).toEqual(box(thread()))

    // Another banknote picked: only it is outlined
    click(body(1))
    expect(banknote(1)).toBe('outline-2')
    expect(outline('selected')).toBeNull()
    expect(saves).not.toHaveBeenCalled()
  })
  it('pans and zooms the canvas as one layer, then redraws the banknotes at the new view', async () => {
    vi.stubGlobal('ResizeObserver', class {
      callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) { this.callback = callback }
      observe() { this.callback([{ contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
      unobserve() {} disconnect() {}
    })
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'pan-zoom-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    const note = () => document.querySelector('[data-note-body]')!.parentElement as HTMLElement
    const layer = () => note().parentElement as HTMLElement
    const canvas = layer().parentElement as HTMLElement
    const left = parseFloat(note().style.left)
    const readout = () => document.querySelector('[data-zoom-readout]')!.textContent

    fireEvent.wheel(canvas, { deltaX: 40, deltaY: 0 })
    fireEvent.wheel(canvas, { deltaX: 60, deltaY: 0 })
    // While the gesture runs, the layer moves and the banknote isn't re-laid out
    await waitFor(() => expect(layer().style.transform).toContain('translate(-100px, 0px)'))
    expect(parseFloat(note().style.left)).toBe(left)
    // Once it pauses, the banknote is drawn at its new place and the layer is back to no transform
    await waitFor(() => expect(parseFloat(note().style.left)).toBeCloseTo(left - 100))
    expect(layer().style.transform).toBe('')

    const before = readout()
    fireEvent.wheel(canvas, { deltaY: -40, ctrlKey: true, clientX: 0, clientY: 0 })
    await waitFor(() => expect(layer().style.transform).toContain('scale('))
    await waitFor(() => expect(readout()).not.toBe(before))
    await waitFor(() => expect(layer().style.transform).toBe(''))
  })

  it('edits the lens effect, Cycle included, for the selected banknote only', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'per-note-lens-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Duplicate', exact: true }))
    // The copy is selected, its layers open under it
    await user.click(screen.getByRole('button', { name: 'Security thread', exact: true }))
    const before = useProjects.getState().demoPreview!.notes.map((n) => n.tilt.cycleDeg)
    // The lens is edited in the thread editor
    // The lens shows in the panel too; the full one is in the thread editor
    await user.click(screen.getAllByRole('button', { name: 'Edit thread', exact: true }).find((button) => !button.closest('[data-edit-thread]'))!)
    const cycle = screen.getByText('Cycle', { exact: true }).closest('label, div')!.querySelector('input')!
    fireEvent.change(cycle, { target: { value: '47' } })
    fireEvent.blur(cycle)
    const notes = useProjects.getState().demoPreview!.notes
    const changed = notes.filter((n, i) => n.tilt.cycleDeg !== before[i])
    expect(changed).toHaveLength(1)
    expect(changed[0].tilt.cycleDeg).toBe(47)
  })
  it('opens playback settings and applies saved fade, speed, curve and hold to every banknote', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'playback-settings-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Duplicate', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Playback settings', exact: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Playback settings' })
    expect(dialog).toBeDefined()
    fireEvent.change(screen.getByTitle('How much neighbouring frames blend into each other').querySelector('input')!, { target: { value: '60' } })
    fireEvent.change(screen.getByTitle('Playback speed multiplier; 1× takes one second each way').querySelector('input')!, { target: { value: '2' } })
    fireEvent.change(screen.getByTitle('Pause at flat and at full tilt, in seconds at each end').querySelector('input')!, { target: { value: '0.5' } })
    await user.click(screen.getByRole('combobox', { name: 'Playback curve' }))
    await user.click(await screen.findByRole('option', { name: 'Linear', exact: true }))
    const project = useProjects.getState().demoPreview!
    expect(project.notes).toHaveLength(2)
    for (const note of migrateProject(JSON.parse(JSON.stringify(project))).notes) {
      expect(note.tilt).toMatchObject({ transition: 0.6, speed: 2, curve: 'linear', holdSeconds: 0.5 })
    }
    expect(screen.getByText('2 s loop')).toBeDefined()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Playback settings' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Playback settings', exact: true })).toBeDefined()
    expect(saves).not.toHaveBeenCalled()
  })
  it('discards demo edits on exit and signs out without creating any project', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'demo-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await screen.findByRole('button', { name: 'New project', exact: true })
    expect(screen.queryByText('Demo fixture')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Demo', exact: true }))
    await screen.findByRole('button', { name: 'Exit demo' })
    const name = screen.getByRole('textbox', { name: 'Project name' })
    await user.clear(name)
    await user.type(name, 'Unsaved demo edit')
    expect(screen.getByRole('status').textContent).toBe('Demo preview')
    await user.click(screen.getByRole('button', { name: 'Exit demo' }))
    await screen.findByRole('button', { name: 'New project', exact: true })
    expect(screen.queryByText('Unsaved demo edit')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Demo', exact: true }))
    await screen.findByRole('button', { name: 'Exit demo' })
    expect((screen.getByRole('textbox', { name: 'Project name' }) as HTMLInputElement).value).toBe('Demo fixture')
    expect(screen.queryByRole('button', { name: 'Sign out', exact: true })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Exit demo' }))
    await screen.findByRole('button', { name: 'New project', exact: true })
    await user.click(screen.getByRole('button', { name: 'Account: demo-ui-test' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    await screen.findByRole('textbox', { name: 'Username' })
    expect(localStorage.getItem('of-thread-workspace')).toBeNull()
    expect(saves).not.toHaveBeenCalled()
  })

  it('toggles playback immediately with Space, ignores repeats and typing, and respects dialogs', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'keyboard-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await screen.findByRole('button', { name: 'New project', exact: true })
    await user.click(screen.getByRole('button', { name: 'Demo', exact: true }))
    await screen.findByRole('button', { name: 'Exit demo' })
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    expect(useTilt.getState().source).toBe('wobble')
    expect(screen.getByRole('button', { name: 'Pause', exact: true })).toBeDefined()
    fireEvent.keyDown(window, { code: 'Space', key: ' ', repeat: true })
    expect(useTilt.getState().source).toBe('wobble')
    act(() => setTilt({ angle: 17, target: 17 }))
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    expect(useTilt.getState().source).toBe('slider')
    expect(useTilt.getState().target).toBe(17)

    // The shortcut also works with the playback button focused, without a second toggle on keyup.
    await user.click(screen.getByRole('button', { name: 'Play', exact: true }))
    await user.keyboard(' ')
    expect(useTilt.getState().source).toBe('slider')
    const name = screen.getByRole('textbox', { name: 'Project name' })
    await user.click(name)
    await user.keyboard(' ')
    expect(useTilt.getState().source).toBe('slider')
    await user.click(screen.getByRole('button', { name: 'Add banknote', exact: true }))
    await screen.findByRole('dialog')
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    expect(useTilt.getState().source).toBe('slider')
  })

  it('supports toolbar and keyboard undo/redo in the temporary editor', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'undo-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await screen.findByRole('button', { name: 'New project', exact: true })
    await user.click(screen.getByRole('button', { name: 'Demo', exact: true }))
    await screen.findByRole('button', { name: 'Exit demo' })
    expect((screen.getByRole('button', { name: 'Undo', exact: true }) as HTMLButtonElement).disabled).toBe(true)
    const name = screen.getByRole('textbox', { name: 'Project name' }) as HTMLInputElement
    await user.clear(name)
    await user.type(name, 'Changed demo')
    await user.click(screen.getByRole('button', { name: 'Undo', exact: true }))
    expect(name.value).toBe('Demo fixture')
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true })
    expect(name.value).toBe('Changed demo')
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(name.value).toBe('Demo fixture')
    fireEvent.keyDown(window, { key: 'y', code: 'KeyY', ctrlKey: true })
    expect(name.value).toBe('Changed demo')
    expect(saves).not.toHaveBeenCalled()
  })

  it('springs a tilt drag back to flat however the drag ends, and leaves a held tilt alone on a click', async () => {
    vi.stubGlobal('ResizeObserver', class {
      callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) { this.callback = callback }
      observe() { this.callback([{ contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
      unobserve() {} disconnect() {}
    })
    for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: vi.fn(() => true) })
    }
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'tilt-spring-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    const body = () => document.querySelector('[data-note-body]')!
    const target = () => ({ y: useTilt.getState().target, x: useTilt.getState().targetX })
    const drag = (button = 0) => {
      fireEvent.pointerDown(body(), { button, buttons: button === 0 ? 1 : 2, pointerId: 1, clientX: 100, clientY: 100 })
      fireEvent.pointerMove(body(), { buttons: 1, pointerId: 1, clientX: 140, clientY: 60 })
    }
    const unlock = () => setTilt({ source: 'drag', angle: 0, angleX: 0, target: 0, targetX: 0, lockX: false, lockY: false })

    // A clean release
    unlock()
    drag()
    expect(target().y).not.toBe(0)
    fireEvent.pointerUp(body(), { button: 0, pointerId: 1, clientX: 140, clientY: 60 })
    expect(target()).toEqual({ y: 0, x: 0 })

    // A release that never arrived, noticed on the next move
    drag()
    fireEvent.pointerMove(body(), { buttons: 0, pointerId: 1, clientX: 150, clientY: 50 })
    expect(target()).toEqual({ y: 0, x: 0 })

    // Losing pointer capture, or the window losing focus, mid-drag
    drag()
    fireEvent(body(), new Event('lostpointercapture', { bubbles: true }))
    expect(target()).toEqual({ y: 0, x: 0 })
    drag()
    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(target()).toEqual({ y: 0, x: 0 })

    // A locked axis keeps where it was dragged
    setTilt({ lockX: true })
    drag()
    const side = target().x
    fireEvent.pointerUp(body(), { button: 0, pointerId: 1 })
    expect(target()).toEqual({ y: 0, x: side })
    unlock()

    // A right-click doesn't tilt
    drag(2)
    expect(target()).toEqual({ y: 0, x: 0 })
    fireEvent.pointerUp(body(), { button: 2, pointerId: 1 })

    // A click with no drag leaves a held tilt where it is
    setTilt({ source: 'hold', angle: 12, target: 12, angleX: -5, targetX: -5 })
    fireEvent.pointerDown(body(), { button: 0, buttons: 1, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(body(), { buttons: 1, pointerId: 1, clientX: 101, clientY: 101 })
    fireEvent.pointerUp(body(), { button: 0, pointerId: 1, clientX: 101, clientY: 101 })
    expect(target()).toEqual({ y: 12, x: -5 })
  })

  it('adds a watermark as a layer, places it on the canvas flat and clear, and holds every banknote to the light with L', async () => {
    vi.stubGlobal('ResizeObserver', class {
      callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) { this.callback = callback }
      observe() { this.callback([{ contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
      unobserve() {} disconnect() {}
    })
    for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: vi.fn(() => true) })
    }
    setTilt({ backlit: false, peek: false, light: 0 })
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'watermark-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    const placing = () => screen.queryByRole('group', { name: 'Place watermark' })
    const watermark = () => useProjects.getState().demoPreview!.notes[0].watermark

    // The banknote's own row opens the Banknote tab; each layer under it opens its own
    expect(tab()).toBe('Banknote')
    await user.click(screen.getByRole('button', { name: 'Security thread', exact: true }))
    expect(tab()).toBe('Thread')

    // Adding the watermark selects it and shows the banknote flat with it clear, with its box to place; the tilt pad steps aside
    await user.click(screen.getByRole('button', { name: 'Add layer' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Watermark' }))
    expect(watermark()).toBeDefined()
    expect(tab()).toBe('Watermark')
    expect(placing()).not.toBeNull()
    expect(screen.queryByRole('group', { name: 'Tilt' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add layer' })).toBeNull()
    const { xMm } = watermark()!
    fireEvent.keyDown(placing()!, { key: 'ArrowRight' })
    expect(watermark()!.xMm).toBe(xMm + 0.5)
    fireEvent.change(screen.getByTitle('How strongly the watermark shows at its clearest, tilted or held to the light').querySelector('input')!, { target: { value: '30' } })
    expect(watermark()!.depth).toBe(0.3)

    // Escape ends placing and keeps the watermark selected
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(placing()).toBeNull()
    expect(tab()).toBe('Watermark')
    expect(screen.getByRole('group', { name: 'Tilt' })).toBeDefined()

    // A tap of L holds every banknote to the light, as the lamp on the pad shows; typing an L doesn't
    fireEvent.keyDown(window, { key: 'l' })
    fireEvent.keyUp(window, { key: 'l' })
    expect(useTilt.getState().backlit).toBe(true)
    expect(screen.getByRole('button', { name: 'Hold up to the light' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('textbox', { name: 'Project name' }))
    await user.keyboard('l')
    expect(useTilt.getState().backlit).toBe(true)

    // Once it has an image, the watermark drags on the banknote as the thread does: a press picks it, with its box and
    // corners, and a drag moves it in 0.5 mm steps instead of tilting the banknote
    expect(screen.queryByRole('switch', { name: 'Invert' })).toBeNull()
    const demo = useProjects.getState().demoPreview!
    act(() => updateNote(demo.id, demo.notes[0].id, (n) => ({ ...n, watermark: { ...n.watermark!, imageId: 'fixture-watermark' } })))
    const hit = () => document.querySelector('[data-note-body] [data-watermark]')!
    const tilt = () => ({ y: useTilt.getState().target, x: useTilt.getState().targetX })
    const start = watermark()!
    const tiltBefore = tilt()
    fireEvent.pointerDown(hit(), { button: 0, buttons: 1, pointerId: 1, clientX: 100, clientY: 100 })
    expect(placing()).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Resize watermark from its bottom-right corner' })).toBeDefined()
    // A wobble doesn't move it
    fireEvent.pointerMove(hit(), { buttons: 1, pointerId: 1, clientX: 101, clientY: 101 })
    expect(watermark()).toEqual(start)
    fireEvent.pointerMove(hit(), { buttons: 1, pointerId: 1, clientX: 140, clientY: 100 })
    const moved = watermark()!
    expect(moved.xMm).toBeGreaterThan(start.xMm)
    expect(moved.xMm % 0.5).toBe(0)
    expect(moved.yMm).toBe(start.yMm)
    expect(moved.widthMm).toBe(start.widthMm)
    fireEvent.pointerUp(hit(), { button: 0, pointerId: 1, clientX: 140, clientY: 100 })
    expect(tilt()).toEqual(tiltBefore)
    expect(placing()).not.toBeNull()
    // A click elsewhere on the banknote ends placing
    fireEvent.pointerDown(document.querySelector('[data-note-body]')!, { button: 0, buttons: 1, pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(document.querySelector('[data-note-body]')!, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    expect(placing()).toBeNull()
    // A click on it picks it again without moving it
    fireEvent.pointerDown(hit(), { button: 0, buttons: 1, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(hit(), { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    expect(placing()).not.toBeNull()
    expect(watermark()).toEqual(moved)
    fireEvent.keyDown(window, { key: 'Escape' })

    // Invert reads the image the other way round, dark parts thinner; switched off, it is left unsaid
    await user.click(screen.getByRole('switch', { name: 'Invert' }))
    expect(watermark()).toEqual({ ...moved, invert: true })
    await user.click(screen.getByRole('switch', { name: 'Invert' }))
    expect(watermark()).toEqual(moved)

    // Levels start on Auto, fitted to the image; moving a handle sets them by hand and turns Auto off
    const autoLevels = () => screen.getByRole('switch', { name: 'Auto levels' })
    // jsdom has no layout, so the slider keeps its handles hidden (unnamed to a role query) until it could place them
    const handle = (name: string) => screen.getByLabelText(name)
    expect(autoLevels().getAttribute('aria-checked')).toBe('true')
    expect(handle('Where the watermark starts').getAttribute('aria-valuenow')).toBe('10')
    expect(handle('Midtones').getAttribute('aria-valuenow')).toBe('45')
    expect(handle('Where it is thinnest').getAttribute('aria-valuenow')).toBe('80')
    fireEvent.keyDown(handle('Where the watermark starts'), { key: 'ArrowRight' })
    expect(watermark()).toEqual({ ...moved, levels: { low: 0.11, high: 0.8, gamma: 1 } })
    expect(autoLevels().getAttribute('aria-checked')).toBe('false')
    // The midtones handle keeps its place between the ends; left of the middle brightens them
    expect(handle('Midtones').getAttribute('aria-valuenow')).toBe('45.5')
    fireEvent.keyDown(handle('Midtones'), { key: 'ArrowLeft' })
    expect(watermark()!.levels!.gamma).toBeGreaterThan(1)
    // Auto again leaves them unsaid; switched off, it keeps Auto's to set by hand
    await user.click(autoLevels())
    expect(watermark()).toEqual(moved)
    await user.click(autoLevels())
    expect(watermark()).toEqual({ ...moved, levels: { low: 0.1, high: 0.8, gamma: 1 } })
    await user.click(autoLevels())

    // The lamp on the pad switches it off again
    await user.click(screen.getByRole('button', { name: 'Hold up to the light' }))
    expect(useTilt.getState().backlit).toBe(false)
    expect(saves).not.toHaveBeenCalled()
  })

  it('keeps the watermark when a banknote is duplicated, removes it from its layer, and undoes the removal', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'watermark-remove-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Add layer' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Watermark' }))
    const notes = () => useProjects.getState().demoPreview!.notes
    const original = notes()[0].watermark

    await user.click(screen.getByRole('button', { name: 'Duplicate', exact: true }))
    await waitFor(() => expect(notes()).toHaveLength(2))
    expect(notes()[1].watermark).toEqual(original)

    // The copy is selected as a banknote, not on the layer picked before; removing its watermark leaves the original alone
    expect(tab()).toBe('Banknote')
    await user.click(screen.getByRole('button', { name: 'Watermark', exact: true }))
    expect(tab()).toBe('Watermark')
    // From its row in the list (the panel has one beside the tabs too)
    const [fromList, besideTabs] = screen.getAllByRole('button', { name: 'Remove watermark' })
    expect(besideTabs).toBeDefined()
    await user.click(fromList)
    expect(notes()[1].watermark).toBeUndefined()
    expect(notes()[0].watermark).toEqual(original)
    expect(screen.queryByRole('button', { name: 'Watermark', exact: true })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Watermark' })).toBeNull()
    // The banknote itself stays selected
    expect(tab()).toBe('Banknote')

    await user.click(screen.getByRole('button', { name: 'Undo', exact: true }))
    expect(notes()[1].watermark).toEqual(original)
    expect(saves).not.toHaveBeenCalled()
  })
})
