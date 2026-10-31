import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field, IconButton, NumberField, Segmented } from '../components/controls'
import { NoteView } from '../components/NoteView'
import { NOTE_PRESETS, createProject, presetNote } from '../lib/notes'
import { updateProject, useProjects } from '../lib/store'
import type { NotePresetId, Project } from '../lib/types'

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
  const [preset, setPreset] = useState<NotePresetId>('25')
  const [size, setSize] = useState({ widthMm: 68, heightMm: 134 })
  const presetInfo = NOTE_PRESETS.find((p) => p.id === preset)

  const create = () => {
    const note = preset === 'custom' ? { preset, ...size, color: '#8A4F9E' } : presetNote(preset)
    const project = createProject(name.trim() || `${presetInfo ? `${presetInfo.label} note` : 'Custom note'} thread`, note)
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
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_320px]">
          <Field label="Name">
            <Input
              autoFocus
              placeholder="e.g. 25 thread, two colours"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Note size"
            hint={presetInfo ? `${presetInfo.widthMm} × ${presetInfo.heightMm} mm, portrait, Flight series` : undefined}
          >
            <Segmented<NotePresetId>
              value={preset}
              options={[...NOTE_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom' }]}
              onChange={setPreset}
            />
            {preset === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField value={size.widthMm} min={20} max={250} unit="mm" onChange={(widthMm) => setSize((s) => ({ ...s, widthMm }))} />
                <NumberField value={size.heightMm} min={20} max={250} unit="mm" onChange={(heightMm) => setSize((s) => ({ ...s, heightMm }))} />
              </div>
            )}
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
  const scale = 160 / Math.max(project.note.heightMm, project.note.widthMm * 1.2)

  return (
    <li>
      <Card className="group gap-0 py-0">
        <button
          type="button"
          onClick={() => open(project.id)}
          className="flex h-[196px] items-center justify-center bg-muted/50 transition-colors group-hover:bg-muted"
        >
          <NoteView project={project} scale={scale} />
        </button>
        <div className="flex items-center gap-0.5 px-3 py-2">
          <button type="button" onClick={() => open(project.id)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-medium">{project.name}</div>
            <div className="text-xs text-muted-foreground">
              {project.note.widthMm} × {project.note.heightMm} mm · {project.frames.length} frames
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
            <AlertDialogDescription>Its uploaded frames are deleted too. This can't be undone.</AlertDialogDescription>
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(project.name)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
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
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
