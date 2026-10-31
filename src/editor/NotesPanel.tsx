import { Copy, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { IconButton } from '../components/controls'
import { NoteView } from '../components/NoteView'
import { duplicateNote, removeNote } from '../lib/store'
import type { Note } from '../lib/types'

const THUMB = 44

/** The project's notes, like pages in a document: pick one to edit it on the stage */
export function NotesPanel({
  projectId,
  notes,
  selectedId,
  onSelect,
  onAdd,
}: {
  projectId: string
  notes: Note[]
  selectedId: string | undefined
  onSelect: (noteId: string) => void
  onAdd: () => void
}) {
  const [deleting, setDeleting] = useState<Note>()

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r bg-background">
      <div className="flex h-11 items-center justify-between border-b px-3">
        <h2 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Notes · {notes.length}</h2>
        <IconButton label="Add note" onClick={onAdd}>
          <Plus />
        </IconButton>
      </div>
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {notes.map((note) => {
          const scale = THUMB / Math.max(note.widthMm, note.heightMm)
          return (
            <li key={note.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(note.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors group-focus-within:pr-16 group-hover:pr-16',
                  note.id === selectedId ? 'bg-muted' : 'hover:bg-muted/50',
                )}
              >
                <div className="flex size-11 shrink-0 items-center justify-center">
                  <NoteView note={note} scale={scale} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{note.name}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {note.widthMm} × {note.heightMm} mm
                  </div>
                </div>
              </button>
              <div className="absolute inset-y-0 right-1.5 hidden items-center group-focus-within:flex group-hover:flex">
                <IconButton
                  label="Duplicate note"
                  size="icon-xs"
                  onClick={async () => {
                    const id = await duplicateNote(projectId, note.id)
                    if (id) onSelect(id)
                  }}
                >
                  <Copy />
                </IconButton>
                <IconButton label="Delete note" size="icon-xs" onClick={() => setDeleting(note)}>
                  <Trash2 />
                </IconButton>
              </div>
            </li>
          )
        })}
      </ul>

      <AlertDialog open={deleting !== undefined} onOpenChange={(open) => !open && setDeleting(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Its thread settings and uploaded frames are deleted too.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) void removeNote(projectId, deleting.id)
                setDeleting(undefined)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}
