import { create } from 'zustand'

/**
 * Where each banknote's print lands along its thread, mm: the print isn't registered to the banknote, so this
 * previews one landing. Remembered per browser, by banknote, and never saved in the project or undone: it isn't
 * part of the design, and other people previewing the same project pick their own.
 */
const KEY = 'of-playground.pattern-offsets'

function load(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    if (saved && typeof saved === 'object') {
      return Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])))
    }
  } catch { /* storage blocked or damaged: start at no offset */ }
  return {}
}

export const usePatternOffsets = create<{ offsets: Record<string, number> }>(() => ({ offsets: load() }))

/** Kept as typed, in any unit (to a millionth of a mm, without float dust) */
export function setPatternOffset(noteId: string, mm: number) {
  usePatternOffsets.setState((s) => ({ offsets: { ...s.offsets, [noteId]: Math.round(mm * 1e6) / 1e6 } }))
  try {
    localStorage.setItem(KEY, JSON.stringify(usePatternOffsets.getState().offsets))
  } catch { /* storage blocked: the offset lasts until reload */ }
}

/** A random landing within one repeat, to the nearest 0.1 mm, never the one shown now */
export function shufflePatternOffset(noteId: string, repeatMm: number) {
  const steps = Math.max(1, Math.round(repeatMm * 10))
  const now = Math.round((usePatternOffsets.getState().offsets[noteId] ?? 0) * 10) % steps
  const pick = steps > 1 ? (now + 1 + Math.floor(Math.random() * (steps - 1))) % steps : 0
  setPatternOffset(noteId, pick / 10)
}
