import { useRef } from 'react'
import { reportError } from '../cloud/notices'
import { Download, ImageUp, RectangleHorizontal, RectangleVertical, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ColorField, Group, IconButton, Panel, ScrubField, Section, Segmented, SwitchField } from '../components/controls'
import { clamp } from '../lib/frames'
import { pickFiles, useImageUrl } from '../lib/images'
import { NOTE_SIZE, THREAD_WIDTH } from '../lib/notes'
import { updateNote } from '../lib/store'
import { fitSections } from '../lib/thread'
import type { Note } from '../lib/types'
import { PANEL_WIDTH, savePanelWidth, setPanelWidth, usePanelWidth } from '../lib/panelWidth'
import { EffectSection, LensMenu } from './EffectSection'
import { WindowsCard } from './WindowsCard'
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
    <>
    <PanelResizer />
    <Panel className="absolute top-3 right-3 bottom-3 flex w-(--panel-w) flex-col overflow-y-auto">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 py-2 pr-2 pl-4">
        <span className="truncate text-sm font-medium">{note.name}</span>
        <Button variant="outline" size="sm" onClick={onExport}><Download />Export</Button>
      </div>

      <Group title="Banknote">
      <Section nested>
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

      <Section nested>
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
      <Section nested>
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
        <WindowsCard note={note} noteRef={noteRef} selectedWindowId={selectedWindowId} onWindowSelect={onWindowSelect} />
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

      </Group>

      <Group title="Lens effect" action={<LensMenu projectId={noteRef.projectId} note={note} />}>
        <EffectSection projectId={noteRef.projectId} note={note} />
      </Group>
    </Panel>
    </>
  )
}

/**
 * The panel's left edge: drag it to make the panel wider for controls that need finer placement,
 * double-click to go back to the default width. The width is remembered.
 */
function PanelResizer() {
  const width = usePanelWidth((s) => s.width)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      title="Drag to resize the panel, double-click to reset"
      className="group absolute top-3 bottom-3 z-10 w-3 translate-x-1/2 cursor-col-resize touch-none"
      style={{ right: `calc(${width}px + 12px)` }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { startX: e.clientX, startWidth: width }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d) setPanelWidth(d.startWidth + d.startX - e.clientX)
      }}
      onPointerUp={() => {
        if (drag.current) savePanelWidth()
        drag.current = null
      }}
      onLostPointerCapture={() => {
        if (drag.current) savePanelWidth()
        drag.current = null
      }}
      onDoubleClick={() => {
        setPanelWidth(PANEL_WIDTH.initial)
        savePanelWidth()
      }}
    >
      <div className="absolute inset-y-6 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-primary/0 transition-colors group-hover:bg-primary/50 group-active:bg-primary" />
    </div>
  )
}
