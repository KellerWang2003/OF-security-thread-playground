import { useEffect, useState } from 'react'
import { readArtwork, writeArtwork } from '../cloud/cache'
import { downloadArtwork } from '../cloud/repository'
import { reportError } from '../cloud/notices'

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp'

// Object URLs are kept for the whole session so switching projects never flickers
const urls = new Map<string, string>()
const pending = new Map<string, Promise<string | undefined>>()
let workspace: string | undefined
export function setImageWorkspace(id: string | undefined) {
  workspace = id
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
  pending.clear()
}
export function imageWorkspace() {
  if (!workspace) throw new Error('Open a workspace to save artwork.')
  return workspace
}

async function resolveUrl(id: string) {
  const original = imageWorkspace()
  const cached = urls.get(id)
  if (cached) return cached
  const inflight = pending.get(id)
  if (inflight) return inflight
  const request = downloadArtwork(original, id).then((blob) => {
    if (workspace !== original) return undefined
    const url = URL.createObjectURL(blob)
    urls.set(id, url)
    return url
  }).finally(() => { if (workspace === original) pending.delete(id) })
  pending.set(id, request)
  return request
}

export async function storeImage(blob: Blob) {
  const original = imageWorkspace()
  if (blob.size > 25 * 1024 * 1024) throw new Error('Artwork must be smaller than 25 MB.')
  if (!IMAGE_ACCEPT.split(',').includes(blob.type)) throw new Error('Choose a PNG, JPEG, SVG, or WebP image.')
  const id = crypto.randomUUID()
  await writeArtwork(original, id, blob)
  if (workspace !== original) throw new Error('The workspace changed. Try again.')
  urls.set(id, URL.createObjectURL(blob))
  return id
}

export async function copyImage(id: string) {
  const original = imageWorkspace()
  const blob = await readArtwork(original, id) ?? await downloadArtwork(original, id)
  if (workspace !== original) throw new Error('The workspace changed. Try again.')
  return storeImage(blob)
}

// Artwork is immutable and retained for offline drafts and conflict recovery.
// Removing an image reference never deletes another device's pending artwork.
export async function removeImage(_id: string) {}

export function useImageUrl(id: string | undefined) {
  const [loaded, setLoaded] = useState<{ id: string; url?: string }>()

  useEffect(() => {
    if (!id || urls.has(id)) return
    let live = true
    void resolveUrl(id).then((url) => {
      if (live) setLoaded({ id, url })
    }).catch((error: unknown) => { if (live) reportError(error) })
    return () => {
      live = false
    }
  }, [id])

  if (!id) return undefined
  return urls.get(id) ?? (loaded?.id === id ? loaded.url : undefined)
}

/** Height ÷ width of an image file, read from the image itself (works for SVG too) */
export function imageAspect(file: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : undefined)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(undefined)
    }
    img.src = url
  })
}

/** Opens the system file picker without needing a hidden input in the tree */
export function pickFiles({ multiple = false } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = IMAGE_ACCEPT
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}
