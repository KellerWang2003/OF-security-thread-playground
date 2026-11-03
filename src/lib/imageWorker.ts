/**
 * Image work off the main thread, sent by imageWork.ts: unpacking an uploaded image once to make its display copies,
 * or to shrink it for a reading of its pixels. Unpacking a 4000 px image takes about a tenth of a second and as much
 * memory as its pixels (61 MB); here it never holds up the page.
 */

/** Makes the display copies: one for each step smaller than the image, largest first, each drawn from the one before */
export interface CopiesJob {
  kind: 'copies'
  blob: Blob
  steps: number[]
  quality: number
}

/** Shrinks the image to at most `maxPx` on its longest side, as a canvas draws it at `quality` */
export interface ShrinkJob {
  kind: 'shrink'
  blob: Blob
  maxPx: number
  quality: ImageSmoothingQuality
}

export type ImageJob = CopiesJob | ShrinkJob

/** The image's own size, and its copies by step */
export interface CopiesDone {
  width: number
  height: number
  copies: [number, Blob][]
}

export interface ShrinkDone {
  bitmap: ImageBitmap
}

export interface ImageJobMessage {
  id: number
  job: ImageJob
}

export interface ImageJobReply {
  id: number
  result?: CopiesDone | ShrinkDone
  error?: string
}

/** The worker's own scope, typed by hand: the DOM and worker type libraries can't both be loaded */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ImageJobMessage>) => void) | null
  postMessage: (message: ImageJobReply, transfer?: Transferable[]) => void
}

/** `width` × `height` scaled so the longest side is `long` */
const fitted = (width: number, height: number, long: number) => {
  const k = long / Math.max(width, height)
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

/** Whether nothing of the image shows through, read from its largest copy */
function opaque(canvas: OffscreenCanvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return false
  return true
}

async function copies({ blob, steps, quality }: CopiesJob): Promise<CopiesDone> {
  const bitmap = await createImageBitmap(blob)
  const { width, height } = bitmap
  const long = Math.max(width, height)
  const drawn: [number, OffscreenCanvas][] = []
  // Halving from the copy before keeps fine lines smooth, where one big step down would alias them
  let source: ImageBitmap | OffscreenCanvas = bitmap
  for (const step of [...steps].sort((a, b) => b - a)) {
    if (step >= long) continue
    const size = fitted(width, height, step)
    const canvas = new OffscreenCanvas(size.width, size.height)
    // Drawn on the CPU, so the GPU the page draws with is never kept waiting for a copy to be read back
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) break
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, size.width, size.height)
    drawn.push([step, canvas])
    source = canvas
  }
  bitmap.close()
  // An opaque image's copies are JPEGs, which open several times faster than WebP; one that shows through keeps it
  // in WebP (or PNG where the browser can't write WebP)
  const type = drawn.length > 0 && opaque(drawn[0][1]) ? 'image/jpeg' : 'image/webp'
  const made: [number, Blob][] = []
  for (const [step, canvas] of drawn) made.push([step, await canvas.convertToBlob({ type, quality })])
  return { width, height, copies: made }
}

async function shrink({ blob, maxPx, quality }: ShrinkJob): Promise<ShrinkDone> {
  const bitmap = await createImageBitmap(blob)
  if (Math.max(bitmap.width, bitmap.height) <= maxPx) return { bitmap }
  const size = fitted(bitmap.width, bitmap.height, maxPx)
  const canvas = new OffscreenCanvas(size.width, size.height)
  // Drawn on the CPU, as the pixel readers' own canvases are, so it reads as the image drawn on the page did
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('The image could not be drawn.')
  ctx.imageSmoothingQuality = quality
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  return { bitmap: canvas.transferToImageBitmap() }
}

scope.onmessage = ({ data: { id, job } }) => {
  const work: Promise<CopiesDone | ShrinkDone> = job.kind === 'copies' ? copies(job) : shrink(job)
  work.then(
    (result) => scope.postMessage({ id, result }, 'bitmap' in result ? [result.bitmap] : []),
    (error: unknown) => scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }),
  )
}
