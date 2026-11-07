import { useEffect, useState } from 'react'
import { createStore, get, set } from 'idb-keyval'
import { readArtwork, writeArtwork } from '../cloud/cache'
import { downloadArtwork } from '../cloud/repository'
import { reportError } from '../cloud/notices'
import { canWorkOffThread, makeCopies } from './imageWork'

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp'

// Object URLs are kept for the whole session so switching projects never flickers
const urls = new Map<string, string>()
const pending = new Map<string, Promise<string | undefined>>()
/** Each image's file, read once from this device or the cloud, for its original's address and its copies */
const blobs = new Map<string, Promise<Blob>>()
let workspace: string | undefined
export function setImageWorkspace(id: string | undefined) {
  workspace = id
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
  pending.clear()
  blobs.clear()
  dropCopies()
}
export function imageWorkspace() {
  if (!workspace) throw new Error('Open a workspace to save artwork.')
  return workspace
}

function originalBlob(id: string) {
  let blob = blobs.get(id)
  if (!blob) {
    const reading = downloadArtwork(imageWorkspace(), id)
    // A failed read is tried again next time
    reading.catch(() => { if (blobs.get(id) === reading) blobs.delete(id) })
    blobs.set(id, reading)
    blob = reading
  }
  return blob
}

async function resolveUrl(id: string) {
  const original = imageWorkspace()
  const cached = urls.get(id)
  if (cached) return cached
  const inflight = pending.get(id)
  if (inflight) return inflight
  const request = originalBlob(id).then((blob) => {
    if (workspace !== original) return undefined
    const url = URL.createObjectURL(blob)
    urls.set(id, url)
    return url
  }).finally(() => { if (workspace === original) pending.delete(id) })
  pending.set(id, request)
  return request
}

/**
 * Display copies (3 November: large uploads made tilting stutter, as the browser unpacked them whole again and again).
 * A view never needs more pixels than it draws, so besides the original each image has smaller copies, 256 to 4096 px
 * on its long side, doubling, made in the background (imageWork.ts) and kept on this device only: never uploaded or
 * saved in projects, so the original stays as uploaded. A view asks for the size it draws an image at (`useImageUrl`'s
 * `px`) and gets the smallest copy at least that big, or the original past the largest; an SVG, or a browser that
 * can't make copies, gets the original.
 */
export const COPY_STEPS = [256, 512, 1024, 2048, 4096]
/** Device pixels enough for any thumbnail: list rows, timeline clips, fill rows, image buttons */
export const THUMB_PX = 256
/** `css` CSS pixels in this screen's pixels */
export const devicePx = (css: number) => css * (globalThis.devicePixelRatio || 1)
/** The copy for drawing an image `px` pixels across: the smallest step at least that big, else the original (∞) */
export const stepFor = (px: number) => COPY_STEPS.find((step) => step >= px) ?? Infinity
/** Device pixels a banknote's design is drawn across at `scale` px per mm: as long as the banknote, which it covers */
export const designPx = (note: { widthMm: number; heightMm: number }, scale: number) => devicePx(Math.max(note.widthMm, note.heightMm) * scale)

interface Copies {
  /** The original's size */
  width: number
  height: number
  urls: Map<number, string>
}
interface SavedCopies {
  width: number
  height: number
  copies: [number, Blob][]
}
/** Copies kept on this device by image id, apart from the artwork, so they can be cleared at any time */
const copyStore = createStore('of-thread-display-copies', 'copies')
/** Changes whenever the steps or how copies are made change, so older copies are made again */
const COPIES_VERSION = 1
/** Copies' storage on this device; where it fails, copies are made again next time instead */
const savedCopies = (key: string) => Promise.resolve().then(() => get<SavedCopies>(key, copyStore)).catch(() => undefined)
const saveCopies = (key: string, made: SavedCopies) => void Promise.resolve().then(() => set(key, made, copyStore)).catch(() => {})
/** Each image's copies once ready; null where none can be made, so the original shows */
const copies = new Map<string, Copies | null>()
const copying = new Map<string, Promise<Copies | null>>()

function dropCopies() {
  for (const made of copies.values()) for (const url of made?.urls.values() ?? []) URL.revokeObjectURL(url)
  copies.clear()
  copying.clear()
}

async function readCopies(id: string, given?: Blob): Promise<Copies | null> {
  if (!canWorkOffThread()) return null
  const blob = given ?? await originalBlob(id)
  // Vector art draws sharp at any size
  if (blob.type === 'image/svg+xml') return null
  // By the file's size as well as its id, so artwork stored again under its id (the demo's, as the app changes) never
  // shows from copies of what was there before
  const key = `${COPIES_VERSION}:${id}:${blob.size}`
  let saved = await savedCopies(key)
  if (!saved) {
    try {
      saved = await makeCopies(blob, COPY_STEPS)
    } catch {
      return null
    }
    saveCopies(key, saved)
  }
  return { width: saved.width, height: saved.height, urls: new Map(saved.copies.map(([step, copy]) => [step, URL.createObjectURL(copy)])) }
}

