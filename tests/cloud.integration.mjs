// Explicit live smoke test: creates disposable workspaces and cleans them up in finally.
// Run: node --env-file=.env.local tests/cloud.integration.mjs
// Supabase CLI login is used only for cleanup; server keys stay in memory.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
assert(url && key, 'Configure .env.local first')
const ref = new URL(url).hostname.split('.')[0]
const response = JSON.parse(execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '--output', 'json'], { encoding: 'utf8' }))
const keys = Array.isArray(response) ? response : response.api_keys ?? response.keys
const secret = keys.find((k) => k.type === 'secret')?.api_key ?? keys.find((k) => k.name === 'service_role')?.api_key
assert(secret, 'A server test key is required for fixture cleanup')
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, secret, options)
const anon = createClient(url, key, options)
const table = 'thread_playground_projects'
const bucket = 'thread-playground-artwork'
const workspace = `smoke-${randomUUID().slice(0, 20)}`
const other = `smoke-${randomUUID().slice(0, 20)}`
const id = randomUUID()
const imageId = randomUUID()
const endpoint = `${url}/functions/v1/thread-workspace`
const api = (action, data = {}, name = workspace) => fetch(endpoint, {
  method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, action, workspace: name }),
})
const ok = ({ data, error }) => { if (error) throw error; return data }
try {
  const preflight = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5174' } })
  assert.equal(preflight.status, 200)
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
  const demoResponse = await api('demo')
  assert.equal(demoResponse.status, 200)
  const sharedDemo = await demoResponse.json()
  assert.equal(sharedDemo.data.name, 'Silly bird demo')
  const otherDemo = await (await api('demo', {}, other)).json()
  assert.equal(otherDemo.data.id, sharedDemo.data.id)
  const blocked = await api('write', { project: sharedDemo.data, revision: randomUUID(), baseRevision: sharedDemo.revision, deleted: false }, 'public-demos')
  assert.equal(blocked.status, 400, 'The shared demo must be read-only')
  assert.equal((await (await api('demo')).json()).revision, sharedDemo.revision)
  const revision = randomUUID()
  const project = { id, name: 'Disposable cloud test', notes: [], createdAt: Date.now(), updatedAt: Date.now() }
  let result = await api('write', { project, revision, baseRevision: null, deleted: false })
  assert.equal(result.status, 200, await result.text())
  result = await api('list')
  assert.equal(result.headers.get('access-control-allow-origin'), '*', 'POST must return a single CORS origin')
  assert.equal((await result.json()).length, 1)
  result = await api('list', {}, other)
  assert.equal((await result.json()).length, 0)
  result = await api('get', { id }, other)
  assert.equal(await result.json(), null)
  const image = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>'], { type: 'image/svg+xml' })
  const form = new FormData()
  form.set('workspace', workspace); form.set('id', imageId); form.set('file', image, imageId)
  result = await fetch(endpoint, { method: 'POST', headers: { apikey: key }, body: form })
  assert.equal(result.status, 200, await result.text())
  result = await api('download', { id: imageId })
  assert.equal(result.status, 200)
  assert.equal(result.headers.get('content-type'), 'image/svg+xml')
  assert((await result.blob()).size > 0)
  assert(!(await api('download', { id: imageId }, other)).ok)
  // A fresh caller can open the same username without any account or session.
  assert.equal((await (await api('list')).json())[0].data.id, id)
  const nextRevision = randomUUID()
  result = await api('write', { project: { ...project, name: 'Updated' }, revision: nextRevision, baseRevision: revision, deleted: false })
  assert.equal(result.status, 200, await result.text())
  assert.equal((await api('write', { project, revision: randomUUID(), baseRevision: revision, deleted: false })).status, 409)
  assert.equal((await api('write', { project, revision: randomUUID(), baseRevision: nextRevision, deleted: true })).status, 200)
  assert.equal((await api('list', {}, '../invalid')).status, 400)
  assert.equal((await api('get', { id: '../path' })).status, 400)
  assert.equal((await api('all-workspaces')).status, 400)
  assert((await anon.from(table).select('id')).error)
  assert((await anon.storage.from(bucket).download(`${workspace}/${imageId}`)).error)
  console.log('PASS: username access, project saves, private artwork routing, workspace scoping, CAS conflicts, input validation, and denied direct database/storage access.')
} finally {
  ok(await admin.storage.from(bucket).remove([`${workspace}/${imageId}`]))
  ok(await admin.from(table).delete().eq('id', id).eq('workspace', workspace))
  console.log('Disposable project and artwork removed.')
}
