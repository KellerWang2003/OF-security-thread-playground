// @vitest-environment jsdom
import React from 'react'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { usePatternOffsets } from '../src/lib/patternOffset'
import { useProjects } from '../src/lib/store'
import { setTilt } from '../src/tilt/tilt'
import { TooltipProvider } from '../src/components/ui/tooltip'
import type { Note } from '../src/lib/types'

vi.mock('../src/cloud/client', () => ({ cloudConfigured: true }))
vi.mock('../src/cloud/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/cloud/repository')>()
  const { createProject, createNote } = await import('../src/lib/notes')
  return { ...actual, createRepository: () => ({
    list: async () => [],
    save: async (record: import('../src/cloud/sync').CachedProject) => ({ project: record.project, revision: record.revision, deleted: record.deleted }),
    demo: async () => ({ ...createProject('Demo fixture'), notes: [createNote({ name: 'Demo banknote', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#123456' })] }),
  }) }
})
beforeEach(() => {
  // Every observed element measures 1280 × 720, so the magnified thread has room for three repeats
  vi.stubGlobal('ResizeObserver', class {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) { this.callback = callback }
    observe() { this.callback([{ contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
    unobserve() {} disconnect() {}
  })
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: vi.fn(() => true) })
  }
  localStorage.clear()
  location.hash = ''
  setTilt({ source: 'drag', angle: 0, target: 0, angleX: 0, targetX: 0 })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const note = (): Note => useProjects.getState().demoPreview!.notes[0]
const sections = () => note().pattern!.sections

async function openDemo(workspace: string) {
  const user = userEvent.setup()
  localStorage.setItem('of-thread-workspace', workspace)
  render(<TooltipProvider><App /></TooltipProvider>)
  await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
  await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
  return user
}

/** The magnified thread, and its scale: the demo thread is 4 mm wide, and the strip's coordinates are client coordinates (jsdom lays nothing out) */
function strip() {
  const element = document.querySelector<HTMLElement>('[data-pattern-view]')!
  const thickness = parseFloat(element.style.width)
  return { element, thickness, scale: thickness / 4 }
}
const at = (along: number, across: number) => {
  const { thickness, scale } = strip()
  return { clientX: across * thickness, clientY: along * scale, pointerId: 1 }
}
function drag(target: Element, from: { along: number; across: number }, to: { along: number; across: number }) {
  fireEvent.pointerDown(target, { button: 0, buttons: 1, ...at(from.along, from.across) })
  fireEvent.pointerMove(target, { buttons: 1, ...at(to.along, to.across) })
  fireEvent.pointerUp(target, { button: 0, ...at(to.along, to.across) })
}

describe('thread editor', () => {
  it('opens from the panel, applies a preset, and draws, moves, resizes and deletes sections with undo', async () => {
    const user = await openDemo('thread-editor-ui-test')
    await user.click(screen.getByRole('button', { name: 'Edit thread', exact: true }))
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    // The canvas panels make way for it
    expect(screen.queryByRole('button', { name: 'Export', exact: true })).toBeNull()
    expect(within(editor).getByText('Demo banknote')).toBeDefined()
    expect(strip().element.querySelectorAll('[data-repeat-edge]')).toHaveLength(2)

    await user.click(within(editor).getByRole('button', { name: /^Split band/ }))
    expect(sections().map((s) => s.name)).toEqual(['Lane ↔', 'Lane ↕'])
    expect(note().pattern!.mixed).toBe(true)
    expect(within(editor).getByRole('switch', { name: 'Mixed angles' }).getAttribute('aria-checked')).toBe('true')

    // Select a lane in the list and delete it
    await user.click(within(editor).getByRole('button', { name: 'Lane ↕', exact: true }))
    expect((screen.getByTitle("Left edge, from the thread's left edge").querySelector('input')!).value).toBe('2')
    await user.keyboard('{Delete}')
    expect(sections().map((s) => s.name)).toEqual(['Lane ↔'])

    // Draw in the empty half, snapped to 0.5 mm along and twelfths across; the new section is selected
    drag(strip().element, { along: 0.6, across: 0.76 }, { along: 2.9, across: 0.95 })
    expect(sections()).toHaveLength(2)
    const drawn = sections()[1]
    expect(drawn).toMatchObject({ name: 'Section 2', startMm: 0.5, endMm: 3, acrossStart: 0.75 })
    expect(drawn.acrossEnd).toBeCloseTo(11 / 12, 9)
    expect(screen.getByTitle('Where the section starts, from the start of the repeat').querySelector('input')!.value).toBe('0.5')

    // Move it 1 mm along, until it meets the end of the repeat
    const body = () => strip().element.querySelector(`[data-section-id="${drawn.id}"][data-copy="0"]`)!
    drag(body(), { along: 1.5, across: 0.85 }, { along: 2.6, across: 0.85 })
    expect(sections()[1]).toMatchObject({ startMm: 1.5, endMm: 4 })

    // Resize its near edge towards the lane: it stops where the lane ends
    drag(body().querySelector('[data-edge="acrossStart"]')!, { along: 2, across: 0.75 }, { along: 2, across: 0.3 })
    expect(sections()[1].acrossStart).toBe(0.5)
    await user.click(within(editor).getByRole('button', { name: 'Undo', exact: true }))
    expect(sections()[1].acrossStart).toBe(0.75)
    await user.click(within(editor).getByRole('button', { name: 'Redo', exact: true }))
    expect(sections()[1].acrossStart).toBe(0.5)

    // A click on empty thread deselects; Escape deselects, then leaves
    fireEvent.pointerDown(strip().element, { button: 0, buttons: 1, ...at(0.5, 0.75) })
    fireEvent.pointerUp(strip().element, { button: 0, ...at(0.5, 0.75) })
    expect(screen.queryByTitle('Where the section starts, from the start of the repeat')).toBeNull()
    await user.click(within(editor).getByRole('button', { name: 'Section 2', exact: true }))
    expect(screen.getByTitle('Where the section starts, from the start of the repeat')).toBeDefined()
    await user.keyboard('{Escape}')
    expect(screen.queryByTitle('Where the section starts, from the start of the repeat')).toBeNull()
    expect(screen.getByRole('region', { name: 'Thread editor' })).toBeDefined()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Thread editor' })).toBeNull()

    // Back on the canvas, the banknote is still selected and the panel sums the thread up
    expect(screen.getByRole('button', { name: 'Export', exact: true })).toBeDefined()
    expect(screen.getByText('Mixed angles')).toBeDefined()
    expect(screen.getByText(/^2 sections/)).toBeDefined()
  })

  it('adds, duplicates and renames sections, and edits each section’s lens only while angles are mixed', async () => {
    const user = await openDemo('thread-sections-ui-test')
    // A double-click on the thread opens the editor too
    fireEvent.doubleClick(document.querySelector('[data-thread]')!)
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    const tilt = note().tilt

    await user.click(within(editor).getByRole('button', { name: 'Add section', exact: true }))
    expect(sections().map((s) => s.name)).toEqual(['Whole thread', 'Section 2'])
    const row = (name: string) => within(within(editor).getByRole('button', { name, exact: true }).closest('li')!)
    await user.click(row('Section 2').getByRole('button', { name: 'Duplicate', exact: true }))
    expect(sections().map((s) => s.name)).toEqual(['Whole thread', 'Section 2', 'Section 2 copy'])
    await user.dblClick(within(editor).getByRole('button', { name: 'Section 2 copy', exact: true }))
    const name = within(editor).getByRole('textbox', { name: 'Section name' })
    await user.clear(name)
    await user.type(name, 'Corner{Enter}')
    expect(sections()[2].name).toBe('Corner')

    // Angles not mixed: the lens is the banknote's, whichever section is selected
    expect(within(editor).getByText('Shared')).toBeDefined()
    const cycle = () => screen.getByText('Cycle', { exact: true }).closest('div')!.querySelector('input')!
    fireEvent.change(cycle(), { target: { value: '40' } })
    expect(note().tilt.cycleDeg).toBe(40)
    expect(sections().every((s) => !s.lens)).toBe(true)

    // Mixed: the change lands on the selected section only
    await user.click(within(editor).getByRole('switch', { name: 'Mixed angles' }))
    expect(note().pattern!.mixed).toBe(true)
    expect(within(editor).queryByText('Shared')).toBeNull()
    fireEvent.change(cycle(), { target: { value: '18' } })
    expect(note().tilt).toEqual({ ...tilt, cycleDeg: 40 })
    expect(sections().map((s) => s.lens?.cycleDeg)).toEqual([undefined, undefined, 18])

    // Its strips can show other frames: the track keeps frame ids
    await user.click(within(editor).getByRole('button', { name: 'Strip 1: frame 1', exact: true }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Frame 2' }))
    expect(sections()[2].track).toEqual([note().frames[1].id, note().frames[1].id])

    // Now it rests on another frame than the rest: the check says so, and a click on it selects the section
    await user.click(within(editor).getByRole('button', { name: 'Whole thread', exact: true }))
    expect(within(editor).getByRole('heading', { name: 'Whole thread' })).toBeDefined()
    await user.click(within(editor).getByRole('button', { name: 'Corner rests on 2, the others on 1', exact: true }))
    expect(within(editor).getByRole('heading', { name: 'Corner' })).toBeDefined()
    await user.click(within(editor).getByRole('button', { name: 'Every frame in order', exact: true }))
    expect(sections()[2].track).toBeUndefined()
    expect(within(editor).queryByRole('button', { name: 'Corner rests on 2, the others on 1', exact: true })).toBeNull()
  })

  it('previews where the print lands: an offset to type or shuffle, and the windows that miss a tilt there', async () => {
    const user = await openDemo('thread-offset-ui-test')
    const offsetTitle = 'Where the print lands along the thread: a preview, not saved in the project'
    // One section over the whole thread looks the same wherever it lands: no offset to set
    expect(screen.queryByTitle(offsetTitle)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Edit thread', exact: true }))
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    await user.click(within(editor).getByRole('button', { name: /^Alternating/ }))
    // A repeat longer than the 8 mm windows, so a window can sit inside one block
    const repeat = screen.getByTitle('Length of one repeat of the pattern along the thread').querySelector('input')!
    fireEvent.change(repeat, { target: { value: '20' } })
    fireEvent.blur(repeat)
    expect(note().pattern!.sections.map((s) => [s.startMm, s.endMm])).toEqual([[0, 10], [10, 20]])
    await user.click(within(editor).getByRole('button', { name: 'Back to the canvas', exact: true }))

    const offset = () => screen.getByTitle(offsetTitle).querySelector('input')!
    expect(offset().value).toBe('0')
    // Landing at 0, the first window (0 to 8 mm) sits inside the up/down block; a click selects it
    await user.click(screen.getByRole('button', { name: 'Window 1 misses ↔', exact: true }))
    expect(screen.getByRole('group', { name: 'Edit thread windows' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Window 1', exact: true }).getAttribute('aria-pressed')).toBe('true')

    // Landing 6 mm on, it holds the side-to-side block's start too
    fireEvent.change(offset(), { target: { value: '6' } })
    fireEvent.blur(offset())
    expect(usePatternOffsets.getState().offsets[note().id]).toBe(6)
    expect(screen.queryByRole('button', { name: 'Window 1 misses ↔', exact: true })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Shuffle the offset', exact: true }))
    const shuffled = usePatternOffsets.getState().offsets[note().id]
    expect(shuffled).not.toBe(6)
    expect(shuffled).toBeGreaterThanOrEqual(0)
    expect(shuffled).toBeLessThan(20)
    expect(Number(offset().value)).toBe(shuffled)
    // A preview only: the project never holds it
    expect(Object.keys(note().pattern!).toSorted()).toEqual(['mixed', 'repeatMm', 'sections'])
    expect(JSON.parse(localStorage.getItem('of-playground.pattern-offsets')!)[note().id]).toBe(shuffled)
  })

  it('applies each preset, and the magnified thread follows the tilt section by section', async () => {
    const user = await openDemo('thread-presets-ui-test')
    await user.click(screen.getByRole('button', { name: 'Edit thread', exact: true }))
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    const presets: [string, string[]][] = [
      ['Split band', ['Lane ↔', 'Lane ↕']],
      ['Alternating', ['Block ↕', 'Block ↔']],
      ['Chevron lock', ['Arm /', 'Arm \\']],
      ['Single lens', ['Whole thread']],
    ]
    for (const [label, names] of presets) {
      await user.click(within(editor).getByRole('button', { name: new RegExp(`^${label}`) }))
      expect(sections().map((s) => s.name)).toEqual(names)
      expect(note().pattern!.mixed).toBe(label !== 'Single lens')
      // The first section is selected, and each section is outlined in each of the three repeats shown
      expect(within(editor).getByRole('heading', { name: names[0] })).toBeDefined()
      expect(strip().element.querySelectorAll('[data-section-id]')).toHaveLength(3 * names.length)
    }

    // Split band: tilting up or down changes only the ↕ lane, tilting sideways only the ↔ lane
    await user.click(within(editor).getByRole('button', { name: /^Split band/ }))
    const colour = (i: number) => strip().element.querySelector<HTMLElement>(`[data-section="${i}"] > div`)!.style.backgroundColor
    act(() => setTilt({ source: 'drag', angle: 0, target: 0, angleX: 0, targetX: 0 }))
    const flat = [colour(0), colour(1)]
    act(() => setTilt({ source: 'drag', angle: 20, target: 20, angleX: 0, targetX: 0 }))
    expect(colour(0)).toBe(flat[0])
    expect(colour(1)).not.toBe(flat[1])
    act(() => setTilt({ source: 'drag', angle: 0, target: 0, angleX: 20, targetX: 20 }))
    expect(colour(0)).not.toBe(flat[0])
    expect(colour(1)).toBe(flat[1])

    // Clicking a section on the thread lets go of a field being typed in, so Delete removes the section
    const repeat = screen.getByTitle('Length of one repeat of the pattern along the thread').querySelector('input')!
    act(() => repeat.focus())
    const lane = strip().element.querySelector(`[data-section-id="${sections()[1].id}"][data-copy="1"]`)!
    fireEvent.pointerDown(lane, { button: 0, buttons: 1, ...at(5, 0.75) })
    fireEvent.pointerUp(lane, { button: 0, ...at(5, 0.75) })
    expect(document.activeElement).not.toBe(repeat)
    expect(within(editor).getByRole('heading', { name: 'Lane ↕' })).toBeDefined()
    await user.keyboard('{Delete}')
    expect(sections().map((s) => s.name)).toEqual(['Lane ↔'])
  })
})
