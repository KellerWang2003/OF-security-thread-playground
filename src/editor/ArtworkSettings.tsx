import { ColorField, Section, ScrubField, SwitchField } from '../components/controls'
import { updateNote } from '../lib/store'
import type { Note } from '../lib/types'

/**
 * Thread Studio's Artwork: the colour under the frames and the space between image copies along the thread. They are
 * part of what is printed on the thread, so they are set only here; where the thread sits on the banknote (direction,
 * thickness, position, windows) is set on the canvas, and the thickness beside the thread too.
 */
export function ArtworkSettings({ note, projectId }: { note: Note; projectId: string }) {
  const { thread } = note
  const length = thread.direction === 'vertical' ? note.heightMm : note.widthMm
  const setThread = (patch: Partial<Note['thread']>) => updateNote(projectId, note.id, (n) => ({ ...n, thread: { ...n.thread, ...patch } }))

  return (
    <Section nested>
      <SwitchField label="Background" checked={!!thread.backgroundColor} onChange={(enabled) => setThread({ backgroundColor: enabled ? '#ffffff' : undefined })} />
      {thread.backgroundColor && <ColorField value={thread.backgroundColor} onChange={(backgroundColor) => setThread({ backgroundColor })} />}
      <ScrubField label="Image gap" title="Space between complete image copies along the thread" value={thread.imageGapMm ?? 0} min={0} max={length}
        step={0.5} unit="mm" onChange={(imageGapMm) => setThread({ imageGapMm })} />
    </Section>
  )
}
