import { reportError } from '../cloud/notices'
import { ImageUp, RectangleHorizontal, RectangleVertical, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ColorField, IconButton, Panel, ScrubField, Section, Segmented, SwitchField } from '../components/controls'
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
  const { thread } = note
  const setThread = (patch: Partial<Note['thread']>) => update((n) => ({ ...n, thread: { ...n.thread, ...patch } }))
  const { windows } = thread
  const setWindows = (patch: Partial<Note['thread']['windows']>) =>
    update((n) => ({ ...n, thread: { ...n.thread, windows: { ...n.thread.windows, ...patch } } }))
  const acrossOf = (n: Pick<Note, 'widthMm' | 'heightMm'>, direction: Note['thread']['direction']) =>
    direction === 'vertical' ? n.widthMm : n.heightMm
  const setSize = (widthMm: number, heightMm: number) =>
    update((n) => ({
      ...n,
      widthMm,
      heightMm,
      thread: { ...n.thread, positionMm: clamp(n.thread.positionMm, 0, acrossOf({ widthMm, heightMm }, n.thread.direction)) },
    }))
  // Turning the thread keeps it at the same relative position across the note
  const setDirection = (direction: Note['thread']['direction']) =>
    update((n) => ({
      ...n,
      thread: {
        ...n.thread,
        direction,
        positionMm: Math.round((n.thread.positionMm / acrossOf(n, n.thread.direction)) * acrossOf(n, direction) * 2) / 2,
      },
    }))
  // Turning the note keeps the thread at the same relative position across it
  const flipOrientation = () =>
    update((n) => {
      const flipped = { widthMm: n.heightMm, heightMm: n.widthMm }
      const across = acrossOf(n, n.thread.direction)
      const positionMm = Math.round((n.thread.positionMm / across) * acrossOf(flipped, n.thread.direction) * 2) / 2
      return { ...n, ...flipped, thread: { ...n.thread, positionMm } }
    })
  const portrait = note.heightMm >= note.widthMm
  const background = useImageUrl(note.faceImageId)

  return (
    <Panel className="absolute top-3 right-3 bottom-3 flex w-[248px] flex-col overflow-y-auto">
      <div className="truncate border-b border-border/60 px-4 py-3 text-sm font-medium">{note.name}</div>

      <Section title="Note">
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

      <Section title="Thread">
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
            label="W"
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
        <SwitchField
          label="Background"
          checked={!!thread.backgroundColor}
          onChange={(enabled) => setThread({ backgroundColor: enabled ? '#ffffff' : undefined })}
        />
        {thread.backgroundColor && (
          <ColorField value={thread.backgroundColor} onChange={(backgroundColor) => setThread({ backgroundColor })} />
        )}
        <ScrubField
          label="Repeat"
          title="Height of the image section that repeats down the thread"
          value={thread.tileMm}
          min={1}
          max={note.heightMm}
          step={0.5}
          unit="mm"
          onChange={(tileMm) => setThread({ tileMm })}
        />
      </Section>

      <Section
        title="Windows"
        action={<Switch size="sm" aria-label="Windowed thread" checked={windows.enabled} onCheckedChange={(enabled) => setWindows({ enabled })} />}
      >
        {windows.enabled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <ScrubField label="Open" title="Window length" value={windows.windowMm} min={1} max={note.heightMm} step={0.5} unit="mm" onChange={(windowMm) => setWindows({ windowMm })} />
              <ScrubField label="Gap" title="Covered length between windows" value={windows.gapMm} min={0.5} max={note.heightMm} step={0.5} unit="mm" onChange={(gapMm) => setWindows({ gapMm })} />
            </div>
            <ScrubField label="Offset" title="Shift the windows along the thread" value={windows.offsetMm} min={-note.heightMm} max={note.heightMm} step={0.5} unit="mm" onChange={(offsetMm) => setWindows({ offsetMm })} />
          </>
        )}
      </Section>

    </Panel>
  )
}
