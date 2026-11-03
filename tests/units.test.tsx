// @vitest-environment jsdom
import React from 'react'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { TooltipProvider } from '../src/components/ui/tooltip'
import { createNote } from '../src/lib/notes'
import { useHistory } from '../src/lib/history'
import { checkPattern } from '../src/lib/patternRules'
import { updateNote, useProjects } from '../src/lib/store'
import {
  formatLength, lengthField, lengthIn, parseLength, setLengthUnit, stepIn, toMm, useLengthUnit, type LengthUnit,
} from '../src/lib/units'
import { fitWatermark, moveWatermark, newWatermark } from '../src/lib/watermark'

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
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  localStorage.clear()
  location.hash = ''
  setLengthUnit('mm')
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('length units', () => {
  it('reads a length in each unit to its decimals', () => {
    // A US dollar is 156.1 × 66.3 mm, a thread 4 mm thick
    const read = (unit: LengthUnit) => `${lengthIn(156.1, unit)} × ${lengthIn(66.3, unit)} · ${formatLength(4, unit)}`
    expect(read('mm')).toBe('156.1 × 66.3 · 4 mm')
    expect(read('cm')).toBe('15.61 × 6.63 · 0.4 cm')
    expect(read('in')).toBe('6.146 × 2.61 · 0.157 in')
    expect(read('pt')).toBe('442.5 × 187.9 · 11.3 pt')
  })

  it('keeps a typed length exactly, without float dust', () => {
    expect(toMm(6.14, 'in')).toBe(155.956)
    expect(toMm(15.61, 'cm')).toBe(156.1)
    expect(toMm(72, 'pt')).toBe(25.4)
    expect(toMm(85.3, 'mm')).toBe(85.3)
  })

  it('reads a unit typed after the number, converted to the field’s', () => {
    expect(parseLength('15cm', 'mm')).toBe(150)
    expect(parseLength(' 6.14 in ', 'mm')).toBeCloseTo(155.956, 9)
    expect(parseLength('6.14"', 'in')).toBe(6.14)
    expect(parseLength('6.14″', 'in')).toBe(6.14)
    expect(parseLength('442pt', 'in')).toBeCloseTo(6.1389, 4)
    expect(parseLength('15,6 CM', 'cm')).toBe(15.6)
    expect(parseLength('.5', 'mm')).toBe(0.5)
    expect(parseLength('12', 'pt')).toBe(12)
    for (const text of ['', ' ', 'abc', '1.2.3', '12 px', 'in', '12 in 3']) expect(parseLength(text, 'mm')).toBeUndefined()
  })

  it('steps a round number of each unit, never coarser than the step in mm', () => {
    const steps = (mm: number) => (['mm', 'cm', 'in', 'pt'] as const).map((unit) => stepIn(mm, unit))
    expect(steps(0.5)).toEqual([0.5, 0.05, 0.01, 1])
    expect(steps(0.1)).toEqual([0.1, 0.01, 0.002, 0.2])
    expect(steps(1)).toEqual([1, 0.1, 0.02, 2])
  })

  it('accepts the number shown at a limit, and keeps what it gives within the limits', () => {
    // A banknote's 20 to 250 mm reads 0.787 to 9.843 in
    const field = lengthField('in', { value: 150, min: 20, max: 250, step: 0.5 })
    expect(field.format(field.min)).toBe('0.787')
    expect(field.format(field.max)).toBe('9.843')
    expect(9.843).toBeLessThanOrEqual(field.max)
    expect(field.toMm(9.843)).toBe(250)
    expect(field.toMm(0.787)).toBe(20)
    expect(field.format(field.value)).toBe('5.906')
    expect(field.step).toBe(0.01)
    // A section's width keeps its twelfths of the thread
    expect(lengthField('in', { value: 2, min: 1 / 3, max: 4, step: 4 / 12, exactStep: true }).step).toBeCloseTo(4 / 12 / 25.4, 12)
  })

  it('remembers the unit in this browser, and starts on mm', async () => {
    setLengthUnit('pt')
    expect(localStorage.getItem('of-playground.length-unit')).toBe('pt')
    vi.resetModules()
    expect((await import('../src/lib/units')).useLengthUnit.getState().unit).toBe('pt')
    localStorage.setItem('of-playground.length-unit', 'furlong')
    vi.resetModules()
    expect((await import('../src/lib/units')).useLengthUnit.getState().unit).toBe('mm')
    localStorage.clear()
    vi.resetModules()
    expect((await import('../src/lib/units')).useLengthUnit.getState().unit).toBe('mm')
  })

  it('words the Checks in the unit picked', () => {
    const note = createNote({ name: 'Check', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#ffffff' })
    const explain = (unit: LengthUnit) => checkPattern(note, unit).find((c) => c.id === 'size')!.explain
    expect(explain('mm')).toBe('Each section at least 1 mm along and 1 mm across, less 0.2 mm where two ridge angles meet.')
    expect(explain('in')).toBe('Each section at least 0.039 in along and 0.039 in across, less 0.008 in where two ridge angles meet.')
    act(() => setLengthUnit('cm'))
    expect(checkPattern(note).find((c) => c.id === 'size')!.explain).toContain('0.1 cm along')
  })

  it('keeps a typed watermark position exactly, while moves still snap to 0.5 mm', () => {
    const note = { widthMm: 150, heightMm: 70 }
    const watermark = { ...newWatermark(note), xMm: 12.7 }
    expect(fitWatermark(watermark, note).xMm).toBe(12.7)
    expect(moveWatermark(watermark, 1, 0, note).xMm).toBe(13.5)
  })
})

describe('the unit menu', () => {
  it('switches every length to the unit picked in any length field, and reads and steps typed lengths in it', async () => {
    // A canvas with room, so the banknote and its label are drawn
    vi.stubGlobal('ResizeObserver', class {
      callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) { this.callback = callback }
      observe() { this.callback([{ contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
      unobserve() {} disconnect() {}
    })
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'units-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    const note = () => useProjects.getState().demoPreview!.notes[0]
    const field = (label: string) => screen.getByText(label, { exact: true }).parentElement!.querySelector('input')!
    const label = () => document.querySelector('[data-note-label]')!.textContent
    expect(field('W').value).toBe('150')
    expect(label()).toContain('150 × 70 mm')

    // Height's unit menu switches Width too, the banknote's label on the canvas, and the browser's choice
    await user.click(screen.getAllByRole('button', { name: 'Unit: Millimetres' })[1])
    await user.click(await screen.findByRole('menuitemradio', { name: /Inches/ }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(field('W').value).toBe('5.906')
    expect(field('H').value).toBe('2.756')
    expect(screen.getAllByRole('button', { name: 'Unit: Inches' })).toHaveLength(2)
    expect(label()).toContain('5.906 × 2.756 in')
    expect(useLengthUnit.getState().unit).toBe('in')
    // Only how it reads: the banknote itself is untouched, and there is nothing to undo
    expect(note().widthMm).toBe(150)
    expect(useHistory.getState().entries[useProjects.getState().demoPreview!.id]?.past.length ?? 0).toBe(0)

    // Typed in inches, kept exactly; another unit typed after the number converts without switching
    fireEvent.change(field('W'), { target: { value: '6.14' } })
    fireEvent.blur(field('W'))
    expect(note().widthMm).toBe(155.956)
    expect(field('W').value).toBe('6.14')
    fireEvent.change(field('W'), { target: { value: '15cm' } })
    fireEvent.keyDown(field('W'), { key: 'Enter' })
    fireEvent.blur(field('W'))
    expect(note().widthMm).toBe(150)
    expect(field('W').value).toBe('5.906')

    // The arrow keys step to the next round number of the unit: 0.01 in for the 0.5 mm step, ten steps with Shift
    fireEvent.keyDown(field('W'), { key: 'ArrowUp' })
    expect(note().widthMm).toBe(150.114)
    expect(field('W').value).toBe('5.91')
    fireEvent.keyDown(field('W'), { key: 'ArrowDown', shiftKey: true })
    expect(note().widthMm).toBe(147.574)

    // The number shown at a limit can be typed; past it, nothing changes
    fireEvent.change(field('W'), { target: { value: '9.843' } })
    fireEvent.blur(field('W'))
    expect(note().widthMm).toBe(250)
    fireEvent.change(field('W'), { target: { value: '9.9' } })
    fireEvent.blur(field('W'))
    expect(note().widthMm).toBe(250)
    expect(field('W').value).toBe('9.843')

    // The thread's lengths and its windows follow
    await user.click(screen.getByRole('tab', { name: 'Thread' }))
    expect(field('T').value).toBe(String(lengthIn(note().thread.widthMm, 'in')))
    // The first window runs 0 to 8 mm
    expect(note().thread.windows.sections[0]).toMatchObject({ startMm: 0, endMm: 8 })
    await user.click(screen.getByRole('button', { name: 'Window 1, 0–0.315 in' }))
    const end = screen.getByTitle('Window 1: visible section ends here').querySelector('input')!
    expect(end.value).toBe('0.315')
    fireEvent.change(end, { target: { value: '0.4' } })
    fireEvent.blur(end)
    expect(note().thread.windows.sections[0].endMm).toBe(10.16)

    // Back to mm from any field: nothing ever moved
    await user.click(screen.getAllByRole('button', { name: 'Unit: Inches' })[0])
    await user.click(await screen.findByRole('menuitemradio', { name: /Millimetres/ }))
    await user.click(screen.getByRole('tab', { name: 'Banknote' }))
    expect(field('W').value).toBe('250')
    expect(note().widthMm).toBe(250)
  })

  it('types a watermark’s place exactly in any unit', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'units-watermark-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    const demo = useProjects.getState().demoPreview!
    act(() => updateNote(demo.id, demo.notes[0].id, (n) => ({ ...n, watermark: newWatermark(n) })))
    act(() => setLengthUnit('in'))
    await user.click(screen.getByRole('tab', { name: 'Watermark' }))
    const x = screen.getByTitle('Watermark position from the left edge').querySelector('input')!
    fireEvent.change(x, { target: { value: '0.5' } })
    fireEvent.blur(x)
    expect(useProjects.getState().demoPreview!.notes[0].watermark!.xMm).toBe(12.7)
    expect(x.value).toBe('0.5')
  })

  it('sizes a new banknote in the unit picked', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'units-dialog-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.click(await screen.findByRole('button', { name: 'Demo', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Demo banknote', exact: true }))
    act(() => setLengthUnit('cm'))
    await user.click(screen.getByRole('button', { name: 'Add banknote', exact: true }))
    const dialog = await screen.findByRole('dialog')
    const units = within(dialog).getAllByRole('button', { name: 'Unit: Centimetres' })
    expect(units).toHaveLength(2)
    const [width, height] = units.map((unit) => unit.closest('.relative')!.querySelector('input')!)
    expect(width.value).toBe('15')
    expect(height.value).toBe('7')
    fireEvent.change(width, { target: { value: '6.14in' } })
    fireEvent.blur(width)
    expect(width.value).toBe('15.596')
    await user.click(within(dialog).getByRole('button', { name: 'Add', exact: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useProjects.getState().demoPreview!.notes.at(-1)!.widthMm).toBe(155.956)
  })
})
