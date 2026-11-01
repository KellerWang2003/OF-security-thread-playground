import { reportError } from '../cloud/notices'
import { Download, ImageUp, Plus, RectangleHorizontal, RectangleVertical, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { ColorField, Group, IconButton, Panel, ScrubField, Section, Segmented, SwitchField } from '../components/controls'
import { clamp } from '../lib/frames'
import { pickFiles, useImageUrl } from '../lib/images'
import { NOTE_SIZE, THREAD_WIDTH } from '../lib/notes'
import { updateNote } from '../lib/store'
import { fitSections, newWindow, sectionBounds, WINDOW_STEP } from '../lib/thread'
import type { Note } from '../lib/types'
import { EffectSection } from './EffectSection'
import { setFaceImage, type NoteRef } from './frameActions'

type Change = (note: Note) => Note

/** Right: the selected note's properties, Figma style */
export function Inspector({ note, noteRef, selectedWindowId, onWindowSelect, onExport }: {
  note: Note
  onExport: () => void
  noteRef: NoteRef
  selectedWindowId?: string
  /** Selecting a window edits it on the canvas; undefined leaves window editing */
  onWindowSelect: (id: string | undefined) => void
}) {
  const update = (change: Change) => updateNote(noteRef.projectId, noteRef.noteId, change)
  const { thread } = note
  const threadLength = thread.direction === 'vertical' ? note.heightMm : note.widthMm
  const setThread = (patch: Partial<Note['thread']>) => update((n) => ({ ...n, thread: { ...n.thread, ...patch } }))
  const { windows } = thread
  const setWindows = (patch: Partial<Note['thread']['windows']>) =>
    update((n) => ({ ...n, thread: { ...n.thread, windows: { ...n.thread.windows, ...patch } } }))
  const selectedWindow = windows.sections.find((s) => s.id === selectedWindowId)
  const bounds = sectionBounds(windows.sections, selectedWindowId ?? '', threadLength)
  const updateWindow = (patch: { startMm?: number; endMm?: number }) =>
    setWindows({ sections: windows.sections.map((s) => s.id === selectedWindowId ? { ...s, ...patch } : s) })
  const format = (mm: number) => (Math.round(mm * 10) / 10).toString()
  const addWindow = () => {
    const section = newWindow(windows.sections, threadLength)
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
    const first = windows.sections.at(0) ?? newWindow([], threadLength)
    setWindows({ enabled, sections: windows.sections.length ? windows.sections : first ? [first] : [] })
    if (first) onWindowSelect(first.id)
  }
  const acrossOf = (n: Pick<Note, 'widthMm' | 'heightMm'>, direction: Note['thread']['direction']) =>
    direction === 'vertical' ? n.widthMm : n.heightMm
  const setSize = (widthMm: number, heightMm: number) =>
    update((n) => ({
      ...n,
      widthMm,
      heightMm,
      thread: { ...n.thread, positionMm: clamp(n.thread.positionMm, 0, acrossOf({ widthMm, heightMm }, n.thread.direction)),
        windows: { ...n.thread.windows, sections: fitSections(n.thread.windows.sections, n.thread.direction === 'vertical' ? heightMm : widthMm) } },
    }))
  // Turning the thread keeps it at the same relative position across the note
  const setDirection = (direction: Note['thread']['direction']) =>
    update((n) => ({
      ...n,
      thread: {
        ...n.thread,
        direction,
        windows: { ...n.thread.windows, sections: fitSections(n.thread.windows.sections, direction === 'vertical' ? n.heightMm : n.widthMm) },
        positionMm: Math.round((n.thread.positionMm / acrossOf(n, n.thread.direction)) * acrossOf(n, direction) * 2) / 2,
      },
    }))
  // Turning the note keeps the thread at the same relative position across it
  const flipOrientation = () =>
    update((n) => {
      const flipped = { widthMm: n.heightMm, heightMm: n.widthMm }
      const across = acrossOf(n, n.thread.direction)
      const positionMm = Math.round((n.thread.positionMm / across) * acrossOf(flipped, n.thread.direction) * 2) / 2
      return { ...n, ...flipped, thread: { ...n.thread, positionMm, windows: { ...n.thread.windows, sections: fitSections(n.thread.windows.sections, n.thread.direction === 'vertical' ? flipped.heightMm : flipped.widthMm) } } }
    })
  const portrait = note.heightMm >= note.widthMm
  const background = useImageUrl(note.faceImageId)

  return (
    <Panel className="absolute top-3 right-3 bottom-3 flex w-[248px] flex-col overflow-y-auto">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 py-2 pr-2 pl-4">
        <span className="truncate text-sm font-medium">{note.name}</span>
        <Button variant="outline" size="sm" onClick={onExport}><Download />Export</Button>
      </div>

      <Group title="Banknote">
      <Section nested title="Size">
        <Segmented
          value={portrait ? 'portrait' : 'landscape'}
          options={[
            { value: 'portrait', label: <RectangleVertical className="size-3.5" aria-label="Portrait" /> },
            { value: 'landscape', label: <RectangleHorizontal className="size-3.5" aria-label="Landscape" /> },
          ]}
          onChange={(next) => {
            if ((next === 'portrait') !== portrait) flipOrientation()
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <ScrubField label="W" value={note.widthMm} min={NOTE_SIZE.min} max={NOTE_SIZE.max} step={0.5} unit="mm" onChange={(w) => setSize(w, note.heightMm)} />
          <ScrubField label="H" value={note.heightMm} min={NOTE_SIZE.min} max={NOTE_SIZE.max} step={0.5} unit="mm" onChange={(h) => setSize(note.widthMm, h)} />
        </div>
      </Section>

      <Section nested title="Background">
        <Segmented
          value={note.background}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'image', label: 'Image' },
          ]}
          onChange={(mode) => update((n) => ({ ...n, background: mode }))}
        />
        {note.background === 'solid' ? (
          <ColorField value={note.color} onChange={(color) => update((n) => ({ ...n, color }))} />
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-[58px] flex-1 justify-start gap-2 overflow-hidden rounded-[calc(var(--radius-sm)+7px)] p-1.5"
              onClick={async () => {
                try {
                  const [file] = await pickFiles()
                  if (file) await setFaceImage(noteRef, file)
                } catch (error) { reportError(error) }
              }}
            >
              {background ? (
                <img src={background} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded bg-muted">
                  <ImageUp />
                </span>
              )}
              {background ? 'Replace' : 'Upload design'}
            </Button>
            {note.faceImageId && (
              <IconButton label="Remove image" onClick={() => void setFaceImage(noteRef, undefined)}>
                <X />
              </IconButton>
            )}
          </div>
        )}
      </Section>
      </Group>

      <Group title="Security thread">
      <Section nested title="Placement">
        <Segmented
          value={thread.direction}
          options={[
            { value: 'vertical', label: 'Vertical' },
            { value: 'horizontal', label: 'Horizontal' },
          ]}
          onChange={setDirection}
        />
        <div className="grid grid-cols-2 gap-2">
          <ScrubField
            label="T"
            title="Thread width vertically, or height horizontally"
            value={thread.widthMm}
            min={THREAD_WIDTH.min}
            max={THREAD_WIDTH.max}
            step={THREAD_WIDTH.step}
            unit="mm"
            onChange={(widthMm) => setThread({ widthMm })}
          />
          <ScrubField
            label={thread.direction === 'vertical' ? 'X' : 'Y'}
            title={thread.direction === 'vertical' ? 'Thread position from the left edge' : 'Thread position from the top edge'}
            value={thread.positionMm}
            min={0}
            max={acrossOf(note, thread.direction)}
            step={0.5}
            unit="mm"
            onChange={(positionMm) => setThread({ positionMm })}
          />
        </div>
      </Section>

      <Section nested title="Artwork">
        <SwitchField
          label="Background"
          checked={!!thread.backgroundColor}
          onChange={(enabled) => setThread({ backgroundColor: enabled ? '#ffffff' : undefined })}
        />
        {thread.backgroundColor && (
          <ColorField value={thread.backgroundColor} onChange={(backgroundColor) => setThread({ backgroundColor })} />
        )}
        <ScrubField
          label="Image gap"
          title="Space between complete image copies along the thread"
          value={thread.imageGapMm ?? 0}
          min={0}
          max={threadLength}
          step={0.5}
          unit="mm"
          onChange={(imageGapMm) => setThread({ imageGapMm })}
        />
      </Section>

      <Section nested title="Windows" action={
        <div className="flex items-center gap-1">
          {windows.enabled && (
            <IconButton label="Add window" size="icon-xs" disabled={!newWindow(windows.sections, threadLength)} onClick={addWindow}>
              <Plus />
            </IconButton>
          )}
          <Switch aria-label="Windows" checked={windows.enabled} onCheckedChange={setWindowed} />
        </div>
      }>
        {windows.enabled && windows.sections.length > 0 && (
          <div className="-mx-1.5 flex flex-col">
            {windows.sections.map((section, i) => {
              const selected = section.id === selectedWindowId
              return (
                <div key={section.id}>
                  <div className={cn('flex items-center gap-0.5 rounded-md', selected && 'bg-muted')}>
                    <Button variant="ghost" size="sm" aria-pressed={selected} aria-label={`Window ${i + 1}, ${format(section.startMm)}–${format(section.endMm)} mm`} className="flex-1 justify-between px-1.5 font-normal hover:bg-transparent aria-pressed:bg-transparent"
                      onClick={() => onWindowSelect(selected ? undefined : section.id)}>
                      <span>Window {i + 1}</span>
                      <span className="text-muted-foreground tabular-nums">{format(section.startMm)}–{format(section.endMm)} mm</span>
                    </Button>
                    {selected && (
                      <IconButton label="Delete window" size="icon-xs" onClick={() => {
                        setWindows({ sections: windows.sections.filter((s) => s.id !== section.id) })
                        onWindowSelect(undefined)
                      }}><Trash2 /></IconButton>
                    )}
                  </div>
                  {selected && selectedWindow && (
                    <div className="grid grid-cols-2 gap-2 px-1.5 pt-1.5 pb-2">
                      <ScrubField label="Start" title="Visible section starts here" value={selectedWindow.startMm} min={bounds.min} max={selectedWindow.endMm - Math.min(WINDOW_STEP, selectedWindow.endMm - selectedWindow.startMm)} step={WINDOW_STEP} unit="mm" onChange={(startMm) => updateWindow({ startMm })} />
                      <ScrubField label="End" title="Visible section ends here" value={selectedWindow.endMm} min={selectedWindow.startMm + Math.min(WINDOW_STEP, selectedWindow.endMm - selectedWindow.startMm)} max={bounds.max} step={WINDOW_STEP} unit="mm" onChange={(endMm) => updateWindow({ endMm })} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <EffectSection projectId={noteRef.projectId} note={note} />
      </Group>
    </Panel>
  )
}
