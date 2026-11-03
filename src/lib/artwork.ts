import { REPEAT_LIMITS, isFull, patternOf, setRepeat } from './pattern'
import type { Frame, ImagePlace, Note, ThreadPattern, ThreadSettings } from './types'

/** How long an image is along the thread when it spans `acrossMm` of the thread's thickness, upright on the banknote */
export const alongOf = (acrossMm: number, aspect: number, direction: ThreadSettings['direction']) =>
  direction === 'vertical' ? acrossMm * aspect : acrossMm / aspect

/** Steps for placing an image on the thread, mm: finer than the window and watermark editors, as a thread is a few mm thick */
export const IMAGE_STEP = 0.1

/** The image's top-left corner in the repeat and its width, mm, upright on the banknote as it is drawn */
export function uprightBox(box: ImageBox, direction: ThreadSettings['direction']) {
  return direction === 'vertical'
    ? { x: box.across, y: box.along, width: box.acrossSize, height: box.alongSize }
    : { x: box.along, y: box.across, width: box.alongSize, height: box.acrossSize }
}

/** The place an upright box (mm, in the repeat) gives an image on a thread `thicknessMm` thick */
export function placeOf(upright: { x: number; y: number; width: number; height: number }, thicknessMm: number, direction: ThreadSettings['direction']) {
  const vertical = direction === 'vertical'
  return {
    alongMm: vertical ? upright.y : upright.x,
    across: (vertical ? upright.x : upright.y) / thicknessMm,
    size: (vertical ? upright.width : upright.height) / thicknessMm,
  }
}

/** An image's box in one repeat, mm: its near end along the repeat, its near edge across the thread, and its size both ways */
export interface ImageBox {
  along: number
  across: number
  alongSize: number
  acrossSize: number
}

/**
 * Where a frame's image sits in the repeat, mm. Without a saved place it fits the repeat: as thick as the thread, or
 * smaller where the repeat is shorter than the image, and centred both ways.
 */
export function imageBox(place: ImagePlace | undefined, aspect: number, repeatMm: number, thicknessMm: number, direction: ThreadSettings['direction']): ImageBox {
  if (place) {
    const acrossSize = place.size * thicknessMm
    return { along: place.alongMm, across: place.across * thicknessMm, alongSize: alongOf(acrossSize, aspect, direction), acrossSize }
  }
  const full = alongOf(thicknessMm, aspect, direction)
  const k = full > repeatMm ? repeatMm / full : 1
  const acrossSize = thicknessMm * k, alongSize = full * k
  return { along: (repeatMm - alongSize) / 2, across: (thicknessMm - acrossSize) / 2, alongSize, acrossSize }
}

/**
 * Where each copy of an image starts along a stretch of thread `lengthMm` long whose repeat starts `offsetMm` from
 * its start, mm: one copy per repeat, every one that shows. Copies are never cut at the repeat's seams, so an image
 * moved past the end of the repeat carries on into the next one.
 */
export function copyStarts(box: ImageBox, repeatMm: number, offsetMm: number, lengthMm: number): number[] {
  const at = offsetMm + box.along
  const first = Math.floor((-box.alongSize - at) / repeatMm) + 1
  const last = Math.ceil((lengthMm - at) / repeatMm) - 1
  const starts: number[] = []
  for (let k = first; k <= last; k++) starts.push(at + k * repeatMm)
  return starts
}

/** A pattern nobody has drawn on: one section over the whole repeat, every section playing the banknote's lens */
export const untouched = (pattern: ThreadPattern) =>
  pattern.sections.length === 1 && isFull(pattern.sections[0], pattern.repeatMm) && !pattern.mixed

/** A repeat just long enough for an image as thick as the thread, and `gapMm` more */
export const repeatFor = (aspect: number, thread: Pick<ThreadSettings, 'widthMm' | 'direction'>, gapMm = 0) =>
  Math.min(REPEAT_LIMITS.max, Math.max(REPEAT_LIMITS.min, alongOf(thread.widthMm, aspect, thread.direction) + gapMm))

/**
 * The pattern once `frames` replace the note's frames: a thread nobody has drawn sections on takes its repeat from
 * its first image, as soon as it has one, so the image repeats back to back as before.
 */
export function patternForFrames(note: Pick<Note, 'pattern' | 'frames' | 'thread'>, frames: Frame[]): ThreadPattern | undefined {
  const pattern = patternOf(note)
  const first = frames.find((f) => f.kind === 'image' && f.aspect)
  const hadImage = note.frames.some((f) => f.kind === 'image')
  if (!first?.aspect || hadImage || !untouched(pattern)) return note.pattern
  return setRepeat(pattern, repeatFor(first.aspect, note.thread))
}

/** Images added before frames recorded their proportions: they are read once, then the banknote is settled */
export const needsSettling = (note: Note) => note.frames.some((f) => f.kind === 'image' && !!f.imageId && !f.aspect)

/**
 * The banknote with its images' proportions filled in (`aspects`, by image id). A thread from before images sat in
 * the repeat (it still has `imageGapMm`) and has no sections drawn takes its repeat from its first image and the old
 * gap, with every image at the start of the repeat and as thick as the thread, so it looks as it did; one with
 * sections keeps its repeat, and its images fit it. Either way the old gap goes.
 */
export function settleArtwork(note: Note, aspects: Map<string, number>): Note {
  const frames = note.frames.map((f) => {
    const aspect = f.kind === 'image' && !f.aspect && f.imageId ? aspects.get(f.imageId) : undefined
    return aspect ? { ...f, aspect } : f
  })
  const { imageGapMm, ...thread } = note.thread
  if (imageGapMm === undefined) return { ...note, frames }
  const first = frames.find((f) => f.kind === 'image' && f.aspect)
  const pattern = patternOf(note)
  if (!first?.aspect || !untouched(pattern)) return { ...note, frames, thread }
  return {
    ...note,
    thread,
    frames: frames.map((f) => (f.kind === 'image' && !f.place ? { ...f, place: { alongMm: 0, across: 0, size: 1 } } : f)),
    pattern: setRepeat(pattern, repeatFor(first.aspect, thread, imageGapMm)),
  }
}
