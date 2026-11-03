// @vitest-environment jsdom
import React from 'react'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { preparePattern } from '../src/lib/pattern'
import { usePatternOffsets } from '../src/lib/patternOffset'
import { ridgePhase, weave } from '../src/lib/print'
import { addNote, updateNote, useProjects } from '../src/lib/store'
import { createNote } from '../src/lib/notes'
import { setTilt, useTilt } from '../src/tilt/tilt'
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
  // The banknote's row shows the banknote itself; Edit thread is on its Security thread layer
  await user.click(screen.getByRole('button', { name: 'Security thread', exact: true }))
  return user
}

/** The panel's Edit thread; the canvas shows another just under the selected thread */
const editThread = () => screen.getAllByRole('button', { name: 'Edit thread', exact: true }).find((button) => !button.closest('[data-edit-thread]'))!

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
/** Mixed-angle presets show only while Mixed angles is on: switch it on first when needed, then pick the preset */
async function preset(user: ReturnType<typeof userEvent.setup>, editor: HTMLElement, label: string) {
  if (!within(editor).queryByRole('button', { name: new RegExp(`^${label}`) })) await user.click(within(editor).getByRole('switch', { name: 'Mixed angles' }))
  await user.click(within(editor).getByRole('button', { name: new RegExp(`^${label}`) }))
}
/** Preview and Checks sit closed at the bottom of the right panel */
async function open(user: ReturnType<typeof userEvent.setup>, editor: HTMLElement, title: 'Preview' | 'Checks') {
  const trigger = within(editor).getByRole('button', { name: title, exact: true })
  if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger)
}

function drag(target: Element, from: { along: number; across: number }, to: { along: number; across: number }) {
  fireEvent.pointerDown(target, { button: 0, buttons: 1, ...at(from.along, from.across) })
  fireEvent.pointerMove(target, { buttons: 1, ...at(to.along, to.across) })
  fireEvent.pointerUp(target, { button: 0, ...at(to.along, to.across) })
}

