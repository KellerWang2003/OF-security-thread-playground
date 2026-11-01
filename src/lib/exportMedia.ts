import { zipSync } from 'fflate'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, getFirstEncodableVideoCodec } from 'mediabunny'
import { drawExportFrame, exportGroups, exportLayout, loadNoteAssets, playbackTilts, scaleForHeight, type NoteAssets } from './exportRender'
import type { Tilt2 } from './lens'
import type { Note } from './types'

export type ExportFormat = 'mp4' | 'gif'

export interface ExportOptions {
  format: ExportFormat
  notes: Note[]
  /** One file with the banknotes side by side, or one file per banknote */
  separate: boolean
  /** Output frame height in px; a very wide row may come out smaller to stay within 4K */
  height: number
  fps: number
  /** Passes of playback in a video; a GIF always loops forever */
  loops: number
  /** Omitted for a transparent GIF */
  background?: string
  sheen: boolean
  perspective: boolean
  /** Draws the visible frame's number on each thread, as the # toggle does on the canvas */
  frameNumbers?: boolean
}

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Banknote'

async function renderFile(notes: Note[], assets: Map<string, NoteAssets>, options: ExportOptions, onFrame: () => void, signal: AbortSignal) {
  // Every banknote shares the project-wide cycle and playback settings
  const angles = playbackTilts(notes[0], options.fps, options.format === 'gif' ? 1 : options.loops)
  const scale = scaleForHeight(notes, angles, options.perspective, options.height)
  const layout = exportLayout(notes, scale, angles, options.perspective)
  const canvas = new OffscreenCanvas(layout.width, layout.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: options.format === 'gif' })!
  const faces = new Map(notes.map((n) => [n.id, new OffscreenCanvas(Math.ceil(n.widthMm * scale), Math.ceil(n.heightMm * scale))]))
  const draw = (angle: Tilt2) => drawExportFrame(ctx, layout, assets, faces, scale, angle, options)

  if (options.format === 'gif') {
    const gif = GIFEncoder()
    const delay = Math.round(1000 / options.fps)
    const transparent = !options.background
    for (const angle of angles) {
      signal.throwIfAborted()
      draw(angle)
      const { data } = ctx.getImageData(0, 0, layout.width, layout.height)
      const format = transparent ? 'rgba4444' : 'rgb565'
      const palette = quantize(data, 256, { format, oneBitAlpha: transparent })
      const index = applyPalette(data, palette, format)
      const transparentIndex = transparent ? Math.max(0, palette.findIndex((c) => c[3] === 0)) : 0
      gif.writeFrame(index, layout.width, layout.height, { palette, delay, repeat: 0, transparent, transparentIndex, dispose: transparent ? 2 : -1 })
      onFrame()
      // Let the progress bar paint between frames; a message isn't throttled like a timer in a background tab
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = () => resolve()
        channel.port2.postMessage(null)
      })
    }
    gif.finish()
    return { blob: new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' }), extension: 'gif' }
  }

  const size = { width: layout.width, height: layout.height }
  const avc = await getFirstEncodableVideoCodec(['avc'], { ...size, quality: QUALITY_HIGH })
  const codec = avc ?? await getFirstEncodableVideoCodec(['vp9', 'vp8'], { ...size, quality: QUALITY_HIGH })
  if (!codec) throw new Error('This browser cannot encode video. Try GIF, or use Chrome, Edge or Safari.')
  const output = new Output({ format: avc ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() })
  const source = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH })
  output.addVideoTrack(source, { frameRate: options.fps })
  await output.start()
  try {
    for (const [i, angle] of angles.entries()) {
      signal.throwIfAborted()
      draw(angle)
      await source.add(i / options.fps, 1 / options.fps)
      onFrame()
    }
    await output.finalize()
  } catch (error) {
    await output.cancel()
    throw error
  }
  const buffer = output.target.buffer
  if (!buffer) throw new Error('The video could not be written.')
  return { blob: new Blob([buffer], { type: output.format.mimeType }), extension: avc ? 'mp4' : 'webm' }
}

/** Renders and encodes the export, reporting progress from 0 to 1. Resolves with the file to download. */
export async function exportTilt(projectName: string, options: ExportOptions, onProgress: (progress: number) => void, signal: AbortSignal) {
  const { notes } = options
  const assets = new Map(await Promise.all(notes.map(async (n) => [n.id, await loadNoteAssets(n)] as const)))
  const groups = exportGroups(notes, options.separate)
  const framesEach = playbackTilts(notes[0], options.fps, options.format === 'gif' ? 1 : options.loops).length
  const total = framesEach * groups.length
  let done = 0
  const files: { name: string; blob: Blob }[] = []
  for (const group of groups) {
    const { blob, extension } = await renderFile(group, assets, options, () => onProgress(++done / total), signal)
    files.push({ name: `${safeName(projectName)} - ${groups.length > 1 || notes.length === 1 ? safeName(group[0].name) : 'Banknotes'}.${extension}`, blob })
  }
  if (files.length === 1) return files[0]
  // Banknotes can share a name; number repeats so no file in the zip replaces another
  const used = new Map<string, number>()
  for (const file of files) {
    const count = (used.get(file.name) ?? 0) + 1
    used.set(file.name, count)
    if (count > 1) file.name = file.name.replace(/(\.\w+)$/, ` ${count}$1`)
  }
  // Video and GIF are already compressed, so store them as they are
  const entries = Object.fromEntries(await Promise.all(files.map(async (f) => [f.name, [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }] as const])))
  return { name: `${safeName(projectName)} - Banknotes.zip`, blob: new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }) }
}

export function downloadFile(file: { name: string; blob: Blob }) {
  const url = URL.createObjectURL(file.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
