import { withSupabase } from '@supabase/server'

const DEMO_WORKSPACE = 'public-demos'
const DEMO_ID = '82e5f8ec-e552-4bdf-a578-cb3c6a509001'
const TABLE = 'thread_playground_projects'
const BUCKET = 'thread-playground-artwork'
const MAX_IMAGE = 25 * 1024 * 1024
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
class BadRequest extends Error {}
function username(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,31}$/.test(value)) throw new BadRequest('Invalid workspace name.')
  return value
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new BadRequest('Invalid project or artwork ID.')
  return value
}
function check(error: { message: string } | null) { if (error) throw new Error(error.message) }

// Username-only access is intentional. A caller can open any *known* workspace,
// but cannot enumerate all workspaces or make unscoped database/storage requests.
const handler = withSupabase({ auth: 'publishable' }, async (req, ctx) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 })
    const db = ctx.supabaseAdmin
    if (req.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await req.formData()
      const workspace = username(form.get('workspace'))
      if (workspace === DEMO_WORKSPACE) throw new BadRequest('Shared demos are read-only.')
      const id = uuid(form.get('id'))
      const file = form.get('file')
      if (!(file instanceof File) || !MIME_TYPES.has(file.type)) throw new BadRequest('Choose a PNG, JPEG, SVG, or WebP image.')
      if (file.size > MAX_IMAGE) throw new BadRequest('Artwork must be smaller than 25 MB.')
      const { error } = await db.storage.from(BUCKET).upload(`${workspace}/${id}`, file, { contentType: file.type, upsert: false })
      if (error && String(error.statusCode) !== '409' && error.message !== 'The resource already exists') check(error)
      return Response.json({ ok: true })
    }
    const body = await req.json()
    const workspace = username(body.workspace)
    const columns = 'data,revision,deleted_at'
    if (body.action === 'demo') {
      const { data, error } = await db.from(TABLE).select(columns).eq('workspace', DEMO_WORKSPACE).eq('id', DEMO_ID).is('deleted_at', null).maybeSingle()
      check(error)
      return Response.json(data)
    }
    if (workspace === DEMO_WORKSPACE && body.action !== 'download') throw new BadRequest('Shared demos are read-only.')
    if (body.action === 'list') {
      const offset = body.offset ?? 0
      if (!Number.isSafeInteger(offset) || offset < 0) throw new BadRequest('Invalid page.')
      const { data, error } = await db.from(TABLE).select(columns).eq('workspace', workspace).order('id').range(offset, offset + 99)
      check(error)
      return Response.json(data)
    }
    if (body.action === 'download') {
      const id = uuid(body.id)
      const { data, error } = await db.storage.from(BUCKET).download(`${workspace}/${id}`)
      check(error)
      // MIME type is preserved for SVG/image rendering; no Storage URL or secret leaves this function.
      return new Response(data, { headers: { 'Content-Type': data!.type, 'Cache-Control': 'no-store' } })
    }
    if (body.action === 'get') {
      const id = uuid(body.id)
      const { data, error } = await db.from(TABLE).select(columns).eq('workspace', workspace).eq('id', id).maybeSingle()
      check(error)
      return Response.json(data)
    }
    if (body.action === 'write') {
      const project = body.project
      if (!project || typeof project.name !== 'string' || !Array.isArray(project.notes)) throw new BadRequest('Invalid project.')
      if (JSON.stringify(project).length > 5 * 1024 * 1024) throw new BadRequest('Project data is too large.')
      const id = uuid(project.id)
      const revision = uuid(body.revision)
      const base = body.baseRevision === null ? null : uuid(body.baseRevision)
      if (typeof body.deleted !== 'boolean') throw new BadRequest('Invalid project state.')
      const payload = { id, workspace, name: project.name, data: project, revision, deleted_at: body.deleted ? new Date().toISOString() : null }
      const result = base
        ? await db.from(TABLE).update(payload).eq('workspace', workspace).eq('id', id).eq('revision', base).select(columns).maybeSingle()
        : await db.from(TABLE).insert(payload).select(columns).single()
      if (result.error?.code === '23505') return Response.json({ error: 'Project revision conflict.' }, { status: 409 })
      check(result.error)
      if (!result.data) return Response.json({ error: 'Project revision conflict.' }, { status: 409 })
      return Response.json(result.data)
    }
    throw new BadRequest('Unknown workspace action.')
  } catch (error) {
    if (error instanceof BadRequest || error instanceof SyntaxError) return Response.json({ error: error.message }, { status: 400 })
    console.error('Workspace request failed:', error)
    return Response.json({ error: 'Couldn’t complete the workspace request. Please retry.' }, { status: 500 })
  }
})

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const response = await handler(req)
    const headers = new Headers(response.headers)
    for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value)
    return new Response(response.body, { status: response.status, headers })
  },
}
