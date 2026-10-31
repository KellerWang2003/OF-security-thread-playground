import { useEffect, useState } from 'react'
import * as db from './db'

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp'

// Object URLs are kept for the whole session so switching projects never flickers
const urls = new Map<string, string>()

async function resolveUrl(id: string) {
  const cached = urls.get(id)
  if (cached) return cached
  const blob = await db.loadImage(id)
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  urls.set(id, url)
  return url
}

export async function storeImage(blob: Blob) {
  const id = crypto.randomUUID()
  await db.saveImage(id, blob)
  urls.set(id, URL.createObjectURL(blob))
  return id
}

export async function copyImage(id: string) {
  const blob = await db.loadImage(id)
  return blob ? storeImage(blob) : undefined
}

export async function removeImage(id: string) {
  const url = urls.get(id)
  if (url) URL.revokeObjectURL(url)
  urls.delete(id)
  await db.deleteImage(id)
}

export function useImageUrl(id: string | undefined) {
  const [loaded, setLoaded] = useState<{ id: string; url?: string }>()

  useEffect(() => {
    if (!id || urls.has(id)) return
    let live = true
    void resolveUrl(id).then((url) => {
      if (live) setLoaded({ id, url })
    })
    return () => {
      live = false
    }
  }, [id])

  if (!id) return undefined
  return urls.get(id) ?? (loaded?.id === id ? loaded.url : undefined)
}

/** Opens the system file picker without needing a hidden input in the tree */
export function pickFiles({ multiple = false } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = IMAGE_ACCEPT
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.click()
  })
}