/** An image's copies, read from this device, or made the first time it is drawn here (from `given`, a new upload's file) */
function copiesOf(id: string, given?: Blob) {
  const ready = copies.get(id)
  if (ready !== undefined) return Promise.resolve(ready)
  let making = copying.get(id)
  if (!making) {
    const original = workspace
    const reading = readCopies(id, given).then((made) => {
      if (workspace !== original) {
        for (const url of made?.urls.values() ?? []) URL.revokeObjectURL(url)
        return null
      }
      copies.set(id, made)
      return made
    }).finally(() => { if (copying.get(id) === reading) copying.delete(id) })
    copying.set(id, reading)
    making = reading
  }
  return making
}

/** Where to draw an image from at `step`, if that is known yet: its copy, or the original where no copy is smaller */
function knownUrl(id: string, step: number | undefined) {
  if (step === undefined) return urls.get(id)
  const made = copies.get(id)
  if (made === undefined) return undefined
  if (made === null || step >= Math.max(made.width, made.height)) return urls.get(id)
  return made.urls.get(step) ?? urls.get(id)
}

async function resolveImage(id: string, step: number | undefined) {
  if (step !== undefined) {
    await copiesOf(id)
    const url = knownUrl(id, step)
    if (url) return url
  }
  return resolveUrl(id)
}

/**
 * The artwork's object URL, downloading it if needed (for drawing outside React); with `px`, the pixels it is drawn
 * across, its display copy for that size
 */
export const loadImageUrl = (id: string, px?: number) => resolveImage(id, px === undefined ? undefined : stepFor(px))

export async function storeImage(blob: Blob) {
  const original = imageWorkspace()
  if (blob.size > 25 * 1024 * 1024) throw new Error('Artwork must be smaller than 25 MB.')
  if (!IMAGE_ACCEPT.split(',').includes(blob.type)) throw new Error('Choose a PNG, JPEG, SVG, or WebP image.')
  const id = crypto.randomUUID()
  await writeArtwork(original, id, blob)
  if (workspace !== original) throw new Error('The workspace changed. Try again.')
  urls.set(id, URL.createObjectURL(blob))
  blobs.set(id, Promise.resolve(blob))
  // Its copies are on their way before anything draws it
  void copiesOf(id, blob).catch(() => {})
  return id
}

/** Stores artwork under an id of the caller's (the demo's fixed ones), unless it was stored this session already */
export async function storeImageAs(id: string, blob: Blob) {
  const original = imageWorkspace()
  if (urls.has(id)) return
  await writeArtwork(original, id, blob)
  if (workspace !== original) throw new Error('The workspace changed. Try again.')
  urls.set(id, URL.createObjectURL(blob))
  blobs.set(id, Promise.resolve(blob))
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

/** The biggest copy of an image already made, to keep showing while a bigger size is on its way */
function largestCopy(id: string) {
  const made = copies.get(id)
  if (!made?.urls.size) return undefined
  return made.urls.get(Math.max(...made.urls.keys()))
}

/**
 * An image's object URL to draw it with: given `px`, the device pixels it is drawn across, its display copy for that
 * size (the original past the largest copy); without, the original. Fetches or makes it as needed. Undefined while it
 * is still on its way, which views show as a loading state (`Skeleton`), and null once it couldn't be had (it is tried
 * again the next time a view draws it), so nothing shows as loading for ever. A sized view waiting for a bigger size of
 * an image it already has (zooming in past the copies) keeps showing the biggest copy meanwhile, and if that size can't
 * be had, never going back to loading or to nothing.
 */
export function useImageUrl(id: string | undefined, px?: number): string | null | undefined {
  const step = px === undefined ? undefined : stepFor(px)
  const key = `${id}@${step}`
  const [loaded, setLoaded] = useState<{ key: string; url?: string; failed?: boolean }>()
  const url = id ? knownUrl(id, step) ?? (loaded?.key === key ? loaded.url : undefined) : undefined
  const failed = !url && loaded?.key === key && loaded.failed === true

  // Rendered without it: fetch or make it, or pick it up if another view did since this one rendered
  useEffect(() => {
    if (!id || url || failed) return
    let live = true
    void resolveImage(id, step).then((next) => {
      if (live) setLoaded({ key: `${id}@${step}`, url: next })
    }).catch((error: unknown) => {
      if (!live) return
      reportError(error)
      setLoaded({ key: `${id}@${step}`, failed: true })
    })
    return () => {
      live = false
    }
  }, [id, step, url, failed])

  if (!id || url) return url
  const meanwhile = step === undefined ? undefined : largestCopy(id)
  return meanwhile ?? (failed ? null : undefined)
}

/**
 * Has the copies of images a view may show next ready ahead of time (each frame a tilt can come to), so none shows
 * late the first time it comes up
 */
export function useWarmImages(ids: (string | undefined)[]) {
  const key = ids.filter((id) => id !== undefined).join('|')
  useEffect(() => {
    if (!key || !workspace) return
    for (const id of key.split('|')) void copiesOf(id).catch(() => {})
  }, [key])
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
