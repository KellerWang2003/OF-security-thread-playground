import { RotateCcw } from 'lucide-react'
import { IconButton, LengthField } from '../components/controls'
import { THREAD_WIDTH } from '../lib/notes'
import { ALONG_STEP, REPEAT_LIMITS, patternOf, setRepeat } from '../lib/pattern'
import { updateNote } from '../lib/store'
import type { Note, ThreadPattern } from '../lib/types'
import type { NoteRef } from './frameActions'

type Field = { note: Note; noteRef: NoteRef; size?: 'default' | 'sm'; className?: string }

/**
 * How wide the thread is across the banknote: Width, as thread makers say it (Keller found Thickness unclear). On the
 * canvas's Thread tab and beside the thread in Thread Studio; a tile on Fit follows it
 */
export function ThreadWidthField({ note, noteRef, ...field }: Field) {
  return (
    <LengthField {...field} label="W" title="Thread width vertically, or height horizontally" value={note.thread.widthMm}
      min={THREAD_WIDTH.min} max={THREAD_WIDTH.max} step={THREAD_WIDTH.step}
      onChange={(widthMm) => updateNote(noteRef.projectId, noteRef.noteId, (n) => ({ ...n, thread: { ...n.thread, widthMm } }))} />
  )
}

const setPattern = (noteRef: NoteRef, change: (pattern: ThreadPattern) => ThreadPattern) =>
  updateNote(noteRef.projectId, noteRef.noteId, (n) => ({ ...n, pattern: change(patternOf(n)) }))

/**
 * The length of the tile the thread's artwork and sections repeat in: Tile length (Keller found Repeat every unclear).
 * On Fit, as new banknotes start, it follows the thread so its first image fills it back to back (`fitRepeat`); a
 * length typed or scrubbed turns Fit off, and `FitTileButton`, at its label's end, turns it back on. On the canvas's
 * Thread tab and beside the thread in Thread Studio
 */
export function TileLengthField({ note, noteRef, ...field }: Field) {
  return (
    <LengthField {...field} label="L" title="Length of one tile along the thread: the artwork and its sections repeat every tile"
      value={patternOf(note).repeatMm} min={REPEAT_LIMITS.min} max={REPEAT_LIMITS.max} step={ALONG_STEP}
      onChange={(repeatMm) => setPattern(noteRef, (p) => ({ ...setRepeat(p, repeatMm), fit: false }))} />
  )
}

/** ↺ Fit to the width: the tile follows the thread again; there is nothing to do while it already does */
export function FitTileButton({ note, noteRef }: Pick<Field, 'note' | 'noteRef'>) {
  return (
    <IconButton label="Fit to the width" size="icon-xs" className="-mr-1 size-5" disabled={!!patternOf(note).fit}
      onClick={() => setPattern(noteRef, (p) => ({ ...p, fit: true }))}>
      <RotateCcw />
    </IconButton>
  )
}
