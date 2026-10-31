import { TILT_LIMIT, frameMix, frameSpans } from './frames'
import { loadImageUrl } from './images'
import { advancePlayback, playbackEase, playbackSettings } from './playback'
import { fitSections, imageTiles, threadLength } from './thread'
import type { Note } from './types'

// Draws banknotes to a canvas exactly as NoteView shows them on the canvas, so the tilt can be exported

/** Same perspective as the canvas: relative to the note's size, so the near edge visibly widens */
export const perspectiveFor = (note: Pick<Note, 'widthMm' | 'heightMm'>, scale: number) => 2.2 * Math.max(note.widthMm, note.heightMm) * scale
/** Space around and between banknotes in an export, in mm */
export const EXPORT_MARGIN_MM = 6

/**
 * The angle of every video frame for `loops` passes of playback: flat, up through the cycle, back to flat,
 * with the project's speed, curve and holds. Uses the same maths as live playback.
 */
export function playbackAngles(tilt: Note['tilt'], fps: number, loops = 1) {
  const { speed, curve, holdSeconds } = playbackSettings(tilt)
  const loopSeconds = 2 / speed + 2 * holdSeconds
  const count = Math.max(1, Math.round(loopSeconds * loops * fps))
  return Array.from({ length: count }, (_, i) => {
    const { phase } = advancePlayback({ phase: 0, holdRemaining: 0 }, (i / fps) % loopSeconds, speed, holdSeconds)
    return Math.max(0, tilt.cycleDeg) * playbackEase(phase <= 1 ? phase : 2 - phase, curve)
  })
}

/**
 * CSS rotateX(angle) about the note's centre under `perspective`: where a point `y` px from the centre lands
 * on screen, and how much its row is scaled. Positive angles tip the top edge away.
 */
export function projectRow(y: number, angleDeg: number, perspective: number) {
  const a = (angleDeg * Math.PI) / 180
  const depth = y * Math.sin(a)
  const s = perspective / (perspective - depth)
  return { y: y * Math.cos(a) * s, scale: s }
}

/** The inverse of projectRow: which row of the flat note shows at screen row `screenY` (from the centre) */
export function sourceRow(screenY: number, angleDeg: number, perspective: number) {
  const a = (angleDeg * Math.PI) / 180
  return (screenY * perspective) / (perspective * Math.cos(a) + screenY * Math.sin(a))
}

/** The screen box a tilted note covers, relative to its centre */
export function tiltedBounds(width: number, height: number, angleDeg: number, perspective: number) {
  const top = projectRow(-height / 2, angleDeg, perspective)
  const bottom = projectRow(height / 2, angleDeg, perspective)
  return { top: top.y, bottom: bottom.y, halfWidth: (width / 2) * Math.max(top.scale, bottom.scale) }
}

export interface NoteAssets {
  face?: HTMLImageElement
  frames: Map<string, HTMLImageElement>
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('An artwork image could not be loaded.'))
    img.src = url
  })
}

async function loadArtwork(id: string) {
  const url = await loadImageUrl(id)
  return url ? loadImage(url) : undefined
}

