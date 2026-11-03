// @vitest-environment jsdom
import React from 'react'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { addNote, updateNote, useProjects } from '../src/lib/store'
import { createNote, createProject, migrateProject } from '../src/lib/notes'
import { createDemoProject } from '../src/lib/demo'
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
// Nor can it work out magnetic ink's mask: a fixture's is ready straight away
vi.mock('../src/lib/inkMask', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/inkMask')>()
  return {
    ...actual,
    useInkMask: (ink?: { imageId?: string }) => {
      const mask = actual.useInkMask(ink)
      return ink?.imageId?.startsWith('fixture-') ? { key: 'fixture', canvas: document.createElement('canvas'), url: 'data:image/png;base64,' } : mask
    },
  }
})
vi.mock('../src/cloud/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/cloud/repository')>()
  return { ...actual, createRepository: () => ({
    list: async () => [],
    save: async (record: import('../src/cloud/sync').CachedProject) => { saves(record); return { project: record.project, revision: record.revision, deleted: record.deleted } },
  }) }
})
// The demo's artwork is drawn on a canvas, which jsdom lacks: Demo opens one plain banknote instead
vi.mock('../src/lib/demo', async () => {
  const { createProject, createNote } = await import('../src/lib/notes')
  return { createDemoProject: vi.fn(async () => ({ ...createProject('Demo fixture'), notes: [createNote({ name: 'Demo banknote', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#123456' })] })) }
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
  it('handles frames on the timeline: a click goes to one, a drag reorders, × deletes, the pencil edits its fill, the line scrubs', async () => {
    for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: vi.fn(() => true) })
    }
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'timeline-fill-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    const note = () => useProjects.getState().demoPreview!.notes[0]
    const open = () => screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent
    const clip = (id: string) => document.querySelector<HTMLElement>(`[data-frame-clip="${id}"]`)!
    // The tilt arriving where the timeline sent it (the spring that gets it there doesn't run here)
    const arrive = () => act(() => { const s = useTilt.getState(); setTilt({ angle: s.target, angleX: s.targetX }) })
    const [a, b] = note().frames.map((f) => f.id)
    expect(open()).toBe('Banknote')

    // A click on a clip goes to that frame, and working on the frames turns the panel to the thread (Keller)
    for (const id of [a, b]) {
      fireEvent.pointerDown(clip(id), { button: 0, buttons: 1, clientX: 50, pointerId: 1 })
      fireEvent.pointerUp(clip(id), { button: 0, clientX: 50, pointerId: 1 })
      arrive()
      expect(clip(id).classList.contains('ring-1')).toBe(true)
    }
    expect(open()).toBe('Thread')

    // A drag along the track moves a frame in the order, the others sliding aside while it goes
    fireEvent.pointerDown(clip(a), { button: 0, buttons: 1, clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(clip(a), { buttons: 1, clientX: 120, pointerId: 1 })
    expect(clip(a).style.transform).toBe('translateX(120px)')
    expect(clip(b).style.transform).toBe('translateX(-100px)')
    fireEvent.pointerUp(clip(a), { button: 0, clientX: 120, pointerId: 1 })
    expect(note().frames.map((f) => f.id)).toEqual([b, a])
    expect(clip(a).style.transform).toBe('')

    // × deletes a frame, shown only while there are more than the fewest
    expect(screen.queryByRole('button', { name: 'Delete frame 1' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add frame' }))
    await user.click(await screen.findByRole('menuitem', { name: /Empty frame/ }))
    expect(note().frames).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Delete frame 3' }))
    expect(note().frames.map((f) => f.id)).toEqual([b, a])

    // The pencil edits a frame's fill, in the same panel as the right panel's, and turns to the thread too
    await user.click(screen.getByRole('tab', { name: 'Banknote' }))
    await user.click(screen.getByRole('button', { name: 'Edit frame 2' }))
    expect(open()).toBe('Thread')
    const hex = document.querySelector<HTMLInputElement>('[data-slot="popover-content"] input:not([type="color"])')!
    fireEvent.change(hex, { target: { value: '#123456' } })
    expect(note().frames[1].color).toBe('#123456')
    expect(note().frames[0].color).not.toBe('#123456')
    await user.click(screen.getByRole('button', { name: 'Edit frame 2' }))

    // The line scrubs, and so does the track round the frames (the band above them), where a press is easy to land
    // while the line runs during playback
    act(() => setTilt({ source: 'slider', angle: 0, target: 0, angleX: 0, targetX: 0 }))
    const track = clip(a).parentElement!
    fireEvent.pointerDown(track, { button: 0, buttons: 1, clientX: 30, pointerId: 1 })
    fireEvent.pointerUp(track, { button: 0, clientX: 30, pointerId: 1 })
    expect([useTilt.getState().target, useTilt.getState().targetX]).not.toEqual([0, 0])
    expect(note().frames.map((f) => f.id)).toEqual([b, a])
    act(() => setTilt({ source: 'slider', angle: 0, target: 0, angleX: 0, targetX: 0 }))
    const line = document.querySelector<HTMLElement>('[data-playhead]')!
    fireEvent.pointerDown(line, { button: 0, buttons: 1, clientX: 30, pointerId: 1 })
    fireEvent.pointerMove(line, { buttons: 1, clientX: 190, pointerId: 1 })
    fireEvent.pointerUp(line, { button: 0, clientX: 190, pointerId: 1 })
    expect([useTilt.getState().target, useTilt.getState().targetX]).not.toEqual([0, 0])
  })
  it('names the thread’s size by its direction, leaves an image’s place to Thread Studio, and fills the background as a frame', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'thread-size-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    const note = () => useProjects.getState().demoPreview!.notes[0]

    // The banknote's background is chosen as a frame's fill is (Keller: the same everywhere), and Image starts empty
    const background = () => screen.getByRole('button', { name: /^Background: / })
    await user.click(background())
    await user.click(await screen.findByRole('button', { name: 'Image', exact: true }))
    expect(note().background).toBe('image')
    expect(screen.getByRole('button', { name: 'Upload design' })).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Colour', exact: true }))
    expect(note().background).toBe('solid')
    await user.click(background())

    // Across the thread: its Width when it runs down the banknote, its Height when it runs across
    await user.click(screen.getByRole('button', { name: 'Security thread', exact: true }))
    expect(screen.getByText('Width', { exact: true })).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Horizontal', exact: true }))
    expect(screen.getByText('Height', { exact: true })).toBeDefined()
    expect(screen.queryByText('Width', { exact: true })).toBeNull()
    expect(screen.getByRole('button', { name: 'Fit to the height' })).toBeDefined()

    // An image fits the width here, the tile following it; where it sits in the tile is set in Thread Studio
    act(() => updateNote(useProjects.getState().demoPreview!.id, note().id, (n) => ({
      ...n, frames: n.frames.map((f) => ({ ...f, kind: 'image' as const, imageId: 'art', aspect: 1 })),
    })))
    expect(screen.getByText('Tile pattern', { exact: true })).toBeDefined()
    expect(screen.queryByText('Place', { exact: true })).toBeNull()
  })
  it('shows one tab per part, labels every control, and the thread’s lens with its preview in a drawer at the foot', async () => {
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
    expect(screen.queryByText('H', { exact: true })).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Banknote' }))
    expect(screen.getByText('H', { exact: true })).toBeDefined()
    await user.click(screen.getByRole('tab', { name: 'Thread' }))

    // Small labels say what each control is
    for (const label of ['Direction', 'Width', 'Tile length', 'Position', 'Effect', 'Seen flat']) expect(screen.getByText(label, { exact: true })).toBeDefined()
    // The frame the timeline is on, filled right here as in Thread Studio's Frames tab, since they are normal controls
    // (Keller), its fill chosen in a panel of its own as Figma's; the timeline picks the frame, so no frame numbers
    expect(screen.getByText('Tile pattern', { exact: true })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Frame 1', exact: true })).toBeNull()
    // + and − add and remove it, as in Figma; its panel offers a colour or an image, then, in a second section, the
    // background colour under every frame (Keller), which an empty frame shows
    const fill = () => screen.queryByRole('button', { name: /^Tile pattern: / })
    await user.click(screen.getByRole('button', { name: 'Remove tile pattern' }))
    expect(fill()).toBeNull()
    const emptied = note().frames.findIndex((f) => f.kind === 'none')
    expect(emptied).toBeGreaterThanOrEqual(0)
    await user.click(screen.getByRole('button', { name: 'Add tile pattern' }))
    expect(note().frames[emptied].kind).toBe('color')
    await user.click(fill()!)
    expect(screen.getAllByRole('button', { name: /^(Colour|Image)$/ }).map((b) => b.textContent)).toEqual(['Colour', 'Image'])
    await user.click(screen.getByRole('switch', { name: 'Background colour' }))
    expect(note().thread.backgroundColor).toBe('#ffffff')
    await user.click(screen.getByRole('switch', { name: 'Background colour' }))
    expect(note().thread.backgroundColor).toBeUndefined()
    // Image starts empty, an image to add with its button, rather than asking for a file straight away (Keller)
    await user.click(screen.getByRole('button', { name: 'Image', exact: true }))
    expect(note().frames[emptied].kind).toBe('image')
    expect(note().frames[emptied].imageId).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Colour', exact: true }))
    expect(note().frames[emptied].kind).toBe('color')
    await user.click(fill()!)
    // There is no Image gap any more
    expect(screen.queryByTitle('Space between complete image copies along the thread')).toBeNull()

    // The lens's controls, edited for this banknote right here; Thread Studio opens from the canvas, not the panel
    expect(screen.getByRole('combobox', { name: 'Effect' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Edit thread' })).toBeNull()
    fireEvent.change(screen.getByText('Cycle', { exact: true }).closest('div')!.querySelector('input')!, { target: { value: '41' } })
    expect(note().tilt.cycleDeg).toBe(41)
    // Its preview sits in a drawer at the panel's foot
    const preview = screen.getByRole('button', { name: 'Preview' })
    if (preview.getAttribute('aria-expanded') !== 'true') await user.click(preview)
    expect(screen.getByRole('button', { name: 'Tilt map' })).toBeDefined()
    expect(screen.getByText('Frames seen', { exact: true })).toBeDefined()

    // With mixed angles there is no one lens: the drawer shows the whole print instead
    const demo = useProjects.getState().demoPreview!
    act(() => updateNote(demo.id, demo.notes[0].id, (n) => ({ ...n, pattern: { ...presetPattern(n, 'split'), mixed: true } })))
    expect(screen.getByText('Mixed', { exact: true })).toBeDefined()
    expect(screen.getByRole('img', { name: 'Print' })).toBeDefined()
    expect(screen.queryByRole('combobox', { name: 'Effect' })).toBeNull()
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
    // How wide the banknote is drawn: it follows the zoom once the view is committed
    const drawn = () => parseFloat((document.querySelector('[data-note-body]')!.firstElementChild as HTMLElement).style.width)

    fireEvent.wheel(canvas, { deltaX: 40, deltaY: 0 })
    fireEvent.wheel(canvas, { deltaX: 60, deltaY: 0 })
    // While the gesture runs, the layer moves and the banknote isn't re-laid out
    await waitFor(() => expect(layer().style.transform).toContain('translate(-100px, 0px)'))
    expect(parseFloat(note().style.left)).toBe(left)
    // Once it pauses, the banknote is drawn at its new place and the layer is back to no transform
    await waitFor(() => expect(parseFloat(note().style.left)).toBeCloseTo(left - 100))
    expect(layer().style.transform).toBe('')

    const before = drawn()
    fireEvent.wheel(canvas, { deltaY: -40, ctrlKey: true, clientX: 0, clientY: 0 })
    await waitFor(() => expect(layer().style.transform).toContain('scale('))
    expect(drawn()).toBe(before)
    await waitFor(() => expect(layer().style.transform).toBe(''))
    expect(drawn()).toBeGreaterThan(before)
    // No zoom percentage: nothing says what 100% is
    expect(screen.queryByText(/^\d+%$/)).toBeNull()
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
    // The lens is edited in the panel (and in Thread Studio)
    const cycle = screen.getByText('Cycle', { exact: true }).closest('label, div')!.querySelector('input')!
    fireEvent.change(cycle, { target: { value: '47' } })
    fireEvent.blur(cycle)
    const notes = useProjects.getState().demoPreview!.notes
    const changed = notes.filter((n, i) => n.tilt.cycleDeg !== before[i])
    expect(changed).toHaveLength(1)
    expect(changed[0].tilt.cycleDeg).toBe(47)
  })
  it('opens playback settings and applies saved fade, speed, curve and a Hold to every banknote', async () => {
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
    fireEvent.change(screen.getByTitle('Playback speed multiplier; 1× takes 1⅓ seconds each way').querySelector('input')!, { target: { value: '2' } })
    await user.click(within(dialog).getByRole('button', { name: 'Hold', exact: true }))
    fireEvent.change(screen.getByTitle('Seconds held flat, at 1× speed').querySelector('input')!, { target: { value: '0.4' } })
    await user.click(screen.getByRole('combobox', { name: 'Playback curve' }))
    await user.click(await screen.findByRole('option', { name: 'Linear', exact: true }))
    const project = useProjects.getState().demoPreview!
    expect(project.notes).toHaveLength(2)
    for (const note of migrateProject(JSON.parse(JSON.stringify(project))).notes) {
      expect(note.tilt).toMatchObject({ transition: 0.6, speed: 2, curve: 'linear' })
      expect(note.tilt.moves?.map((m) => [m.kind, m.seconds])).toEqual([['y', undefined], ['hold', 0.4]])
    }
    // The default Up/down stays as it was, 30° back to flat (1 s at 2×: a ⅓ s glide out and ⅔ s back), then the hold (0.2 s at 2×)
    const field = (title: string) => (within(dialog).getByTitle(title).querySelector('input') as HTMLInputElement).value
    expect([field('Up/down tilt the move starts from; negative tilts down'), field('Up/down tilt this move reaches; negative tilts down')]).toEqual(['30', '0'])
    expect(screen.getByText('1.2 s loop')).toBeDefined()
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
    expect(screen.getByRole('status').textContent).toBe('Preview')
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

  it('opens the demo playing its playlist, and stops and goes back to flat on leaving it', async () => {
    const user = userEvent.setup()
    vi.mocked(createDemoProject).mockImplementationOnce(async () => {
      const note = createNote({ name: 'Playing banknote', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#123456' })
      return { ...createProject('Playing demo'), notes: [{ ...note, tilt: { ...note.tilt, moves: [{ id: 'swing', kind: 'y' }] } }] }
    })
    localStorage.setItem('of-thread-workspace', 'demo-play-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await screen.findByRole('button', { name: 'New project', exact: true })
    await user.click(screen.getByRole('button', { name: 'Demo', exact: true }))
    await screen.findByRole('button', { name: 'Exit demo' })
    expect(useTilt.getState().source).toBe('wobble')
    expect(screen.getByRole('button', { name: 'Pause', exact: true })).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Exit demo' }))
    await screen.findByRole('button', { name: 'New project', exact: true })
    expect(useTilt.getState()).toMatchObject({ source: 'slider', target: 0, targetX: 0 })
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

  it('adds magnetic ink as a layer, places it as the watermark is placed, and sets its colours and bar', async () => {
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
    localStorage.setItem('of-thread-workspace', 'magnetic-ink-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    const placing = () => screen.queryByRole('group', { name: 'Place magnetic ink' })
    const ink = () => useProjects.getState().demoPreview!.notes[0].magneticInk

    // The + lists every layer the banknote doesn't have yet; adding the ink selects it and shows its box to place, the
    // banknote laid flat and the tilt pad stepping aside, as for the watermark
    await user.click(screen.getByRole('button', { name: 'Add layer' }))
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Watermark', 'Magnetic ink'])
    await user.click(screen.getByRole('menuitem', { name: 'Magnetic ink' }))
    expect(ink()).toBeDefined()
    expect(tab()).toBe('Magnetic ink')
    expect(screen.getByRole('button', { name: 'Magnetic ink', exact: true }).classList.contains('bg-muted')).toBe(true)
    expect(placing()).not.toBeNull()
    expect(screen.queryByRole('group', { name: 'Tilt' })).toBeNull()

    // Arrow keys nudge it, Shift ten steps; a corner resizes it from the opposite corner, its proportions kept
    const start = ink()!
    fireEvent.keyDown(placing()!, { key: 'ArrowLeft', shiftKey: true })
    fireEvent.keyDown(placing()!, { key: 'ArrowUp' })
    expect(ink()).toEqual({ ...start, xMm: start.xMm - 5, yMm: start.yMm - 0.5 })
    const corner = screen.getByRole('button', { name: 'Resize magnetic ink from its bottom-right corner' })
    fireEvent.pointerDown(corner, { button: 0, buttons: 1, pointerId: 1, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(corner, { buttons: 1, pointerId: 1, clientX: 340, clientY: 300 })
    fireEvent.pointerUp(corner, { button: 0, pointerId: 1, clientX: 340, clientY: 300 })
    const resized = ink()!
    expect(resized.widthMm).toBeGreaterThan(start.widthMm)
    expect(resized.widthMm % 0.5).toBe(0)
    expect(resized).toEqual({ ...start, xMm: start.xMm - 5, yMm: start.yMm - 0.5, widthMm: resized.widthMm, heightMm: resized.widthMm })

    // Its colour flat and tilted away, and the bar's tilt and width
    const hex = (value: string) => screen.getAllByDisplayValue(value).find((input) => input.getAttribute('type') !== 'color')!
    fireEvent.change(hex('#c9a227'), { target: { value: '#aa0000' } })
    fireEvent.change(hex('#2e8b57'), { target: { value: '#0000aa' } })
    await user.click(screen.getByRole('button', { name: 'Side to side' }))
    fireEvent.change(screen.getByTitle('How wide the bright bar is, as a share of the shape the way it rolls').querySelector('input')!, { target: { value: '50' } })
    expect(ink()).toEqual({ ...resized, color: '#aa0000', tiltedColor: '#0000aa', barAxis: 'x', barWidth: 0.5 })

    // Escape ends placing and keeps it selected
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(placing()).toBeNull()
    expect(tab()).toBe('Magnetic ink')

    // Once it has an image it shows on the banknote, under the thread, and drags there as the watermark does: a press
    // picks it, with its box, and a drag moves it in 0.5 mm steps instead of tilting the banknote
    expect(screen.queryByRole('switch', { name: 'Invert' })).toBeNull()
    const demo = useProjects.getState().demoPreview!
    act(() => updateNote(demo.id, demo.notes[0].id, (n) => ({ ...n, magneticInk: { ...n.magneticInk!, imageId: 'fixture-ink' } })))
    const hit = () => document.querySelector('[data-note-body] [data-magnetic-ink]')!
    expect(hit().compareDocumentPosition(document.querySelector('[data-note-body] [data-thread]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const before = ink()!
    const tilt = () => ({ y: useTilt.getState().target, x: useTilt.getState().targetX })
    const tiltBefore = tilt()
    fireEvent.pointerDown(hit(), { button: 0, buttons: 1, pointerId: 1, clientX: 100, clientY: 100 })
    expect(placing()).not.toBeNull()
    fireEvent.pointerMove(hit(), { buttons: 1, pointerId: 1, clientX: 101, clientY: 101 })
    expect(ink()).toEqual(before)
    fireEvent.pointerMove(hit(), { buttons: 1, pointerId: 1, clientX: 100, clientY: 60 })
    fireEvent.pointerUp(hit(), { button: 0, pointerId: 1, clientX: 100, clientY: 60 })
    const moved = ink()!
    expect(moved.yMm).toBeLessThan(before.yMm)
    expect(moved.yMm % 0.5).toBe(0)
    expect(moved).toEqual({ ...before, yMm: moved.yMm })
    expect(tilt()).toEqual(tiltBefore)
    // A click elsewhere on the banknote ends placing; a click on the ink picks it again without moving it
    fireEvent.pointerDown(document.querySelector('[data-note-body]')!, { button: 0, buttons: 1, pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(document.querySelector('[data-note-body]')!, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    expect(placing()).toBeNull()
    fireEvent.pointerDown(hit(), { button: 0, buttons: 1, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(hit(), { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    expect(placing()).not.toBeNull()
    expect(ink()).toEqual(moved)
    fireEvent.keyDown(window, { key: 'Escape' })

    // Invert puts the ink round the shape instead; switched off, it is left unsaid
    await user.click(screen.getByRole('switch', { name: 'Invert' }))
    expect(ink()).toEqual({ ...moved, invert: true })
    await user.click(screen.getByRole('switch', { name: 'Invert' }))
    expect(ink()).toEqual(moved)
    expect(saves).not.toHaveBeenCalled()
  })

  it('takes the + away once a banknote has every layer, keeps magnetic ink on a copy, and Delete removes it while placing', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'magnetic-ink-remove-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    const notes = () => useProjects.getState().demoPreview!.notes
    await user.click(screen.getByRole('button', { name: 'Add layer' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Magnetic ink' }))
    await user.click(screen.getByRole('button', { name: 'Add layer' }))
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Watermark'])
    await user.click(screen.getByRole('menuitem', { name: 'Watermark' }))
    expect(screen.queryByRole('button', { name: 'Add layer' })).toBeNull()
    // Listed under the thread in the order they draw, as tabs in the same order
    expect(within(screen.getByRole('list', { name: 'Layers of Demo banknote' })).getAllByRole('listitem').map((row) => row.textContent))
      .toEqual(['Security thread', 'Watermark', 'Magnetic ink'])
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Banknote', 'Thread', 'Watermark', 'Magnetic ink'])
    const original = notes()[0].magneticInk

    await user.click(screen.getByRole('button', { name: 'Duplicate', exact: true }))
    await waitFor(() => expect(notes()).toHaveLength(2))
    expect(notes()[1].magneticInk).toEqual(original)

    // On the copy: picking its ink places it, and Delete removes it, leaving the banknote itself selected and the original alone
    await user.click(screen.getByRole('button', { name: 'Magnetic ink', exact: true }))
    expect(tab()).toBe('Magnetic ink')
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(notes()[1].magneticInk).toBeUndefined()
    expect(notes()[0].magneticInk).toEqual(original)
    expect(tab()).toBe('Banknote')
    // The + is back, for the ink alone
    await user.click(screen.getByRole('button', { name: 'Add layer' }))
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Magnetic ink'])
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Undo', exact: true }))
    expect(notes()[1].magneticInk).toEqual(original)
    // The remove button beside the tabs names it
    await user.click(screen.getByRole('button', { name: 'Magnetic ink', exact: true }))
    expect(screen.getAllByRole('button', { name: 'Remove magnetic ink' })).toHaveLength(2)
    expect(saves).not.toHaveBeenCalled()
  })
})
