import { ArrowLeftRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ColorField, Field, IconButton, LengthNumberField } from '../components/controls'
import { DEFAULT_NOTE, NOTE_SIZE, createNote, nextNotePosition } from '../lib/notes'
import { addNote } from '../lib/store'
import type { Note } from '../lib/types'

/** Adds a note of any size to a project; starts from the size of the last note so a series is quick to set up */
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
  const [color, setColor] = useState(last?.color ?? DEFAULT_NOTE.color)

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
              color,
            })
            // Cycle and fade are shared by every banknote in the project
            const note = last ? { ...created, tilt: last.tilt } : created
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
          <Field label="Colour">
            <ColorField value={color} onChange={setColor} />
          </Field>
          <DialogFooter>
            <Button type="submit">Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