describe('thread editor', () => {
  it('opens from the panel, applies a preset, and draws, moves, resizes and deletes sections with undo', async () => {
    const user = await openDemo('thread-editor-ui-test')
    await user.click(editThread())
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    // The canvas panels make way for it
    expect(screen.queryByRole('button', { name: 'Export', exact: true })).toBeNull()
    expect(within(editor).getByText('Demo banknote')).toBeDefined()
    expect(strip().element.querySelectorAll('[data-repeat-edge]')).toHaveLength(2)

    await preset(user, editor, 'Split band')
    expect(sections().map((s) => s.name)).toEqual(['Lane ↔', 'Lane ↕'])
    expect(note().pattern!.mixed).toBe(true)
    expect(within(editor).getByRole('switch', { name: 'Mixed angles' }).getAttribute('aria-checked')).toBe('true')

    // Select a lane in the list and delete it
    await user.click(within(editor).getByRole('button', { name: 'Lane ↕', exact: true }))
    expect((screen.getByTitle("Left edge, from the thread's left edge").querySelector('input')!).value).toBe('2')
    // The unit sits once on the Area title, leaving the narrow fields room for their values
    expect(screen.getByTitle("Left edge, from the thread's left edge").textContent).toBe('Left')
    expect(within(editor).getByRole('heading', { name: 'Area' }).parentElement!.textContent).toBe('Areamm')
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

    // Back on the canvas, the banknote's thread is still selected, with Edit thread to go back in, in the panel and under the thread
    expect(screen.getByRole('button', { name: 'Export', exact: true })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Security thread', exact: true })).toBeDefined()
    expect(screen.getAllByRole('button', { name: 'Edit thread', exact: true })).toHaveLength(2)
    await user.click(within(document.querySelector<HTMLElement>('[data-edit-thread]')!).getByRole('button', { name: 'Edit thread' }))
    expect(screen.getByRole('region', { name: 'Thread editor' })).toBeDefined()
    // Nothing of the canvas's under it
    expect(document.querySelector('[data-edit-thread]')).toBeNull()
  })

  it('adds, duplicates and renames sections, and edits each section’s lens only while angles are mixed', async () => {
    const user = await openDemo('thread-sections-ui-test')
    // A double-click on the thread opens the editor too
    fireEvent.doubleClick(document.querySelector('[data-thread]')!)
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    const tilt = note().tilt

    // The new half is named after the section it was cut from
    await user.click(within(editor).getByRole('button', { name: 'Add section', exact: true }))
    expect(sections().map((s) => s.name)).toEqual(['Whole thread', 'Whole thread 2'])
    const row = (name: string) => within(within(editor).getByRole('button', { name, exact: true }).closest('li')!)
    await user.click(row('Whole thread 2').getByRole('button', { name: 'Duplicate', exact: true }))
    expect(sections().map((s) => s.name)).toEqual(['Whole thread', 'Whole thread 2', 'Whole thread 2 copy'])
    await user.dblClick(within(editor).getByRole('button', { name: 'Whole thread 2 copy', exact: true }))
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
    // Picking a frame closes the menu
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(within(editor).getByRole('button', { name: 'Strip 1: frame 2', exact: true }).getAttribute('aria-expanded')).not.toBe('true')

    // Now it rests on another frame than the rest: the check says so, and a click on it selects the section
    await open(user, editor, 'Checks')
    await user.click(within(editor).getByRole('button', { name: 'Whole thread', exact: true }))
    expect(within(editor).getByRole('heading', { name: 'Whole thread' })).toBeDefined()
    await user.click(within(editor).getByRole('button', { name: 'Corner rests on 2, the others on 1', exact: true }))
    expect(within(editor).getByRole('heading', { name: 'Corner' })).toBeDefined()
    await user.click(within(editor).getByRole('button', { name: 'Every frame in order', exact: true }))
    expect(sections()[2].track).toBeUndefined()
    expect(within(editor).queryByRole('button', { name: 'Corner rests on 2, the others on 1', exact: true })).toBeNull()
  })

  it('selects the next section after a delete, else the one before', async () => {
    const user = await openDemo('thread-delete-select-ui-test')
    await user.click(editThread())
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    await preset(user, editor, 'Split band')
    // Splitting the first lane puts the new half straight after it, named after it and selected
    await user.click(within(editor).getByRole('button', { name: 'Add section', exact: true }))
    expect(sections().map((s) => s.name)).toEqual(['Lane ↔', 'Lane ↔ 2', 'Lane ↕'])
    expect(within(editor).getByRole('heading', { name: 'Lane ↔ 2' })).toBeDefined()

    // Delete selects the next section in the list; the thread under the pointer is empty now, ready to draw on
    const third = sections()[1].id
    fireEvent.pointerEnter(strip().element.querySelector(`[data-section-id="${third}"][data-copy="0"]`)!)
    expect(strip().element.className).toContain('cursor-move')
    await user.keyboard('{Delete}')
    expect(strip().element.className).toContain('cursor-crosshair')
    expect(sections().map((s) => s.name)).toEqual(['Lane ↔', 'Lane ↕'])
    expect(within(editor).getByRole('heading', { name: 'Lane ↕' })).toBeDefined()
    // The last one has no next: the one before it is selected
    const row = within(within(editor).getByRole('button', { name: 'Lane ↕', exact: true }).closest('li')!)
    await user.click(row.getByRole('button', { name: 'Delete', exact: true }))
    expect(sections().map((s) => s.name)).toEqual(['Lane ↔'])
    expect(within(editor).getByRole('heading', { name: 'Lane ↔' })).toBeDefined()
  })

  it('fills the gap a deleted section leaves, from the No gaps check or with a double-click on it', async () => {
    const user = await openDemo('thread-fill-gaps-ui-test')
    await user.click(editThread())
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    await preset(user, editor, 'Split band')
    const [side, updown] = sections()
    // The ↔ lane split in two, and its new half deleted
    await user.click(within(editor).getByRole('button', { name: 'Lane ↔', exact: true }))
    await user.click(within(editor).getByRole('button', { name: 'Add section', exact: true }))
    await user.keyboard('{Delete}')
    await open(user, editor, 'Checks')
    const gaps = () => editor.querySelector('[data-check="gaps"]')!
    expect(gaps().textContent).toContain('25% of each repeat is empty')

    // Fill: the gap sits in line with the ↔ lane, so that lane runs on over it, as before, selected; no new section
    await user.click(within(gaps() as HTMLElement).getByRole('button', { name: 'Fill', exact: true }))
    expect(sections()).toEqual([side, updown])
    expect(within(editor).getByRole('heading', { name: 'Lane ↔' })).toBeDefined()
    expect(gaps().textContent).not.toContain('empty')
    expect(within(gaps() as HTMLElement).queryByRole('button', { name: 'Fill', exact: true })).toBeNull()

    // One undo takes the whole fill back; a double-click in the gap fills it too, in whichever repeat it's clicked
    await user.click(within(editor).getByRole('button', { name: 'Undo', exact: true }))
    expect(sections().map((s) => [s.name, s.endMm])).toEqual([['Lane ↔', 2], ['Lane ↕', 4]])
    fireEvent.doubleClick(strip().element, at(7, 0.2))
    expect(sections()).toEqual([side, updown])

    // A whole lane deleted. A section drawn beside the other lane takes its look and its name
    await user.click(within(editor).getByRole('button', { name: 'Lane ↕', exact: true }))
    await user.keyboard('{Delete}')
    drag(strip().element, { along: 0.6, across: 0.52 }, { along: 2.9, across: 0.95 })
    expect(sections()[1]).toMatchObject({ name: 'Lane ↔ 2', startMm: 0.5, endMm: 3, acrossStart: 0.5, lens: side.lens })
    expect(sections()[1].track).toEqual(side.track)
    expect(within(editor).getByRole('heading', { name: 'Lane ↔ 2' })).toBeDefined()
    // Undone, a double-click fills the gap instead: the lane grows across the thread
    await user.click(within(editor).getByRole('button', { name: 'Undo', exact: true }))
    fireEvent.doubleClick(strip().element, at(5, 0.8))
    expect(sections()).toEqual([{ ...side, acrossEnd: 1 }])
    expect(within(editor).getByRole('heading', { name: 'Lane ↔' })).toBeDefined()
    // On a section, a double-click adds nothing
    fireEvent.doubleClick(strip().element.querySelector(`[data-section-id="${side.id}"][data-copy="0"]`)!, at(1, 0.2))
    expect(sections()).toHaveLength(1)
  })

  it('keeps a lens in the panel with nothing selected: the shared one, or with mixed angles the whole print', async () => {
    const user = await openDemo('thread-deselect-ui-test')
    await user.click(editThread())
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    await user.keyboard('{Escape}')
    expect(within(editor).queryByRole('heading', { name: 'Whole thread' })).toBeNull()
    expect(within(editor).getByText('Shared')).toBeDefined()
    await open(user, editor, 'Preview')
    expect(within(editor).getByRole('button', { name: 'Tilt map' })).toBeDefined()

    // Mixed angles: no one lens to show, so the print of every section together
    await preset(user, editor, 'Split band')
    await user.keyboard('{Escape}')
    expect(within(editor).queryByRole('heading', { name: 'Lane ↔' })).toBeNull()
    expect(within(editor).getByText('Mixed')).toBeDefined()
    expect(within(editor).getByRole('img', { name: 'Print' }).querySelector('canvas')).not.toBeNull()
    expect(within(editor).queryByRole('button', { name: 'Tilt map' })).toBeNull()
    expect(within(editor).getByTitle('Ridges drawn across the thread, magnified: real ones are far finer')).toBeDefined()

    // Selecting a section brings its own lens back
    await user.click(within(editor).getByRole('button', { name: 'Lane ↕', exact: true }))
    expect(within(editor).getByRole('button', { name: 'Tilt map' })).toBeDefined()
    expect(within(editor).queryByText('Mixed')).toBeNull()
    expect(within(editor).queryByRole('img', { name: 'Print' })).toBeNull()
  })

  it('previews where the print lands: an offset to type or shuffle, and the windows that miss a tilt there', async () => {
    const user = await openDemo('thread-offset-ui-test')
    const offsetTitle = 'Where the print lands along the thread: a preview, not saved in the project'
    // One section over the whole thread looks the same wherever it lands: no offset to set
    expect(screen.queryByTitle(offsetTitle)).toBeNull()
    await user.click(editThread())
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    await preset(user, editor, 'Alternating')
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

  it('undoes only this banknote’s steps, by button and keyboard, while the canvas still undoes the rest', async () => {
    const user = await openDemo('thread-undo-ui-test')
    const project = () => useProjects.getState().demoPreview!
    // Another banknote, then a rename of it: steps the thread editor of the first must never take back
    act(() => addNote(project().id, createNote({ name: 'Other', x: 200, y: 0, widthMm: 150, heightMm: 70, color: '#654321' })))
    const other = project().notes[1].id
    act(() => updateNote(project().id, other, (n) => ({ ...n, name: 'Other renamed' })))
    await user.click(editThread())
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    const undo = () => within(editor).getByRole('button', { name: 'Undo', exact: true }) as HTMLButtonElement
    const redo = () => within(editor).getByRole('button', { name: 'Redo', exact: true }) as HTMLButtonElement
    expect(undo().disabled).toBe(true)

    await preset(user, editor, 'Split band')
    expect(sections()).toHaveLength(2)
    expect(undo().disabled).toBe(false)
    await user.keyboard('{Meta>}z{/Meta}')
    expect(sections()).toHaveLength(1)
    // Switching Mixed angles on was a step of its own
    expect(note().pattern!.mixed).toBe(true)
    await user.keyboard('{Meta>}z{/Meta}')
    expect(note().pattern?.mixed ?? false).toBe(false)
    expect(undo().disabled).toBe(true)
    // Nothing more of this banknote's to undo: ⌘Z leaves the other banknote alone
    await user.keyboard('{Meta>}z{/Meta}')
    expect(project().notes[1].name).toBe('Other renamed')
    expect(redo().disabled).toBe(false)
    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    expect(note().pattern!.mixed).toBe(true)
    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    expect(sections()).toHaveLength(2)
    await user.click(undo())
    expect(sections()).toHaveLength(1)
    await user.keyboard('{Control>}y{/Control}')
    expect(sections()).toHaveLength(2)

    // Back on the canvas, undo covers the whole project again, one step at a time
    await user.click(within(editor).getByRole('button', { name: 'Back to the canvas', exact: true }))
    await user.keyboard('{Meta>}z{/Meta}')
    expect(sections()).toHaveLength(1)
    await user.keyboard('{Meta>}z{/Meta}')
    expect(project().notes[1].name).toBe('Other renamed')
    await user.keyboard('{Meta>}z{/Meta}')
    expect(project().notes[1].name).toBe('Other')
  })

  it('applies each preset, and the magnified thread follows the tilt section by section', async () => {
    const user = await openDemo('thread-presets-ui-test')
    await user.click(editThread())
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    const presets: [string, string[]][] = [
      ['Split band', ['Lane ↔', 'Lane ↕']],
      ['Alternating', ['Block ↕', 'Block ↔']],
      ['Chevron lock', ['Arm /', 'Arm \\']],
      ['Single lens', ['Whole thread']],
    ]
    // Without Mixed angles only the presets that need none are offered
    expect(within(editor).getAllByRole('button', { name: /^(Single lens|Split band|Alternating|Chevron lock)/ }).map((b) => b.textContent)).toEqual(['Single lens'])
    for (const [label, names] of presets) {
      await preset(user, editor, label)
      expect(sections().map((s) => s.name)).toEqual(names)
      // A preset never switches Mixed angles off
      expect(note().pattern!.mixed).toBe(true)
      // The first section is selected, and each section is outlined in each of the three repeats shown
      expect(within(editor).getByRole('heading', { name: names[0] })).toBeDefined()
      expect(strip().element.querySelectorAll('[data-section-id]')).toHaveLength(3 * names.length)
    }

    // Each preset's picture keeps its own size inside its button, which would otherwise shrink an svg to an icon,
    // and still fits the panel's two columns: tall on a vertical thread, wide on a horizontal one
    const picture = () => within(editor).getByRole('button', { name: /^Split band/ }).querySelector('svg')!
    expect([picture().style.width, picture().style.height]).toEqual(['40px', '52px'])
    act(() => updateNote(useProjects.getState().demoPreview!.id, note().id, (n) => ({ ...n, thread: { ...n.thread, direction: 'horizontal' } })))
    expect([picture().style.width, picture().style.height]).toEqual(['84px', '32px'])
    act(() => updateNote(useProjects.getState().demoPreview!.id, note().id, (n) => ({ ...n, thread: { ...n.thread, direction: 'vertical' } })))

    // Split band: tilting up or down changes only the ↕ lane, tilting sideways only the ↔ lane
    await preset(user, editor, 'Split band')
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

  it('draws every section\'s ridges the way the print cuts them', async () => {
    const user = await openDemo('thread-ridges-ui-test')
    await user.click(editThread())
    const editor = screen.getByRole('region', { name: 'Thread editor' })
    await preset(user, editor, 'Chevron lock')
    await user.click(within(editor).getByRole('button', { name: 'Ridges', exact: true }))
    // A hatch's lines run at its rotation, which SVG turns clockwise (y down, as on the print)
    const runs = (hatch: Element) => {
      const turn = (Number(/rotate\((-?[\d.]+)\)/.exec(hatch.getAttribute('patternTransform')!)![1]) * Math.PI) / 180
      return { x: Math.cos(turn), y: Math.sin(turn) }
    }
    const onThread = [...strip().element.querySelectorAll('pattern')]
    const inList = sections().map((s) => within(editor).getByRole('button', { name: s.name, exact: true }).querySelector('pattern')!)
    const inPreset = [...within(editor).getByRole('button', { name: /^Chevron lock/ }).querySelectorAll('pattern')]
    preparePattern(note()).sections.forEach((p, i) => {
      const w = weave(p.lens, note().frames, 0.4)
      for (const d of [onThread[i], inList[i], inPreset[i]].map(runs)) {
        for (let t = 0.2; t < 2; t += 0.3) expect(ridgePhase(w, 1 + t * d.x, 4 + t * d.y)).toBeCloseTo(ridgePhase(w, 1, 4), 9)
      }
    })
    // Arm / rises to the right, and the lens panel says so
    const arm = runs(onThread[0])
    expect(arm.x * arm.y).toBeLessThan(0)
    await open(user, editor, 'Preview')
    expect(within(editor).getByText('Lens angle').nextElementSibling!.textContent).toBe('45° /')
  })

  it('tilts the thread by dragging with Tilt on, turns it in perspective unless switched off, and turns the thread from the panel', async () => {
    const user = await openDemo('thread-view-ui-test')
    await user.click(editThread())
    const editor = screen.getByRole('region', { name: 'Thread editor' })

    // With Tilt on, a drag on the thread tilts it instead of drawing
    await user.click(within(editor).getByRole('button', { name: 'Tilt', exact: true }))
    const element = strip().element
    fireEvent.pointerDown(element, { button: 0, buttons: 1, clientX: 10, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(element, { buttons: 1, clientX: 10, clientY: 20, pointerId: 1 })
    expect(useTilt.getState().target).toBe(15)
    fireEvent.pointerUp(element, { button: 0, clientX: 10, clientY: 20, pointerId: 1 })
    expect(sections()).toHaveLength(1)

    // Tilted, the thread turns with it, unless Perspective is off
    act(() => setTilt({ source: 'drag', angle: 20, target: 20, angleX: 0, targetX: 0 }))
    expect(strip().element.style.transform).toBe('rotateX(20deg) rotateY(0deg)')
    await user.click(within(editor).getByRole('button', { name: 'Perspective', exact: true }))
    expect(strip().element.style.transform).toBe('')

    // The thread can be turned from the editor
    await user.click(within(editor).getByRole('button', { name: 'Horizontal', exact: true }))
    expect(note().thread.direction).toBe('horizontal')
  })
})
