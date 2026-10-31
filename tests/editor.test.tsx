// @vitest-environment jsdom
import React from 'react'
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { TooltipProvider } from '../src/components/ui/tooltip'

vi.mock('../src/cloud/client', () => ({ cloudConfigured: true }))
vi.mock('../src/cloud/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/cloud/repository')>()
  return { ...actual, createRepository: () => ({
    list: async () => [],
    save: async (record: import('../src/cloud/sync').CachedProject) => ({ project: record.project, revision: record.revision, deleted: record.deleted }),
  }) }
})
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('username workspace editor', () => {
  it('creates a project and banknote, autosaves a rename, and duplicates the project', async () => {
    const user = userEvent.setup()
    localStorage.setItem('of-thread-workspace', 'disposable-ui-test')
    render(<TooltipProvider><App /></TooltipProvider>)
    await user.type(await screen.findByPlaceholderText('Untitled project'), 'UI test project')
    await user.click(screen.getByRole('button', { name: 'Create', exact: true }))
    await user.type(await screen.findByPlaceholderText('Banknote 1'), 'UI test banknote')
    await user.click(screen.getByRole('button', { name: 'Add', exact: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
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
})
