import type { Note, NoteBack } from './types'

/**
 * The banknote's back (Keller, 3 November): its own background, shown when the banknotes are turned over. They turn
 * side to side, as a page does, so what lies in the paper and shows from both sides, the watermark, is mirrored left to
 * right there. The thread and magnetic ink are only on the front.
 */

export type Side = 'front' | 'back'

/**
 * The paper every banknote is printed on, very light grey: what a side without a design shows, front or back, and what
 * shows through a design's transparent parts. Banknotes have no background colour of their own (Keller, 4 November:
 * "they have to use the design"); a colour saved before stays in its save but no longer shows
 */
export const PAPER = '#E5E5E5'

/** The back as saved, or on a banknote whose back was never set, plain paper */
export const backOf = (note: Pick<Note, 'back' | 'color'>): NoteBack => note.back ?? { background: 'solid', color: note.color }

/** Where a box on the banknote lies seen from its back: left and right swap, as the banknote turns over side to side */
export const mirrored = <T extends { xMm: number; widthMm: number }>(box: T, note: Pick<Note, 'widthMm'>): T =>
  ({ ...box, xMm: note.widthMm - box.xMm - box.widthMm })

/**
 * The banknote with one side's background in its own fields (`background`, `color`, `faceImageId`), for what reads the
 * design a side shows: the continuous check and the checks. Its watermark stays where it is on the front.
 */
export function designFace(note: Note, side: Side): Note {
  if (side === 'front') return note
  const back = backOf(note)
  return { ...note, background: back.background, color: back.color, faceImageId: back.imageId }
}

/** The design a side shows, when it is an uploaded image */
export function sideImageId(note: Pick<Note, 'background' | 'faceImageId' | 'back' | 'color'>, side: Side) {
  const face = side === 'front' ? { background: note.background, imageId: note.faceImageId } : backOf(note)
  return face.background === 'image' ? face.imageId : undefined
}

const HEX = /^#[0-9a-f]{6}$/i

/** A saved back, kept as it was; undefined for none or a damaged one, which shows the front's paper again */
export function fitBack(raw: unknown): NoteBack | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const { background, color, imageId } = raw as Partial<NoteBack>
  if (typeof color !== 'string' || !HEX.test(color)) return undefined
  const image = typeof imageId === 'string' && imageId ? { imageId } : {}
  return { background: background === 'image' && 'imageId' in image ? 'image' : 'solid', color, ...image }
}
