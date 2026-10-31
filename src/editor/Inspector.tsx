import { ArrowLeftRight, ArrowUpDown, ImageUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ColorField, IconButton, Panel, ScrubField, Section, Segmented } from '../components/controls'
import { clamp } from '../lib/frames'
import { pickFiles, useImageUrl } from '../lib/images'
import { NOTE_SIZE, THREAD_WIDTH } from '../lib/notes'
import { updateNote } from '../lib/store'
import type { Note } from '../lib/types'
import { setFaceImage, type NoteRef } from './frameActions'

type Change = (note: Note) => Note

/** Right: the selected note's properties, Figma style */
export function Inspector({ note, noteRef }: { note: Note; noteRef: NoteRef }) {
  const update = (change: Change) => updateNote(noteRef.projectId, noteRef.noteId, change)
  const { thread, tilt } = note
  const setThread = (patch: Partial<Note['thread']>) => update((n) => ({ ...n, thread: { ...n.thread, ...patch } }))
  const setTiltSettings = (patch: Partial<Note['tilt']>) => update((n) => ({ ...n, tilt: { ...n.tilt, ...patch } }))
  const setSize = (widthMm: number, heightMm: number) =>
    update((n) => ({ ...n, widthMm, heightMm, thread: { ...n.thread, xMm: clamp(n.thread.xMm, 0, widthMm) } }))
  const background = useImageUrl(note.faceImageId)

  return (
    <Panel className="absolute top-3 right-3 bottom-3 flex w-[248px] flex-col overflow-y-auto">
      <div className="truncate border-b px-4 py-3 text-sm font-medium">{note.name}</div>

      <Section title="Note">
        <div className="grid grid-cols-2 gap-2">
          <ScrubField label="W" value={note.widthMm} min={NOTE_SIZE.min} max={NOTE_SIZE.max} step={0.5} unit="mm" onChange={(w) => setSize(w, note.heightMm)} />
          <ScrubField label="H" value={note.heightMm} min={NOTE_SIZE.min} max={NOTE_SIZE.max} step={0.5} unit="mm" onChange={(h) => setSize(note.widthMm, h)} />
        </div>
      </Section>

      <Section title="Background">
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
              className="h-14 flex-1 justify-start gap-2 overflow-hidden px-1.5"
              onClick={async () => {
                const [file] = await pickFiles()
                if (file) await setFaceImage(noteRef, file)
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

      <Section title="Thread">
        <div className="grid grid-cols-2 gap-2">
          <ScrubField
            label="W"
            value={thread.widthMm}
            min={THREAD_WIDTH.min}
            max={THREAD_WIDTH.max}
            step={THREAD_WIDTH.step}
            unit="mm"
            onChange={(widthMm) => setThread({ widthMm })}
          />
          <ScrubField label="X" title="Thread position from the left edge" value={thread.xMm} min={0} max={note.widthMm} step={0.5} unit="mm" onChange={(xMm) => setThread({ xMm })} />
        </div>
        <Segmented
          value={thread.fit}
          options={[
            { value: 'stretch', label: 'Full length' },
            { value: 'repeat', label: 'Repeat' },
          ]}
          onChange={(fit) => setThread({ fit })}
        />
        {thread.fit === 'repeat' && (
          <ScrubField label="L" title="Tile length" value={thread.tileMm} min={1} max={note.heightMm} step={0.5} unit="mm" onChange={(tileMm) => setThread({ tileMm })} />
        )}
      </Section>

      <Section title="Frame cycle">
        <Segmented
          value={tilt.axis}
          options={[
            { value: 'vertical', label: <ArrowUpDown className="size-3.5" aria-label="Tilt back and forth" /> },
            { value: 'horizontal', label: <ArrowLeftRight className="size-3.5" aria-label="Tilt side to side" /> },
          ]}
          onChange={(axis) => setTiltSettings({ axis })}
        />
        <div className="grid grid-cols-2 gap-2">
          <ScrubField
            label="∠"
            title="Angle for one full cycle of the frames"
            value={tilt.rangeDeg * 2}
            min={10}
            max={90}
            step={1}
            unit="°"
            onChange={(full) => setTiltSettings({ rangeDeg: full / 2 })}
          />
          <ScrubField
            label="◐"
            title="Crossfade between frames"
            value={Math.round(tilt.transition * 100)}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(v) => setTiltSettings({ transition: v / 100 })}
          />
        </div>
      </Section>
    </Panel>
  )
}
