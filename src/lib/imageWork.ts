import type { CopiesDone, ImageJob, ImageJobMessage, ImageJobReply, ShrinkDone } from './imageWorker'

/**
 * The main thread's side of the image worker (imageWorker.ts): display copies of uploads, and images shrunk for
 * reading their pixels, unpacked and drawn in the background so a large upload never freezes the page. Where the
 * browser can't (tests, older browsers), or the worker can't read the image (an SVG), callers fall back to the
 * original as before.
 */

/** At most this many images unpacked at once: each takes as much memory as its pixels while it is worked on */
const AT_ONCE = 2

let worker: Worker | undefined
/** The worker failed to start: everything falls back to the original for the rest of the session */
let broken = false
let nextId = 0

/** Whether this browser can do image work off the main thread */
export const canWorkOffThread = () =>
  !broken && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined'

const waiting = new Map<number, { resolve: (result: CopiesDone | ShrinkDone) => void; reject: (error: Error) => void }>()
let running = 0
const queue: (() => void)[] = []

function started() {
  if (worker) return worker
  const next = new Worker(new URL('./imageWorker.ts', import.meta.url), { type: 'module' })
  next.onmessage = ({ data }: MessageEvent<ImageJobReply>) => {
    const job = waiting.get(data.id)
    waiting.delete(data.id)
    if (data.result) job?.resolve(data.result)
    else job?.reject(new Error(data.error ?? 'The image could not be read.'))
  }
  next.onerror = () => {
    broken = true
    for (const job of waiting.values()) job.reject(new Error('The image worker stopped.'))
    waiting.clear()
    next.terminate()
    worker = undefined
  }
  worker = next
  return next
}

async function run(job: ImageJob) {
  if (running >= AT_ONCE) await new Promise<void>((go) => queue.push(go))
  running++
  try {
    return await new Promise<CopiesDone | ShrinkDone>((resolve, reject) => {
      const id = ++nextId
      waiting.set(id, { resolve, reject })
      started().postMessage({ id, job } satisfies ImageJobMessage)
    })
  } finally {
    running--
    queue.shift()?.()
  }
}

/** How closely copies keep the original: close enough to see no difference at the size each is drawn */
const COPY_QUALITY = 0.92

/** An image's display copies, one for each of `steps` (px on the long side) smaller than it */
export const makeCopies = async (blob: Blob, steps: number[]) =>
  (await run({ kind: 'copies', blob, steps, quality: COPY_QUALITY })) as CopiesDone

/** Something to draw an image from, `width` × `height` px */
export interface Picture {
  source: CanvasImageSource
  width: number
  height: number
  /** An SVG, which draws sharp at any size: its width and height are only its own size, if it has one */
  vector: boolean
}

function loadElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The image could not be loaded.'))
    img.src = url
  })
}

/**
 * The image at `url`, at most `maxPx` on its longest side for reading its pixels: shrunk in the background, drawn at
 * `quality` as a canvas would, or where that can't be done, the whole image as the page loads it. An SVG always comes
 * whole from the page (the worker can't read one), to be drawn at whatever size its reader needs (its size is 0 if it
 * has none of its own)
 */
export async function pictureOf(url: string, maxPx: number, quality: ImageSmoothingQuality = 'low'): Promise<Picture> {
  const blob = await fetch(url).then((response) => response.blob()).catch(() => undefined)
  const vector = blob?.type === 'image/svg+xml'
  if (blob && !vector && canWorkOffThread()) {
    try {
      const { bitmap } = (await run({ kind: 'shrink', blob, maxPx, quality })) as ShrinkDone
      return { source: bitmap, width: bitmap.width, height: bitmap.height, vector }
    } catch {
      // Below: the page loads it whole, as it always did
    }
  }
  const img = await loadElement(url)
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, vector }
}
