import { ChevronDown, ChevronLeft, Copy, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { IconButton, Panel } from '../components/controls'
import { CloudStatus } from '../components/CloudStatus'
import { runAction, reportError } from '../cloud/notices'
import { NoteView } from '../components/NoteView'
import { duplicateNote, removeNote, updateNote, updateProject } from '../lib/store'
import type { Note, Project } from '../lib/types'

const THUMB = 28

/** Top-left: back to the projects, the project's name, and its notes as a collapsible list */
export function ProjectPanel({
  project,
  isDemo = false,
  selectedId,
  onSelect,
  onAdd,
}: {
  project: Project
  isDemo?: boolean
  selectedId: string | undefined
  onSelect: (noteId: string) => void
  onAdd: () => void
}) {
  const [open, setOpen] = useState(true)
  const [renaming, setRenaming] = useState<string>()
  const [deleting, setDeleting] = useState<Note>()

  return (
    <Panel className="absolute top-3 left-3 flex max-h-[calc(100%-120px)] w-[248px] flex-col">
      <div className="flex items-center gap-1 p-1.5">
        <Button variant="ghost" size="sm" className="px-1.5" onClick={() => (location.hash = '')}>
          <ChevronLeft />
          {isDemo ? 'Exit demo' : 'Projects'}
        </Button>
      </div>
      <div className="px-1.5 pb-1.5">
        <Input
          aria-label="Project name"
          className="h-8 border-transparent font-medium shadow-none hover:border-input"
          value={project.name}
          onChange={(e) => updateProject(project.id, (p) => ({ ...p, name: e.target.value }))}
        />
      </div>
      <div className="flex items-center justify-between px-3 pb-2"><CloudStatus showWorkspace isDemo={isDemo} /></div>
      <Separator />

      <Collapsible open={open} onOpenChange={setOpen} className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between py-1 pr-1.5 pl-1.5">
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              />
            }
          >
            Banknotes · {project.notes.length}
            <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
          </CollapsibleTrigger>
          <IconButton label="Add banknote" size="icon-xs" onClick={onAdd}>
            <Plus />
          </IconButton>
        </div>
        <CollapsibleContent className="min-h-0 overflow-y-auto">
          <ul className="flex flex-col gap-0.5 px-1.5 pb-1.5">
            {project.notes.map((note) => (
              <li key={note.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(note.id)}
                  onDoubleClick={() => setRenaming(note.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors group-hover:pr-14',
                    note.id === selectedId ? 'bg-muted' : 'hover:bg-muted/50',
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center">
                    <NoteView note={note} scale={THUMB / Math.max(note.widthMm, note.heightMm)} />
                  </span>
                  {renaming === note.id ? (
                    <Input
                      autoFocus
                      aria-label="Banknote name"
                      className="h-6 px-1 text-sm"
                      defaultValue={note.name}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const name = e.target.value.trim()
                        if (name) updateNote(project.id, note.id, (n) => ({ ...n, name }))
                        setRenaming(undefined)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setRenaming(undefined)
                      }}
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm">{note.name}</span>
                  )}
                </button>
                {renaming !== note.id && (
                  <div className="absolute inset-y-0 right-1 hidden items-center group-hover:flex">
                    <IconButton
                      label="Duplicate"
                      size="icon-xs"
                      onClick={async () => {
                        try {
                          const id = await duplicateNote(project.id, note.id)
                          if (id) onSelect(id)
                        } catch (error) { reportError(error) }
                      }}
                    >
                      <Copy />
                    </IconButton>
                    <IconButton label="Delete" size="icon-xs" onClick={() => setDeleting(note)}>
                      <Trash2 />
                    </IconButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={deleting !== undefined} onOpenChange={(next) => !next && setDeleting(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) runAction(removeNote(project.id, deleting.id))
                setDeleting(undefined)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  )
}
