// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OpenWorkspace } from '../src/app/OpenWorkspace'
import { normalizeWorkspace, readWorkspaceName, WORKSPACE_EVENT } from '../src/cloud/identity'

afterEach(() => { cleanup(); localStorage.clear() })
describe('username entry', () => {
  it('opens a normalized username and remembers it on this browser', async () => {
    const user = userEvent.setup()
    const listener = vi.fn()
    window.addEventListener(WORKSPACE_EVENT, listener, { once: true })
    render(<OpenWorkspace />)
    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'Keller')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(readWorkspaceName()).toBe('keller')
    expect(listener).toHaveBeenCalled()
  })
  it('rejects names that cannot safely identify a workspace', async () => {
    const user = userEvent.setup()
    render(<OpenWorkspace />)
    await user.type(screen.getByRole('textbox', { name: 'Username' }), '../bad')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Use 2–32')
    expect(readWorkspaceName()).toBeNull()
    expect(() => normalizeWorkspace('a')).toThrow()
    expect(() => normalizeWorkspace('public-demos')).toThrow('reserved')
    expect(normalizeWorkspace('  My-Workspace_2  ')).toBe('my-workspace_2')
  })
})
