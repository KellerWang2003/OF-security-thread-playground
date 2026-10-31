import type { Frame, Note, Project } from './types'

export const MIN_FRAMES = 2
export const MAX_FRAMES = 5
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
    color,
    thread: { widthMm: 4, xMm: widthMm / 2, surroundMm: 2, fit: 'stretch', tileMm: 10 },
    frames: [colorFrame(0), colorFrame(1)],
    tilt: { axis: 'vertical', rangeDeg: 30, transition: 0 },
  }
}

export function createProject(name: string): Project {
  const now = Date.now()
  return { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now, notes: [] }
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
      ? [{ id: crypto.randomUUID(), name: `${note.widthMm} × ${note.heightMm}`, x: 0, y: 0, ...note, thread, frames, tilt }]
      : []
  // Notes saved before the canvas had no position: lay them out in a row
  const placed: Note[] = []
  for (const n of notes) placed.push(Number.isFinite(n.x) && Number.isFinite(n.y) ? n : { ...n, ...nextNotePosition(placed) })
  return { ...rest, notes: placed }
}
