import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field, IconButton } from '../components/controls'
import { NoteView } from '../components/NoteView'
import { createProject } from '../lib/notes'
import { updateProject, useProjects } from '../lib/store'
import type { Project } from '../lib/types'

const open = (id: string) => (location.hash = `#/p/${id}`)

export function ProjectList() {
  const projects = useProjects((s) => s.projects)
  const [creating, setCreating] = useState(projects.length === 0)
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="h-full overflow-y-auto bg-muted/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-xl font-semibold">Security thread playground</h1>
            <p className="text-sm text-muted-foreground">
              Design a lenticular thread frame by frame and tilt the note to preview it.
            </p>
          </div>
          {!creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              New project
            </Button>
          )}
        </header>

        {creating && <NewProject onCancel={projects.length ? () => setCreating(false) : undefined} />}

        {sorted.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {sorted.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function NewProject({ onCancel }: { onCancel?: () => void }) {
  const [name, setName] = useState('')

  const create = () => {
    const project = createProject(name.trim() || 'Untitled project')
    useProjects.getState().add(project)
    open(project.id)
  }

  return (
    <Card>
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <CardHeader>
          <CardTitle>New project</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="Name" hint="You add the notes, at any size, once the project is open.">
            <Input
              autoFocus
              placeholder="e.g. Flight series"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit">Create</Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const shown = project.notes.slice(0, 4)
  // Thumbnails share one scale so the notes keep their relative sizes
  const totalWidth = shown.reduce((sum, n) => sum + n.widthMm, 0) + 6 * Math.max(0, shown.length - 1)
  const tallest = Math.max(...shown.map((n) => n.heightMm), 1)
  const scale = Math.min(150 / tallest, 190 / Math.max(totalWidth, 1))

  return (
    <li>
      <Card className="group gap-0 py-0">
        <button
          type="button"
          onClick={() => open(project.id)}
          className="flex h-[196px] items-center justify-center bg-muted/50 transition-colors group-hover:bg-muted"
        >
          {shown.length ? (
            <div className="flex items-end gap-1.5">
              {shown.map((note) => (
                <NoteView key={note.id} note={note} scale={scale} />
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No notes yet</span>
          )}
        </button>
        <div className="flex items-center gap-0.5 px-3 py-2">
          <button type="button" onClick={() => open(project.id)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-medium">{project.name}</div>
            <div className="text-xs text-muted-foreground">
              {project.notes.length} {project.notes.length === 1 ? 'note' : 'notes'}
            </div>
          </button>
          <IconButton label="Rename" onClick={() => setRenaming(true)}>
            <Pencil />
          </IconButton>
          <IconButton label="Duplicate" onClick={() => void useProjects.getState().duplicate(project.id)}>
            <Copy />
          </IconButton>
          <IconButton label="Delete" onClick={() => setDeleting(true)}>
            <Trash2 />
          </IconButton>
        </div>
      </Card>

      <RenameDialog key={renaming ? "open" : "closed"} project={project} open={renaming} onOpenChange={setRenaming} />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>All its notes and uploaded frames are deleted too. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void useProjects.getState().remove(project.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

function RenameDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState(project.name)
  const nameRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(project.name)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm" initialFocus={nameRef}>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) updateProject(project.id, (p) => ({ ...p, name: name.trim() }))
            onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
