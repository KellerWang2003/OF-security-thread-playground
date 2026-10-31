// @vitest-environment jsdom
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowEditor } from '../src/editor/WindowEditor'
import { createNote, createProject, migrateProject } from '../src/lib/notes'
import { migrateWindows, threadWindowMask } from '../src/lib/thread'
import type { ThreadWindow } from '../src/lib/types'

const makeNote = () => createNote({ name: 'Windows', x: 0, y: 0, widthMm: 100, heightMm: 70, color: '#123456' })
const initial = [{ id: 'first', startMm: 10, endMm: 20 }, { id: 'second', startMm: 30, endMm: 40 }]
function Harness({ direction, outer }: { direction: 'horizontal' | 'vertical'; outer: () => void }) {
  const [sections, setSections] = useState<ThreadWindow[]>(initial)
  const [selected, setSelected] = useState<string>()
  const note = makeNote()
  note.thread.direction = direction
  note.thread.windows = { enabled: true, sections }
  return <div onPointerDown={outer}>
    <WindowEditor note={note} scale={10} selectedId={selected} onSelect={setSelected} onChange={setSections} />
    <output data-testid="sections">{JSON.stringify(sections)}</output>
  </div>
}
const read = (): ThreadWindow[] => JSON.parse(screen.getByTestId('sections').textContent!)
beforeEach(() => {
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number
    constructor(type: string, options: PointerEventInit) { super(type, options); this.pointerId = options.pointerId ?? 1 }
  })
  for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: vi.fn(() => true) })
  }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const pointer = (direction: 'horizontal' | 'vertical', mm: number) => ({ pointerId: 1, button: 0, clientX: direction === 'horizontal' ? mm * 10 : 0, clientY: direction === 'vertical' ? mm * 10 : 0 })

describe.each(['vertical', 'horizontal'] as const)('%s canvas window editing', (direction) => {
  it('draws in either direction, snaps to half millimetres, and does not start canvas gestures', () => {
    const outer = vi.fn()
    render(<Harness direction={direction} outer={outer} />)
    const surface = screen.getByRole('group', { name: 'Edit thread windows' })
    fireEvent.pointerDown(surface, pointer(direction, 8))
    fireEvent.pointerMove(surface, pointer(direction, 2.3))
    fireEvent.pointerUp(surface, pointer(direction, 2.3))
    expect(read()[0]).toMatchObject({ startMm: 2.5, endMm: 8 })
    expect(outer).not.toHaveBeenCalled()
  })
  it('moves without changing length, stops at neighbours, and resizes using an end handle', () => {
    render(<Harness direction={direction} outer={vi.fn()} />)
    const surface = screen.getByRole('group', { name: 'Edit thread windows' })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Window 1', exact: true }), pointer(direction, 15))
    fireEvent.pointerMove(surface, pointer(direction, 100))
    fireEvent.pointerUp(surface, pointer(direction, 100))
    expect(read()[0]).toMatchObject({ startMm: 20, endMm: 30 })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Start of window 1' }), pointer(direction, 20))
    fireEvent.pointerMove(surface, pointer(direction, -10))
    fireEvent.pointerUp(surface, pointer(direction, -10))
    expect(read()[0]).toMatchObject({ startMm: 0, endMm: 30 })
  })
  it('restores the original windows when a gesture is cancelled', () => {
    render(<Harness direction={direction} outer={vi.fn()} />)
    const surface = screen.getByRole('group', { name: 'Edit thread windows' })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Window 1', exact: true }), pointer(direction, 15))
    fireEvent.pointerMove(surface, pointer(direction, 17))
    expect(read()[0].startMm).toBe(12)
    fireEvent.pointerCancel(surface, pointer(direction, 17))
    expect(read()).toEqual(initial)
  })
})

it('preserves legacy window positions and stable ids through saved-project reloads', () => {
  const note = makeNote()
  const legacy = { ...createProject('Legacy'), notes: [{ ...note, thread: { ...note.thread, windows: { enabled: true, windowMm: 8, gapMm: 6, offsetMm: -3 } } }] }
  const project = migrateProject(legacy)
  expect(project.notes[0].thread.windows.sections[0]).toMatchObject({ startMm: 0, endMm: 5 })
  expect(migrateProject(JSON.parse(JSON.stringify(project)))).toEqual(project)
  expect(project.notes[0].thread.windows).not.toHaveProperty('offsetMm')
})
it('distinguishes an empty windowed thread from a continuous one', () => {
  const thread = makeNote().thread
  thread.windows = { enabled: true, sections: [] }
  expect(threadWindowMask(thread, 1).maskImage).toBe('linear-gradient(to bottom, transparent 0px, transparent 100%)')
  thread.windows.enabled = false
  expect(threadWindowMask(thread, 1)).toEqual({})
  expect(migrateWindows({ enabled: true, windowMm: 5, gapMm: 0 }, 70).sections[0]).toMatchObject({ startMm: 0, endMm: 70 })
})
