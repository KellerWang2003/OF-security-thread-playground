import { ChevronUp, Copy, Plus, Trash2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { IconButton } from '../components/controls'
import { NoteView } from '../components/NoteView'
import { duplicateNote, removeNote } from '../lib/store'
import type { Note } from '../lib/types'

const THUMB = 36

/**
 * The project's notes as an accordion at the bottom of the left column: collapsed it is just a count,
 * open it lists every note and lets you add one.
 */
export function NotesPanel({
  projectId,
  notes,
  selectedId,
  open,
  onOpenChange,
  onSelect,
  onAdd,
}: {
  projectId: string
  notes: Note[]
  selectedId: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (noteId: string) => void
  onAdd: () => void
}) {
  const [deleting, setDeleting] = useState<Note>()

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className={cn('flex flex-col border-t', open && 'max-h-[55%] min-h-0')}>
      <CollapsibleContent className="flex min-h-0 flex-col">
        <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto p-2">
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
                  <div className="flex size-9 shrink-0 items-center justify-center">
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
        <div className="px-2 pb-2">
          <Button variant="outline" size="sm" className="w-full" onClick={onAdd}>
            <Plus />
            Add note
          </Button>
        </div>
      </CollapsibleContent>

      <CollapsibleTrigger
        render={
          <button
            type="button"
            className={cn(
              'flex h-11 shrink-0 items-center justify-between px-3 text-left transition-colors hover:bg-muted/50',
              open && 'border-t',
            )}
          />
        }
      >
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Notes · {notes.length}
        </span>
        <ChevronUp className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>

      <AlertDialog open={deleting !== undefined} onOpenChange={(next) => !next && setDeleting(undefined)}>
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
    </Collapsible>
  )
}
