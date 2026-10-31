const KEY = 'of-thread-workspace'
export const WORKSPACE_EVENT = 'of-thread-workspace-change'
export function normalizeWorkspace(input: string) {
  const name = input.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(name)) throw new Error('Use 2–32 letters, numbers, hyphens, or underscores.')
  if (name === 'public-demos') throw new Error('This workspace name is reserved.')
  return name
}
export function readWorkspaceName(): string | null {
  const name = localStorage.getItem(KEY)
  if (!name) return null
  try { return normalizeWorkspace(name) } catch { return null }
}
export function enterWorkspace(input: string) {
  const name = normalizeWorkspace(input)
  localStorage.setItem(KEY, name)
  window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT, { detail: name }))
}
export function clearWorkspaceName() {
  localStorage.removeItem(KEY)
  location.hash = ''
  window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT, { detail: null }))
}
