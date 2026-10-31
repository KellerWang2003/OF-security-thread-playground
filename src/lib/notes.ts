import type { Frame, NotePresetId, NoteSettings, Project } from './types'

/** The Flight series notes chosen for the studio (specs/denomination-spec.md) */
export const NOTE_PRESETS: {
  id: Exclude<NotePresetId, 'custom'>
  label: string
  widthMm: number
  heightMm: number
  color: string
}[] = [
  { id: '0.2', label: '0.2', widthMm: 68, heightMm: 120, color: '#E8743B' },
  { id: '25', label: '25', widthMm: 68, heightMm: 134, color: '#8A4F9E' },
  { id: '10000', label: '10,000', widthMm: 68, heightMm: 148, color: '#121A3A' },
]

export const MIN_FRAMES = 2
export const MAX_FRAMES = 5
export const THREAD_WIDTH = { min: 3, max: 6, step: 0.5 }
export const FRAME_COLORS = ['#D9A441', '#2E9C8F', '#C2456B', '#4A6FD1', '#7C4DBA']

export function presetNote(id: Exclude<NotePresetId, 'custom'>): NoteSettings {
  const preset = NOTE_PRESETS.find((p) => p.id === id) ?? NOTE_PRESETS[1]
  return { preset: preset.id, widthMm: preset.widthMm, heightMm: preset.heightMm, color: preset.color }
}

/** The spec puts the thread just right of centre */
export const defaultThreadX = (noteWidthMm: number) => Math.round((noteWidthMm / 2 + 6) * 2) / 2

export function colorFrame(index: number): Frame {
  return {
    id: crypto.randomUUID(),
    kind: 'color',
    color: FRAME_COLORS[index % FRAME_COLORS.length],
    name: `Colour ${index + 1}`,
  }
}

export function createProject(name: string, note: NoteSettings): Project {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    note,
    thread: { widthMm: 4, xMm: defaultThreadX(note.widthMm), surroundMm: 2, fit: 'stretch', tileMm: 10 },
    frames: [colorFrame(0), colorFrame(1)],
    tilt: { axis: 'vertical', rangeDeg: 30, transition: 0 },
  }
}
