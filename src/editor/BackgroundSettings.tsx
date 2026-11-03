import { ColorField, Section, SwitchField } from '../components/controls'
import { updateNote } from '../lib/store'
import type { Note } from '../lib/types'

/**
 * Thread Studio's Background: one colour under every frame, showing wherever a frame is empty or see-through and
 * where no section prints; off, the banknote shows through the thread there.
 */
export function BackgroundSettings({ note, projectId }: { note: Note; projectId: string }) {
  const { thread } = note
  const setColor = (backgroundColor: string | undefined) =>
    updateNote(projectId, note.id, (n) => ({ ...n, thread: { ...n.thread, backgroundColor } }))

  return (
    <Section nested>
      <SwitchField label="Colour" title="A colour under every frame; off, the banknote shows through" checked={!!thread.backgroundColor}
        onChange={(enabled) => setColor(enabled ? '#ffffff' : undefined)} />
      {thread.backgroundColor && <ColorField value={thread.backgroundColor} onChange={setColor} />}
    </Section>
  )
}
