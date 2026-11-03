import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { IconButton, LengthField } from '../components/controls'
import { updateNote } from '../lib/store'
import { newWindow, sectionBounds, threadLength as lengthOf, WINDOW_STEP } from '../lib/thread'
import type { Note, ThreadWindow } from '../lib/types'
import { lengthIn, useLengthUnit, type LengthUnit } from '../lib/units'
import type { NoteRef } from './frameActions'

/** Where a window runs, in the unit lengths are read in: "12.5–20.5 mm" */
const span = (section: ThreadWindow, unit: LengthUnit) => `${lengthIn(section.startMm, unit)}–${lengthIn(section.endMm, unit)} ${unit}`

/**
 * The thread's windows as a compact card: a switch (off = continuous, as new banknotes start), a strip showing where
 * the windows sit along the thread, and the selected window's Start/End. The full list opens on demand.
 */
export function WindowsCard({ note, noteRef, selectedWindowId, onWindowSelect, tip = false, onTipDone }: {
  note: Note
  noteRef: NoteRef
  selectedWindowId?: string
  onWindowSelect: (id: string | undefined) => void
  /** A tip beside the card saying windows can be added here (a new project's first banknote, Keller), until `onTipDone` */
  tip?: boolean
  /** The next click or key anywhere ends the tip */
  onTipDone?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const unit = useLengthUnit((s) => s.unit)
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
  useEffect(() => {
    if (!tip || !onTipDone) return
    window.addEventListener('pointerdown', onTipDone, true)
    window.addEventListener('keydown', onTipDone, true)
    return () => {
      window.removeEventListener('pointerdown', onTipDone, true)
      window.removeEventListener('keydown', onTipDone, true)
    }
  }, [tip, onTipDone])

  return (
    <div className="relative flex flex-col gap-2 rounded-lg bg-muted/50 p-2">
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
              <Button key={section.id} variant="ghost" aria-pressed={on} aria-label={`Window ${i + 1}, ${span(section, unit)}`}
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
              <Button key={section.id} variant="ghost" size="sm" aria-pressed={on} aria-label={`Window ${i + 1}: ${span(section, unit)}`}
                className={cn('h-7 justify-between px-1.5 font-normal', on ? 'bg-background hover:bg-background' : 'hover:bg-background/60')}
                onClick={() => onWindowSelect(on ? undefined : section.id)}>
                <span>Window {i + 1}</span>
                <span className="text-muted-foreground tabular-nums">{span(section, unit)}</span>
              </Button>
            )
          })}
        </div>
      )}

      {windows.enabled && selected && (
        <div className="grid grid-cols-2 gap-1.5">
            <LengthField label="Start" title={`Window ${selectedIndex + 1}: visible section starts here`} value={selected.startMm} min={bounds.min} max={selected.endMm - minimum} step={WINDOW_STEP} onChange={(startMm) => updateSelected({ startMm })} />
            <LengthField label="End" title={`Window ${selectedIndex + 1}: visible section ends here`} value={selected.endMm} min={selected.startMm + minimum} max={bounds.max} step={WINDOW_STEP} onChange={(endMm) => updateSelected({ endMm })} />
        </div>
      )}

      {/* Anchored to a box over the card rather than the card itself, so the card stays as it is when the tip goes and
          the click that ends it still lands (on the switch, say) */}
      {tip && (
        <Tooltip open>
          <TooltipTrigger render={<span aria-hidden className="pointer-events-none absolute inset-0" />} />
          {/* Past the panel's inset, so it sits over the canvas with its arrow at the card */}
          <TooltipContent side="left" sideOffset={22}>You can add windows here</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
