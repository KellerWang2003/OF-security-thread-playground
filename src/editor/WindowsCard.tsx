import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { IconButton, ScrubField } from '../components/controls'
import { updateNote } from '../lib/store'
import { newWindow, sectionBounds, threadLength as lengthOf, WINDOW_STEP } from '../lib/thread'
import type { Note } from '../lib/types'
import type { NoteRef } from './frameActions'

const format = (mm: number) => (Math.round(mm * 10) / 10).toString()

/**
 * The thread's windows as a compact card: a switch (off = continuous), a strip showing where the windows sit
 * along the thread, and the selected window's Start/End. The full list opens on demand.
 */
export function WindowsCard({ note, noteRef, selectedWindowId, onWindowSelect }: {
  note: Note
  noteRef: NoteRef
  selectedWindowId?: string
  onWindowSelect: (id: string | undefined) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { windows } = note.thread
  const length = lengthOf(note)
  const setWindows = (patch: Partial<Note['thread']['windows']>) =>
    updateNote(noteRef.projectId, noteRef.noteId, (n) => ({ ...n, thread: { ...n.thread, windows: { ...n.thread.windows, ...patch } } }))
  const selected = windows.sections.find((s) => s.id === selectedWindowId)
  const selectedIndex = selected ? windows.sections.indexOf(selected) : -1
  const bounds = sectionBounds(windows.sections, selectedWindowId ?? '', length)
  const minimum = selected ? Math.min(WINDOW_STEP, selected.endMm - selected.startMm) : WINDOW_STEP
  const updateSelected = (patch: { startMm?: number; endMm?: number }) =>
    setWindows({ sections: windows.sections.map((s) => s.id === selectedWindowId ? { ...s, ...patch } : s) })
  const canAdd = !!newWindow(windows.sections, length)

  const addWindow = () => {
    const section = newWindow(windows.sections, length)
    if (!section) return
    setWindows({ sections: [...windows.sections, section].toSorted((a, b) => a.startMm - b.startMm) })
    onWindowSelect(section.id)
  }
  // Turning windows on shows the first one ready to adjust, adding one when there are none
  const setWindowed = (enabled: boolean) => {
    if (!enabled) {
      setWindows({ enabled })
      onWindowSelect(undefined)
      return
    }
    const first = windows.sections.at(0) ?? newWindow([], length)
    setWindows({ enabled, sections: windows.sections.length ? windows.sections : first ? [first] : [] })
    if (first) onWindowSelect(first.id)
  }
  const remove = (id: string) => {
    setWindows({ sections: windows.sections.filter((s) => s.id !== id) })
    onWindowSelect(undefined)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-2">
      <div className="flex h-6 items-center gap-1">
        <span className="flex-1 pl-0.5 text-xs">Windows</span>
        {windows.enabled && (
          <>
            {selected && <IconButton label="Delete window" size="icon-xs" onClick={() => remove(selected.id)}><Trash2 /></IconButton>}
            <IconButton label="Add window" size="icon-xs" disabled={!canAdd} onClick={addWindow}><Plus /></IconButton>
            <IconButton label={expanded ? 'Hide windows' : 'Show all windows'} size="icon-xs" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
            </IconButton>
          </>
        )}
        <Switch aria-label="Windows" checked={windows.enabled} onCheckedChange={setWindowed} />
      </div>

      {windows.enabled && (
        <div className="relative h-5 overflow-hidden rounded-sm bg-background"
          title={note.thread.direction === 'vertical' ? 'Windows from the top of the banknote' : 'Windows from the left of the banknote'}>
          {windows.sections.map((section, i) => {
            const on = section.id === selectedWindowId
            return (
              <Button key={section.id} variant="ghost" aria-pressed={on} aria-label={`Window ${i + 1}, ${format(section.startMm)}–${format(section.endMm)} mm`}
                className={cn('absolute inset-y-0.5 h-auto min-w-1 rounded-[3px] p-0 active:translate-y-0',
                  on ? 'bg-primary hover:bg-primary' : 'bg-foreground/25 hover:bg-foreground/40')}
                style={{ left: `${(section.startMm / length) * 100}%`, width: `${((section.endMm - section.startMm) / length) * 100}%` }}
                onClick={() => onWindowSelect(on ? undefined : section.id)} />
            )
          })}
        </div>
      )}

      {windows.enabled && expanded && (
        <div className="flex flex-col">
          {windows.sections.map((section, i) => {
            const on = section.id === selectedWindowId
            return (
              <Button key={section.id} variant="ghost" size="sm" aria-pressed={on} aria-label={`Window ${i + 1}: ${format(section.startMm)}–${format(section.endMm)} mm`}
                className={cn('h-7 justify-between px-1.5 font-normal', on ? 'bg-background hover:bg-background' : 'hover:bg-background/60')}
                onClick={() => onWindowSelect(on ? undefined : section.id)}>
                <span>Window {i + 1}</span>
                <span className="text-muted-foreground tabular-nums">{format(section.startMm)}–{format(section.endMm)} mm</span>
              </Button>
            )
          })}
        </div>
      )}

      {windows.enabled && selected && (
        <div className="grid grid-cols-2 gap-1.5">
            <ScrubField label="Start" title={`Window ${selectedIndex + 1}: visible section starts here`} value={selected.startMm} min={bounds.min} max={selected.endMm - minimum} step={WINDOW_STEP} unit="mm" onChange={(startMm) => updateSelected({ startMm })} />
            <ScrubField label="End" title={`Window ${selectedIndex + 1}: visible section ends here`} value={selected.endMm} min={selected.startMm + minimum} max={bounds.max} step={WINDOW_STEP} unit="mm" onChange={(endMm) => updateSelected({ endMm })} />
        </div>
      )}
    </div>
  )
}
