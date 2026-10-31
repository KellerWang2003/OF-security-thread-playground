const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const cloudConfigured = Boolean(url && key)

export class WorkspaceApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

async function request(body: Record<string, unknown> | FormData) {
  if (!cloudConfigured) throw new Error('Cloud connection is not configured.')
  const multipart = body instanceof FormData
  const response = await fetch(`${url}/functions/v1/thread-workspace`, {
    method: 'POST', headers: { apikey: key, ...(multipart ? {} : { 'Content-Type': 'application/json' }) },
    body: multipart ? body : JSON.stringify(body),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new WorkspaceApiError(data.error || data.message || 'Couldn’t reach the workspace. Please retry.', response.status)
  }
  return response
}
export async function workspaceJson<T>(workspace: string, action: string, data: Record<string, unknown> = {}): Promise<T> {
  return (await request({ ...data, workspace, action })).json()
}
export async function uploadArtwork(workspace: string, id: string, file: Blob) {
  const form = new FormData()
  form.set('workspace', workspace)
  form.set('id', id)
  form.set('file', file, id)
  await request(form)
}
export async function fetchArtwork(workspace: string, id: string) {
  return (await request({ workspace, action: 'download', id })).blob()
}
