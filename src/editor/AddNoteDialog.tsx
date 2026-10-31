import { ArrowLeftRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ColorField, Field, IconButton, NumberField } from '../components/controls'
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
            const note = createNote({
              name: name.trim() || `Note ${notes.length + 1}`,
              ...nextNotePosition(notes),
              ...size,
              color,
            })
            addNote(projectId, note)
            onAdded(note.id)
            onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
            <DialogDescription>Any size; each note keeps its own thread and frames.</DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input ref={nameRef} placeholder={`e.g. Note ${notes.length + 1}, or its denomination`} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Width">
              <NumberField
                value={size.widthMm}
                min={NOTE_SIZE.min}
                max={NOTE_SIZE.max}
                step={0.5}
                unit="mm"
                onChange={(widthMm) => setSize((s) => ({ ...s, widthMm }))}
              />
            </Field>
            <IconButton
              label="Swap width and height"
              size="icon"
              onClick={() => setSize((s) => ({ widthMm: s.heightMm, heightMm: s.widthMm }))}
            >
              <ArrowLeftRight />
            </IconButton>
            <Field label="Height">
              <NumberField
                value={size.heightMm}
                min={NOTE_SIZE.min}
                max={NOTE_SIZE.max}
                step={0.5}
                unit="mm"
                onChange={(heightMm) => setSize((s) => ({ ...s, heightMm }))}
              />
            </Field>
          </div>
          <Field label="Colour">
            <ColorField value={color} onChange={setColor} />
          </Field>
          <DialogFooter>
            <Button type="submit">Add note</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
