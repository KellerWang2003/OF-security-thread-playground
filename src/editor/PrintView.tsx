import { useEffect, useMemo, useRef, useState } from 'react'
import { reportError } from '../cloud/notices'
import { loadArtwork } from '../lib/exportRender'
import { lensMix, type LensState } from '../lib/lens'
import { frameAtPosition, phasePosition, ridgePhase, weave } from '../lib/print'
import { imageTiles, threadLength } from '../lib/thread'
import type { Note } from '../lib/types'
import { useTilt } from '../tilt/tilt'

/** Strips the lens isn't showing at the current tilt fade to this much */
const DIM = 0.45
/** Ridge lines darken the print this much */
const RIDGE_LINE = 0.35
/** The print shows at most this many thread widths of length: a whole image copy, without shrinking the weave away */
const MAX_LENGTH = 3

/**
 * The selected banknote's thread as printed, magnified and centred in a square `sizePx` wide: its frames tiled as
 * on the banknote, cut into strips under the ridges and woven together (see `src/lib/print.ts`). The strips the
 * lens shows at the current tilt stay lit, so tilting shows the print turning into each frame.
 */
export function PrintCanvas({ note, lens, ridges, sizePx }: { note: Note; lens: LensState; ridges: number; sizePx: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const images = useFrameImages(note)
  const current = useTilt((s) => lensMix(note, { x: s.angleX, y: s.angle }, lens).current)
  const { thread, frames } = note
  const vertical = thread.direction === 'vertical'
  const gapMm = thread.imageGapMm ?? 0
  const dpr = Math.min(2, window.devicePixelRatio || 1)

  // Across the thread's full width, and along it far enough for the longest image copy
  const across = thread.widthMm
  const copies = frames.map((f) => {
    const img = images.get(f.id)
    if (f.kind !== 'image' || !img?.naturalWidth) return 0
    const aspect = img.naturalHeight / img.naturalWidth
    return (vertical ? across * aspect : across / aspect) + gapMm
  })
  const along = Math.min(threadLength(note), Math.max(across, Math.min(MAX_LENGTH * across, Math.max(0, ...copies))))
  const scale = (sizePx * dpr) / Math.max(across, along)
  const w = Math.max(1, Math.round((vertical ? across : along) * scale))
  const h = Math.max(1, Math.round((vertical ? along : across) * scale))

  const { cycleX, cycleY, dirX, dirY, offset } = lens
  const w8 = useMemo(() => weave({ cycleX, cycleY, dirX, dirY, offset }, frames, across / ridges), [cycleX, cycleY, dirX, dirY, offset, frames, across, ridges])

  // The woven print, and which frame each pixel belongs to; redone only when the print itself changes, not on tilt
  const woven = useMemo(() => {
    const rasters = frames.map((frame) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) return new Uint8ClampedArray(w * h * 4)
      if (thread.backgroundColor) {
        ctx.fillStyle = thread.backgroundColor
        ctx.fillRect(0, 0, w, h)
      }
      if (frame.kind === 'color') {
        ctx.fillStyle = frame.color
        ctx.fillRect(0, 0, w, h)
      } else {
        const img = images.get(frame.id)
        if (img?.naturalWidth) {
          const thickness = vertical ? w : h
          const { naturalPx, starts } = imageTiles(thickness, vertical ? h : w, gapMm * scale, img.naturalHeight / img.naturalWidth, thread.direction)
          for (const start of starts) {
            if (vertical) ctx.drawImage(img, 0, start, thickness, naturalPx)
            else ctx.drawImage(img, start, 0, naturalPx, thickness)
          }
        }
      }
      return ctx.getImageData(0, 0, w, h).data
    })
    const data = new Uint8ClampedArray(w * h * 4)
    const owner = new Uint8Array(w * h)
    // One screen pixel as a share of a ridge, for the ridge lines
    const line = dpr / (w8.pitchMm * scale)
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const phase = ridgePhase(w8, (px + 0.5) / scale, (py + 0.5) / scale)
        const frame = frameAtPosition(w8.edges, phasePosition(w8, phase))
        const p = py * w + px
        const k = p * 4
        const src = rasters.at(frame)
        owner[p] = frame
        if (!src) continue
        const edge = phase < line ? RIDGE_LINE : 0
        data[k] = src[k] * (1 - edge)
        data[k + 1] = src[k + 1] * (1 - edge)
        data[k + 2] = src[k + 2] * (1 - edge)
        data[k + 3] = src[k + 3] + (255 - src[k + 3]) * edge
      }
    }
    return { data, owner, lit: new Map<number, ImageData>() }
  }, [w8, frames, images, thread.backgroundColor, thread.direction, gapMm, vertical, w, h, scale, dpr])

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    let lit = woven.lit.get(current)
    if (!lit) {
      lit = new ImageData(new Uint8ClampedArray(woven.data), w, h)
      for (let p = 0; p < woven.owner.length; p++) if (woven.owner[p] !== current) lit.data[p * 4 + 3] *= DIM
      woven.lit.set(current, lit)
    }
    ctx.putImageData(lit, 0, 0)
  }, [woven, current, w, h])

  return (
    <canvas
      ref={canvas}
      width={w}
      height={h}
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: w / dpr, height: h / dpr }}
    />
  )
}

/** The banknote's frame images, by frame id, once loaded */
function useFrameImages(note: Note) {
  const key = note.frames.flatMap((f) => (f.kind === 'image' && f.imageId ? [`${f.id}:${f.imageId}`] : [])).join('|')
  const [loaded, setLoaded] = useState<{ key: string; images: Map<string, HTMLImageElement> }>()
  useEffect(() => {
    let live = true
    const pairs = key ? key.split('|').map((pair) => pair.split(':') as [string, string]) : []
    Promise.all(pairs.map(async ([frameId, imageId]) => [frameId, await loadArtwork(imageId)] as const))
      .then((all) => {
        if (!live) return
        const images = new Map<string, HTMLImageElement>()
        for (const [frameId, img] of all) if (img) images.set(frameId, img)
        setLoaded({ key, images })
      })
      .catch((error: unknown) => { if (live) reportError(error) })
    return () => { live = false }
  }, [key])
  return useMemo(() => loaded?.images ?? new Map<string, HTMLImageElement>(), [loaded])
}
