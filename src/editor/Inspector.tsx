import { Upload, X } from 'lucide-react'
import { ColorField, Field, IconButton, NumberField, RangeField, Section, Segmented } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clamp } from '../lib/frames'
import { pickFiles } from '../lib/images'
import { NOTE_SIZE, THREAD_WIDTH } from '../lib/notes'
import { updateNote } from '../lib/store'
import type { Note } from '../lib/types'
import { setFaceImage, type NoteRef } from './frameActions'

type Change = (note: Note) => Note

export function Inspector({ note, noteRef }: { note: Note; noteRef: NoteRef }) {
  const update = (change: Change) => updateNote(noteRef.projectId, noteRef.noteId, change)
  return (
    <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l bg-background">
      <NoteSection note={note} noteRef={noteRef} update={update} />
      <ThreadSection note={note} update={update} />
      <AnimationSection note={note} update={update} />
    </aside>
  )
}

function NoteSection({ note, noteRef, update }: { note: Note; noteRef: NoteRef; update: (change: Change) => void }) {
  const setSize = (widthMm: number, heightMm: number) =>
    update((n) => ({ ...n, widthMm, heightMm, thread: { ...n.thread, xMm: clamp(n.thread.xMm, 0, widthMm) } }))

  return (
    <Section title="Note">
      <Field label="Name">
        <Input className="h-8" value={note.name} onChange={(e) => update((n) => ({ ...n, name: e.target.value }))} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <NumberField value={note.widthMm} min={NOTE_SIZE.min} max={NOTE_SIZE.max} step={0.5} unit="mm" onChange={(w) => setSize(w, note.heightMm)} />
        </Field>
        <Field label="Height">
          <NumberField value={note.heightMm} min={NOTE_SIZE.min} max={NOTE_SIZE.max} step={0.5} unit="mm" onChange={(h) => setSize(note.widthMm, h)} />
        </Field>
      </div>
      <Field label="Colour">
        <ColorField value={note.color} onChange={(color) => update((n) => ({ ...n, color }))} />
      </Field>
      <Field label="Face artwork" hint="Optional. Export at trim size; it sits behind the thread.">
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              const [file] = await pickFiles()
              if (file) await setFaceImage(noteRef, file)
            }}
          >
            <Upload />
            {note.faceImageId ? 'Replace' : 'Upload'}
          </Button>
          {note.faceImageId && (
            <IconButton variant="outline" size="icon" label="Remove face artwork" onClick={() => void setFaceImage(noteRef, undefined)}>
              <X />
            </IconButton>
          )}
        </div>
      </Field>
    </Section>
  )
}

function ThreadSection({ note, update }: { note: Note; update: (change: Change) => void }) {
  const { thread } = note
  const set = (patch: Partial<Note['thread']>) => update((p) => ({ ...p, thread: { ...p.thread, ...patch } }))

  return (
    <Section title="Thread">
      <RangeField
        label="Width"
        value={thread.widthMm}
        min={THREAD_WIDTH.min}
        max={THREAD_WIDTH.max}
        step={THREAD_WIDTH.step}
        unit="mm"
        onChange={(widthMm) => set({ widthMm })}
      />
      <RangeField
        label="Position from left edge"
        value={thread.xMm}
        min={0}
        max={note.widthMm}
        step={0.5}
        unit="mm"
        onChange={(xMm) => set({ xMm })}
      />
      <div className="-mt-1 flex gap-1.5">
        <Button variant="outline" size="sm" onClick={() => set({ xMm: note.widthMm / 2 })}>
          Centre
        </Button>
      </div>
      <RangeField
        label="White surround"
        value={thread.surroundMm}
        min={0}
        max={8}
        step={0.5}
        unit="mm"
        onChange={(surroundMm) => set({ surroundMm })}
      />
      <Field label="Frame fit">
        <Segmented
          value={thread.fit}
          options={[
            { value: 'stretch', label: 'Full length' },
            { value: 'repeat', label: 'Repeat tile' },
          ]}
          onChange={(fit) => set({ fit })}
        />
      </Field>
      {thread.fit === 'repeat' && (
        <RangeField
          label="Tile length"
          value={thread.tileMm}
          min={1}
          max={note.heightMm}
          step={0.5}
          unit="mm"
          onChange={(tileMm) => set({ tileMm })}
        />
      )}
    </Section>
  )
}

function AnimationSection({ note, update }: { note: Note; update: (change: Change) => void }) {
  const { tilt } = note
  const set = (patch: Partial<Note['tilt']>) => update((p) => ({ ...p, tilt: { ...p.tilt, ...patch } }))

  return (
    <Section title="Animation">
      <Field label="Tilt direction">
        <Segmented
          value={tilt.axis}
          options={[
            { value: 'vertical', label: 'Back and forth' },
            { value: 'horizontal', label: 'Side to side' },
          ]}
          onChange={(axis) => set({ axis })}
        />
      </Field>
      <RangeField label="Tilt range (±)" value={tilt.rangeDeg} min={10} max={45} step={1} unit="°" onChange={(rangeDeg) => set({ rangeDeg })} />
      <RangeField
        label="Crossfade between frames"
        value={Math.round(tilt.transition * 100)}
        min={0}
        max={100}
        step={5}
        unit="%"
        onChange={(v) => set({ transition: v / 100 })}
      />
      <p className="text-[11px] leading-snug text-muted-foreground/80">
        The range is split into equal slices, one per frame. Frame 1 shows at the start of the range.
      </p>
    </Section>
  )
}
