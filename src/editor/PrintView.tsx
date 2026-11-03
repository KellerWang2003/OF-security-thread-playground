import { useEffect, useMemo, useRef, useState } from 'react'
import { reportError } from '../cloud/notices'
import { loadArtwork } from '../lib/exportRender'
import { patternMix, preparePattern } from '../lib/pattern'
import { cutPattern, printedAt, type CutSource } from '../lib/print'
import { imageTiles, threadLength } from '../lib/thread'
import type { Note } from '../lib/types'
import { useTilt } from '../tilt/tilt'

/** Strips the lens isn't showing at the current tilt fade to this much */
const DIM = 0.45
/** Ridge lines darken the print this much */
const RIDGE_LINE = 0.35
/** The print shows at most this many thread widths of length: a whole image copy, without shrinking the weave away */
const MAX_LENGTH = 3
/** A pixel no section covers */
const NONE = 0xffff
/** Owner codes: section index × this + strip */
const PER_SECTION = 16
/** Each woven print's lit versions, by the strips shown; keyed by the print itself, so a new print (artwork that has
 * just loaded, an edited pattern) never shows a version lit from the old one */
const litPrints = new WeakMap<Uint8ClampedArray, Map<string, ImageData>>()

/**
 * The selected banknote's thread as printed, magnified and centred in a square `sizePx` wide: its frames tiled as
 * on the banknote, cut into strips under the ridges and woven together (see `src/lib/print.ts`). Each section of
 * the thread's pattern is cut at its own ridge angle, and shows the frames its track gives; the strips each lens
 * shows at the current tilt stay lit, so tilting shows the print turning into each frame. Gaps between sections
 * print nothing.
 */
export function PrintCanvas({ note, ridges, sizePx }: { note: Note; ridges: number; sizePx: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const images = useFrameImages(note)
  const prepared = preparePattern(note)
  // The strip under each section's ridges now: the only part of a tilt that changes the picture
  const current = useTilt((s) => patternMix(note, { x: s.angleX, y: s.angle }).map((m) => m.slot).join(','))
  const { thread, frames } = note
  const vertical = thread.direction === 'vertical'
  const gapMm = thread.imageGapMm ?? 0
  const dpr = Math.min(2, window.devicePixelRatio || 1)

  // Across the thread's full width, and along it far enough for the longest image copy, or two repeats of a pattern
  const across = thread.widthMm
  const copies = frames.map((f) => {
    const img = images.get(f.id)
    if (f.kind !== 'image' || !img?.naturalWidth) return 0
    const aspect = img.naturalHeight / img.naturalWidth
    return (vertical ? across * aspect : across / aspect) + gapMm
  })
  const repeats = prepared.plain ? 0 : 2 * prepared.pattern.repeatMm
  const along = Math.min(threadLength(note), Math.max(across, Math.min(MAX_LENGTH * across, Math.max(0, repeats, ...copies))))
  const scale = (sizePx * dpr) / Math.max(across, along)
  const w = Math.max(1, Math.round((vertical ? across : along) * scale))
  const h = Math.max(1, Math.round((vertical ? along : across) * scale))

  // Everything that shapes each section's cut (its area, strips and lens) as one key, so a tilt or a move of the
  // banknote doesn't redo the print
  const layout = JSON.stringify({
    repeatMm: prepared.pattern.repeatMm,
    sections: prepared.sections.map(({ section: { startMm, endMm, acrossStart, acrossEnd }, slots, lens: { cycleX, cycleY, dirX, dirY, offset } }): CutSource => ({
      section: { startMm, endMm, acrossStart, acrossEnd }, slots, lens: { cycleX, cycleY, dirX, dirY, offset },
    })),
  })
  const cut = useMemo(() => {
    const { repeatMm, sections } = JSON.parse(layout) as { repeatMm: number; sections: CutSource[] }
    return { repeatMm, cuts: cutPattern(sections, frames, across / ridges) }
  }, [layout, frames, across, ridges])

  // The woven print, and which strip of which section each pixel belongs to; redone only when the print itself changes
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
    const owner = new Uint16Array(w * h).fill(NONE)
    // One screen pixel as a share of a ridge, for the ridge lines; every section has the same ridge width
    const line = dpr / ((across / ridges) * scale)
    const shape = { widthMm: across, direction: thread.direction }
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const printed = printedAt(cut.cuts, cut.repeatMm, shape, (px + 0.5) / scale, (py + 0.5) / scale)
        if (!printed) continue
        const p = py * w + px
        const k = p * 4
        const src = rasters.at(printed.frame)
        owner[p] = printed.section * PER_SECTION + printed.slot
        if (!src) continue
        const edge = printed.phase < line ? RIDGE_LINE : 0
        data[k] = src[k] * (1 - edge)
        data[k + 1] = src[k + 1] * (1 - edge)
        data[k + 2] = src[k + 2] * (1 - edge)
        data[k + 3] = src[k + 3] + (255 - src[k + 3]) * edge
      }
    }
    return { data, owner }
  }, [cut, frames, images, thread.backgroundColor, thread.direction, gapMm, vertical, across, ridges, w, h, scale, dpr])

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    let byShown = litPrints.get(woven.data)
    if (!byShown) {
      byShown = new Map()
      litPrints.set(woven.data, byShown)
    }
    let lit = byShown.get(current)
    if (!lit) {
      const shown = current.split(',').map(Number)
      lit = new ImageData(new Uint8ClampedArray(woven.data), w, h)
      for (let p = 0; p < woven.owner.length; p++) {
        const o = woven.owner[p]
        if (o !== NONE && o % PER_SECTION !== shown[Math.floor(o / PER_SECTION)]) lit.data[p * 4 + 3] *= DIM
      }
      byShown.set(current, lit)
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
