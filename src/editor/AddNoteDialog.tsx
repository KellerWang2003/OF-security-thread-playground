import { ArrowLeftRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field, IconButton, LengthNumberField } from '../components/controls'
import { DEFAULT_NOTE, NOTE_SIZE, createNote, nextNotePosition } from '../lib/notes'
import { addNote } from '../lib/store'
import type { Note } from '../lib/types'

/**
 * Adds a note of any size to a project; starts from the size of the last note so a series is quick to set up. It asks
 * for no colour (Keller, 4 November): every new banknote is plain light grey paper until its design is uploaded
 */
export function AddNoteDialog({
  projectId,
  notes,
  open,
  onOpenChange,
  onAdded,
}: {
  projectId: string
  notes: Note[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (noteId: string) => void
}) {
  const last = notes.at(-1)
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [size, setSize] = useState({
    widthMm: last?.widthMm ?? DEFAULT_NOTE.widthMm,
    heightMm: last?.heightMm ?? DEFAULT_NOTE.heightMm,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" initialFocus={nameRef}>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            // A size past the limits shows its error and isn't taken: back to it instead of adding the banknote
            const invalid = e.currentTarget.querySelector<HTMLInputElement>('[aria-invalid="true"]')
            if (invalid) {
              invalid.focus()
              return
            }
            const created = createNote({
              name: name.trim() || `Banknote ${notes.length + 1}`,
              ...nextNotePosition(notes),
              ...size,
              color: DEFAULT_NOTE.color,
            })
            // Cycle and fade are shared by every banknote in the project. It comes with no security feature, not even a
            // thread: each is added from the Add menu (Keller, 4 November)
            const note: Note = { ...created, noThread: true, ...(last ? { tilt: last.tilt } : {}) }
            addNote(projectId, note)
            onAdded(note.id)
            onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>New banknote</DialogTitle>
          </DialogHeader>
          <Field label="Name">
            <Input ref={nameRef} placeholder={`Banknote ${notes.length + 1}`} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
            <Field label="Width">
              <LengthNumberField
                value={size.widthMm}
                min={NOTE_SIZE.min}
                max={NOTE_SIZE.max}
                step={0.5}
                strict
                onChange={(widthMm) => setSize((s) => ({ ...s, widthMm }))}
              />
            </Field>
            {/* Level with the fields under their labels, whichever shows an error under it */}
            <IconButton
              label="Swap width and height"
              size="icon"
              className="mt-5.5"
              onClick={() => setSize((s) => ({ widthMm: s.heightMm, heightMm: s.widthMm }))}
            >
              <ArrowLeftRight />
            </IconButton>
            <Field label="Height">
              <LengthNumberField
                value={size.heightMm}
                min={NOTE_SIZE.min}
                max={NOTE_SIZE.max}
                step={0.5}
                strict
                onChange={(heightMm) => setSize((s) => ({ ...s, heightMm }))}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit">Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
