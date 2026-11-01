// @vitest-environment jsdom
import React from 'react'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { useProjects } from '../src/lib/store'
import { migrateProject } from '../src/lib/notes'
import { setTilt, useTilt } from '../src/tilt/tilt'
import { TooltipProvider } from '../src/components/ui/tooltip'

const saves = vi.hoisted(() => vi.fn())

vi.mock('../src/cloud/client', () => ({ cloudConfigured: true }))
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
    // Clicking the banknote away from its windows ends editing, and the banknote stays selected
    fireEvent.pointerDown(document.querySelector('[data-note-body]')!, { button: 0, pointerId: 1 })
    fireEvent.pointerUp(document.querySelector('[data-note-body]')!, { button: 0, pointerId: 1 })
    expect(screen.queryByRole('group', { name: 'Edit thread windows' })).toBeNull()
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
    fireEvent.change(screen.getByTitle('Playback speed multiplier; 1× takes two seconds for the full motion, before holds').querySelector('input')!, { target: { value: '2' } })
    fireEvent.change(screen.getByTitle('Pause at flat and at full tilt, in seconds at each end').querySelector('input')!, { target: { value: '0.5' } })
    await user.click(screen.getByRole('combobox', { name: 'Playback curve' }))
    await user.click(await screen.findByRole('option', { name: 'Linear', exact: true }))
    const project = useProjects.getState().demoPreview!
    expect(project.notes).toHaveLength(2)
    for (const note of migrateProject(JSON.parse(JSON.stringify(project))).notes) {
      expect(note.tilt).toMatchObject({ transition: 0.6, speed: 2, curve: 'linear', holdSeconds: 0.5 })
    }
    expect(screen.getByText('2 s / loop')).toBeDefined()
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

})
