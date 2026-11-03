import { ColorField, Labeled, Section, ScrubField, Segmented, SwitchField } from '../components/controls'
import { THREAD_WIDTH } from '../lib/notes'
import { updateNote } from '../lib/store'
import { fitSections } from '../lib/thread'
import type { Note } from '../lib/types'

/**
 * Thread Studio's Thread group: the whole thread's direction and thickness, then its artwork, as in the right
 * panel on the canvas. Turning the thread keeps it at the same relative position across the banknote.
 */
export function ThreadSettings({ note, projectId }: { note: Note; projectId: string }) {
  const { thread } = note
  const length = thread.direction === 'vertical' ? note.heightMm : note.widthMm
  const update = (change: (n: Note) => Note) => updateNote(projectId, note.id, change)
  const setThread = (patch: Partial<Note['thread']>) => update((n) => ({ ...n, thread: { ...n.thread, ...patch } }))
  const across = (n: Pick<Note, 'widthMm' | 'heightMm'>, direction: Note['thread']['direction']) => (direction === 'vertical' ? n.widthMm : n.heightMm)
  const setDirection = (direction: Note['thread']['direction']) =>
    update((n) => ({
      ...n,
      thread: {
        ...n.thread,
        direction,
        windows: { ...n.thread.windows, sections: fitSections(n.thread.windows.sections, direction === 'vertical' ? n.heightMm : n.widthMm) },
        positionMm: Math.round((n.thread.positionMm / across(n, n.thread.direction)) * across(n, direction) * 2) / 2,
      },
    }))

  return (
    <>
      <Section nested>
        <Labeled label="Direction">
          <Segmented
            value={thread.direction}
            options={[
              { value: 'vertical', label: 'Vertical' },
              { value: 'horizontal', label: 'Horizontal' },
            ]}
            onChange={setDirection}
          />
        </Labeled>
        <Labeled label="Thickness">
          <ScrubField label="T" title="Thread width vertically, or height horizontally" value={thread.widthMm} min={THREAD_WIDTH.min} max={THREAD_WIDTH.max}
            step={THREAD_WIDTH.step} unit="mm" onChange={(widthMm) => setThread({ widthMm })} />
        </Labeled>
      </Section>

      <Section nested title="Artwork">
        <SwitchField label="Background" checked={!!thread.backgroundColor} onChange={(enabled) => setThread({ backgroundColor: enabled ? '#ffffff' : undefined })} />
        {thread.backgroundColor && <ColorField value={thread.backgroundColor} onChange={(backgroundColor) => setThread({ backgroundColor })} />}
        <ScrubField label="Image gap" title="Space between complete image copies along the thread" value={thread.imageGapMm ?? 0} min={0} max={length}
          step={0.5} unit="mm" onChange={(imageGapMm) => setThread({ imageGapMm })} />
      </Section>
    </>
  )
}
