import { DEFAULT_PLAYBACK, playbackSettings } from './playback'
import { migrateWindows, threadLength } from './thread'
import type { Frame, Note, Project, TiltSettings } from './types'

export const MIN_FRAMES = 2
export const MAX_FRAMES = 5
/** Timeline length of a new frame, in the timeline's own units */
export const DEFAULT_LENGTH = 10
export const LENGTH_LIMITS = { min: 1, max: 100 }
export const CYCLE_LIMITS = { min: 2, max: 600 }
export const DEFAULT_TILT: TiltSettings = { ...DEFAULT_PLAYBACK, cycleDeg: 30, transition: 0, effect: 'updown', runY: 'down', runX: 'right' }
export const THREAD_WIDTH = { min: 3, max: 6, step: 0.5 }
export const NOTE_SIZE = { min: 20, max: 250 }
export const FRAME_COLORS = ['#D9A441', '#2E9C8F', '#C2456B', '#4A6FD1', '#7C4DBA']
export const DEFAULT_NOTE = { widthMm: 150, heightMm: 70, color: '#5B6B8C' }
/** Space left between notes when they are placed on the canvas */
export const NOTE_GAP = 20

/** Where a new note goes: to the right of everything already on the canvas */
export function nextNotePosition(notes: Pick<Note, 'x' | 'y' | 'widthMm'>[]) {
  if (notes.length === 0) return { x: 0, y: 0 }
  return { x: Math.max(...notes.map((n) => n.x + n.widthMm)) + NOTE_GAP, y: Math.min(...notes.map((n) => n.y)) }
}

export function colorFrame(index: number): Frame {
  return {
    id: crypto.randomUUID(),
    kind: 'color',
    color: FRAME_COLORS[index % FRAME_COLORS.length],
    name: `Colour ${index + 1}`,
    length: DEFAULT_LENGTH,
  }
}

export function createNote({
  name,
  x,
  y,
  widthMm,
  heightMm,
  color,
}: {
  name: string
  x: number
  y: number
  widthMm: number
  heightMm: number
  color: string
}): Note {
  return {
    id: crypto.randomUUID(),
    name,
    x,
    y,
    widthMm,
    heightMm,
    background: 'solid',
    color,
    thread: { widthMm: 4, direction: 'vertical', positionMm: widthMm / 2, imageGapMm: 0, windows: migrateWindows(undefined, heightMm) },
    frames: [colorFrame(0), colorFrame(1)],
    tilt: DEFAULT_TILT,
  }
}

export function createProject(name: string): Project {
  const now = Date.now()
  return { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now, notes: [] }
}

const spanOf = (f: Frame) => (f as { spanDeg?: number }).spanDeg

/** A frame saved with a degree span gets a timeline length in the same proportion, averaging the default */
function oldLength(frames: Frame[], frame: Frame) {
  const spans = frames.map(spanOf)
  const known = spans.filter((s) => s !== undefined)
  const span = spanOf(frame)
  if (span === undefined || known.length === 0) return DEFAULT_LENGTH
  const mean = known.reduce((total, s) => total + s, 0) / known.length
  return Math.max(LENGTH_LIMITS.min, Math.round((span / mean) * DEFAULT_LENGTH))
}

/** The optional lens settings, kept as saved; a project from before lenses has none and stays Up/down */
function lensFields(tilt: TiltSettings): Partial<TiltSettings> {
  const keys = ['effect', 'cycleXDeg', 'yOn', 'runY', 'runX', 'viewDeg', 'revealAxis', 'playTilt'] as const
  return Object.fromEntries(keys.filter((k) => tilt[k] !== undefined).map((k) => [k, tilt[k]]))
}

/** Projects saved before notes existed held a single note's settings at the top level */
export function migrateProject(raw: unknown): Project {
  const p = raw as Project & {
    note?: { widthMm: number; heightMm: number; color: string; faceImageId?: string }
    thread?: Note['thread']
    frames?: Frame[]
    tilt?: Note['tilt']
  }
  const { note, thread, frames, tilt, ...rest } = p
  const notes: Note[] = Array.isArray(p.notes)
    ? p.notes
    : note && thread && frames && tilt
      ? [{ id: crypto.randomUUID(), name: `${note.widthMm} × ${note.heightMm}`, x: 0, y: 0, background: 'solid' as const, ...note, thread, frames, tilt }]
      : []
  // Notes saved before the canvas had no position: lay them out in a row
  const placed: Note[] = []
  for (const raw of notes) {
    // Older notes had no background mode; an uploaded face meant an image background
    const n: Note = {
      ...raw,
      background: raw.background ?? (raw.faceImageId ? 'image' : 'solid'),
      // Older frames had degree spans, or split one shared range equally: keep their proportions and cycle
      frames: raw.frames.map((f) => ({ ...f, length: f.length ?? oldLength(raw.frames, f) })),
      tilt: {
        ...playbackSettings(raw.tilt),
        ...lensFields(raw.tilt),
        transition: raw.tilt.transition,
        cycleDeg:
          raw.tilt.cycleDeg ??
          (raw.frames.every((f) => (f as { spanDeg?: number }).spanDeg !== undefined)
            ? raw.frames.reduce((total, f) => total + ((f as { spanDeg?: number }).spanDeg ?? 0), 0)
            : 2 * ((raw.tilt as { rangeDeg?: number }).rangeDeg ?? 15)),
      },
      thread: {
        // Threads without an explicit background let the banknote show through.
        backgroundColor: raw.thread.backgroundColor,
        widthMm: raw.thread.widthMm,
        direction: raw.thread.direction ?? 'vertical',
        positionMm: raw.thread.positionMm ?? (raw.thread as { xMm?: number }).xMm ?? raw.widthMm / 2,
        // Retire the old cropping length; existing artwork now repeats whole, with no gap.
        imageGapMm: Math.max(0, raw.thread.imageGapMm ?? 0),
        windows: migrateWindows(raw.thread.windows, threadLength({ ...raw, thread: { direction: raw.thread.direction ?? 'vertical' } })),
      },
    }
    placed.push(Number.isFinite(n.x) && Number.isFinite(n.y) ? n : { ...n, ...nextNotePosition(placed) })
  }
  return { ...rest, notes: placed }
}