export async function loadNoteAssets(note: Note): Promise<NoteAssets> {
  const frames = new Map<string, HTMLImageElement>()
  const [face] = await Promise.all([
    note.background === 'image' && note.faceImageId ? loadArtwork(note.faceImageId) : undefined,
    ...note.frames.map(async (frame) => {
      if (frame.kind !== 'image' || !frame.imageId) return
      const img = await loadArtwork(frame.imageId)
      if (img) frames.set(frame.id, img)
    }),
  ])
  return { face, frames }
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function roundedRect(ctx: Ctx, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(0, 0, width, height, radius)
}

/** The flat note at `scale` px per mm, as NoteView draws it before it is turned in 3D */
export function drawFace(ctx: Ctx, note: Note, assets: NoteAssets, scale: number, angle: number, options: { sheen: boolean; perspective: boolean }) {
  const { thread, frames, tilt } = note
  const mm = (value: number) => value * scale
  const width = mm(note.widthMm), height = mm(note.heightMm)
  ctx.save()
  roundedRect(ctx, width, height, mm(1.5))
  ctx.clip()
  ctx.fillStyle = note.color
  ctx.fillRect(0, 0, width, height)

  const face = assets.face
  if (face && face.naturalWidth > 0) {
    // object-fit: cover
    const k = Math.max(width / face.naturalWidth, height / face.naturalHeight)
    const w = face.naturalWidth * k, h = face.naturalHeight * k
    ctx.drawImage(face, (width - w) / 2, (height - h) / 2, w, h)
  }

  const horizontal = thread.direction === 'horizontal'
  const lengthMm = threadLength(note)
  const strip = horizontal
    ? { x: 0, y: mm(thread.positionMm - thread.widthMm / 2), w: mm(lengthMm), h: mm(thread.widthMm) }
    : { x: mm(thread.positionMm - thread.widthMm / 2), y: 0, w: mm(thread.widthMm), h: mm(lengthMm) }

  ctx.save()
  ctx.beginPath()
  if (thread.windows.enabled) {
    for (const section of fitSections(thread.windows.sections ?? [], lengthMm)) {
      const start = mm(section.startMm), end = mm(section.endMm)
      if (horizontal) ctx.rect(strip.x + start, strip.y, end - start, strip.h)
      else ctx.rect(strip.x, strip.y + start, strip.w, end - start)
    }
  } else {
    ctx.rect(strip.x, strip.y, strip.w, strip.h)
  }
  ctx.clip()
  ctx.translate(strip.x, strip.y)
  if (thread.backgroundColor) {
    ctx.fillStyle = thread.backgroundColor
    ctx.fillRect(0, 0, strip.w, strip.h)
  }

  const thickness = horizontal ? strip.h : strip.w
  const length = horizontal ? strip.w : strip.h
  const drawFrame = (index: number, opacity: number) => {
    const frame = frames.at(index)
    if (!frame) return
    ctx.globalAlpha = opacity
    if (frame.kind === 'color') {
      ctx.fillStyle = frame.color
      ctx.fillRect(0, 0, strip.w, strip.h)
    } else {
      const img = assets.frames.get(frame.id)
      if (img && img.naturalWidth > 0) {
        const { naturalPx, starts } = imageTiles(thickness, length, mm(thread.imageGapMm ?? 0), img.naturalHeight / img.naturalWidth, thread.direction)
        for (const start of starts) {
          if (horizontal) ctx.drawImage(img, start, 0, naturalPx, thickness)
          else ctx.drawImage(img, 0, start, thickness, naturalPx)
        }
      }
    }
    ctx.globalAlpha = 1
  }
  const mix = frameMix(angle, frameSpans(note), tilt.transition)
  drawFrame(mix.base, 1)
  if (mix.blend > 0 && mix.next !== mix.base) drawFrame(mix.next, mix.blend)

  const t = angle / TILT_LIMIT
  if (options.sheen) {
    // A highlight that travels down the thread's box as the note tilts, soft-light blended
    const at = (50 + t * 120) / 100
    const gradient = ctx.createLinearGradient(0, 0, 0, strip.h)
    const stop = (offset: number, color: string) => {
      if (offset >= 0 && offset <= 1) gradient.addColorStop(offset, color)
    }
    const clear = 'rgba(255,255,255,0)'
    const lerp = (edge: number) => `rgba(255,255,255,${0.7 * Math.max(0, 1 - Math.abs(edge - at) / 0.18)})`
    stop(0, lerp(0))
    stop(at - 0.18, clear)
    stop(at, 'rgba(255,255,255,0.7)')
    stop(at + 0.18, clear)
    stop(1, lerp(1))
    ctx.globalCompositeOperation = 'soft-light'
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, strip.w, strip.h)
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.restore()

  if (options.perspective && t !== 0) {
    // The note catches a little light or shade as it turns away from flat
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    if (t < 0) {
      gradient.addColorStop(0, `rgba(255,255,255,${-t * 0.12})`)
      gradient.addColorStop(1, `rgba(0,0,0,${-t * 0.08})`)
    } else {
      gradient.addColorStop(0, `rgba(0,0,0,${t * 0.08})`)
      gradient.addColorStop(1, `rgba(255,255,255,${t * 0.12})`)
    }
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }
  ctx.restore()
}

/**
 * Draws a flat face centred on (cx, cy), turned by rotateX(angle) under `perspective`. Each screen row
 * samples its source row, so the near edge widens and the far edge narrows like the CSS transform.
 */
export function drawTilted(ctx: Ctx, face: CanvasImageSource & { width: number; height: number }, cx: number, cy: number, angle: number, perspective: number) {
  const { width, height } = face
  if (angle === 0) {
    ctx.drawImage(face, cx - width / 2, cy - height / 2)
    return
  }
  const bounds = tiltedBounds(width, height, angle, perspective)
  const first = Math.floor(bounds.top), last = Math.ceil(bounds.bottom)
  for (let row = first; row < last; row++) {
    const y = sourceRow(row + 0.5, angle, perspective) + height / 2
    if (y < 0 || y >= height) continue
    const s = projectRow(y - height / 2, angle, perspective).scale
    const top = Math.max(row, bounds.top), bottom = Math.min(row + 1, bounds.bottom)
    // One source row stretched to fill this screen row
    ctx.drawImage(face, 0, Math.floor(y), width, 1, cx - (width / 2) * s, cy + top, width * s, bottom - top)
  }
}

export interface ExportCell {
  note: Note
  /** Centre of the note in the output, px */
  cx: number
  cy: number
}

/**
 * Banknotes side by side in a row, each in a cell wide and tall enough for its tilted shape at every angle,
 * centred vertically. Sizes are even, which video encoders need.
 */
export function exportLayout(notes: Note[], scale: number, angles: number[], perspective: boolean) {
  const margin = EXPORT_MARGIN_MM * scale
  const cells = notes.map((note) => {
    const width = note.widthMm * scale, height = note.heightMm * scale
    let top = -height / 2, bottom = height / 2, halfWidth = width / 2
    if (perspective) {
      for (const angle of angles) {
        const b = tiltedBounds(width, height, angle, perspectiveFor(note, scale))
        top = Math.min(top, b.top)
        bottom = Math.max(bottom, b.bottom)
        halfWidth = Math.max(halfWidth, b.halfWidth)
      }
    }
    return { note, top, bottom, halfWidth }
  })
  const above = Math.max(...cells.map((c) => -c.top))
  const below = Math.max(...cells.map((c) => c.bottom))
  let x = margin
  const placed: ExportCell[] = cells.map((c) => {
    const cx = x + c.halfWidth
    x = cx + c.halfWidth + margin
    return { note: c.note, cx, cy: margin + above }
  })
  const even = (value: number) => Math.ceil(value / 2) * 2
  return { width: even(x), height: even(margin * 2 + above + below), cells: placed }
}

/** Renders one export frame: the background, then every banknote at `angle` */
export function drawExportFrame(
  ctx: Ctx,
  layout: ReturnType<typeof exportLayout>,
  assets: Map<string, NoteAssets>,
  faces: Map<string, OffscreenCanvas>,
  scale: number,
  angle: number,
  options: { sheen: boolean; perspective: boolean; background?: string },
) {
  ctx.clearRect(0, 0, layout.width, layout.height)
  if (options.background) {
    ctx.fillStyle = options.background
    ctx.fillRect(0, 0, layout.width, layout.height)
  }
  ctx.imageSmoothingQuality = 'high'
  for (const cell of layout.cells) {
    const face = faces.get(cell.note.id)
    const noteAssets = assets.get(cell.note.id)
    if (!face || !noteAssets) continue
    const faceCtx = face.getContext('2d')!
    faceCtx.clearRect(0, 0, face.width, face.height)
    drawFace(faceCtx, cell.note, noteAssets, scale, angle, options)
    drawTilted(ctx, face, cell.cx, cell.cy, options.perspective ? angle : 0, perspectiveFor(cell.note, scale))
  }
}

/** Largest output side; hardware video encoders commonly stop at 4K */
export const MAX_EXPORT_PX = 3840

export function exportSize(notes: Note[], options: { scale: number; fps: number; loops: number; perspective: boolean; separate: boolean }) {
  if (notes.length === 0) return { width: 0, height: 0, seconds: 0 }
  const angles = playbackAngles(notes[0].tilt, options.fps, options.loops)
  const layouts = (options.separate ? notes.map((n) => [n]) : [notes]).map((group) => exportLayout(group, options.scale, angles, options.perspective))
  return { width: Math.max(...layouts.map((l) => l.width)), height: Math.max(...layouts.map((l) => l.height)), seconds: angles.length / options.fps }
}
