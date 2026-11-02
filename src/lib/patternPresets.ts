import { clamp } from './frames'
import { FLAT, lensMix, lensState, type LensEffect } from './lens'
import { defaultPattern, patternOf, pickLens, trackFor } from './pattern'
import { switchEffect } from './switchEffect'
import { fitSections, threadLength } from './thread'
import type { Note, SectionLens, ThreadPattern, TiltSettings } from './types'

/**
 * The classic layouts, set up for the banknote's own frames and lens. Each keeps the banknote's flat, Cycle and
 * directions; the sections get the effects the layout needs.
 */
export type PresetKind = 'single' | 'split' | 'alternate' | 'chevron'
export const PATTERN_PRESETS: { value: PresetKind; label: string; title: string }[] = [
  { value: 'single', label: 'Single lens', title: 'One ridge angle over the whole thread' },
  { value: 'split', label: 'Split band', title: 'Two lanes the whole length: one plays side to side, one up and down' },
  { value: 'alternate', label: 'Alternating', title: 'Full-width blocks along the thread, ridges alternating 0° and 90°' },
  { value: 'chevron', label: 'Chevron lock', title: 'Halves at +45° and −45°: together on up/down, opposite ways side to side' },
]

export type PresetNote = Pick<Note, 'frames' | 'tilt' | 'pattern' | 'thread' | 'widthMm' | 'heightMm'>

/** A section lens: the banknote's lens switched to `effect`, as switching the effect in the panel would */
function lensFor(note: PresetNote, effect: LensEffect, extra: Partial<TiltSettings> = {}): SectionLens {
  return pickLens({ ...note.tilt, ...switchEffect(note.tilt, lensState(note.tilt, note.frames), effect), ...extra })
}

/** Three frames around the one seen flat, held at the ends: the side-to-side story, so the other tilt keeps two frames hidden */
function middleStory(note: PresetNote) {
  const count = note.frames.length
  if (count <= 3) return undefined
  const rest = lensMix(note, FLAT).current
  const lo = clamp(rest - 1, 0, count - 3)
  return trackFor(note.frames, note.frames.map((_, i) => clamp(i, lo, lo + 2)))
}

/** Half the shortest window, whole mm from 2 to 8, so every window holds both blocks wherever the print lands */
function alternatingRepeat(note: PresetNote) {
  const windows = note.thread.windows.enabled ? fitSections(note.thread.windows.sections ?? [], threadLength(note)) : []
  const shortest = Math.min(...windows.map((w) => w.endMm - w.startMm))
  return clamp(Number.isFinite(shortest) ? Math.floor(shortest / 2) : Math.round(patternOf(note).repeatMm), 2, 8)
}

export function presetPattern(note: PresetNote, kind: PresetKind): ThreadPattern {
  const repeat = patternOf(note).repeatMm
  const id = () => crypto.randomUUID()
  const lanes = { startMm: 0, endMm: repeat }
  switch (kind) {
    case 'split':
      return { repeatMm: repeat, mixed: true, sections: [
        { id: id(), name: 'Lane ↔', ...lanes, acrossStart: 0, acrossEnd: 0.5, lens: lensFor(note, 'side'), track: middleStory(note) },
        { id: id(), name: 'Lane ↕', ...lanes, acrossStart: 0.5, acrossEnd: 1, lens: lensFor(note, 'updown') },
      ] }
    case 'alternate': {
      const r = alternatingRepeat(note)
      return { repeatMm: r, mixed: true, sections: [
        { id: id(), name: 'Block ↕', startMm: 0, endMm: r / 2, acrossStart: 0, acrossEnd: 1, lens: lensFor(note, 'updown') },
        { id: id(), name: 'Block ↔', startMm: r / 2, endMm: r, acrossStart: 0, acrossEnd: 1, lens: lensFor(note, 'side'), track: middleStory(note) },
      ] }
    }
    case 'chevron': {
      // Ridges lean one way when 1 → 5 runs the same way on both tilts (`lensAngle`): one arm each way
      const down = lensState(note.tilt, note.frames).dirY < 0
      return { repeatMm: repeat, mixed: true, sections: [
        { id: id(), name: 'Arm /', ...lanes, acrossStart: 0, acrossEnd: 0.5, lens: lensFor(note, 'both', { runX: down ? 'left' : 'right' }) },
        { id: id(), name: 'Arm \\', ...lanes, acrossStart: 0.5, acrossEnd: 1, lens: lensFor(note, 'both', { runX: down ? 'right' : 'left' }) },
      ] }
    }
    default:
      return defaultPattern(repeat)
  }
}
