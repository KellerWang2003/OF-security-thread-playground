import { Bird, ChevronDown, Copy, LogOut, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { IconButton } from '../components/controls'
import { CloudStatus } from '../components/CloudStatus'
import { importBrowserProjects, useWorkspace, openDemoPreview, signOut } from '../cloud/workspace'
import { runAction, reportError } from '../cloud/notices'
import { NoteView } from '../components/NoteView'
import { createProject } from '../lib/notes'
import { updateProject, useProjects } from '../lib/store'
import type { Project } from '../lib/types'

const open = (id: string) => (location.hash = `#/p/${id}`)

export function ProjectList() {
  const projects = useProjects((s) => s.projects)
  const { legacyProjects, importing } = useWorkspace()
  const [creating, setCreating] = useState(false)
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="flex h-full flex-col bg-muted/40">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-6">
        <span className="font-heading text-sm font-semibold">Security thread playground</span>
        <div className="flex items-center gap-3">
          <CloudStatus />
          <AccountMenu />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <main className="flex min-w-0 flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h1 className="font-heading text-lg font-semibold">
                Projects <span className="font-normal text-muted-foreground tabular-nums">{projects.length}</span>
              </h1>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await openDemoPreview()
                    } catch (error) {
                      reportError(error)
                    }
                  }}
                >
                  <Bird />
                  Demo
                </Button>
                <Button onClick={() => setCreating(true)}>
                  <Plus />
                  New project
                </Button>
              </div>
            </div>

            {legacyProjects.length > 0 && (
              <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm">
                    {legacyProjects.length} browser {legacyProjects.length === 1 ? 'project' : 'projects'}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{legacyProjects.map((project) => project.name).join(' · ')}</span>
                </div>
                <Button variant="outline" disabled={importing} onClick={() => runAction(importBrowserProjects())}>
                  {importing ? 'Importing…' : 'Import browser projects'}
                </Button>
              </div>
            )}

            {sorted.length > 0 ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                {sorted.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </ul>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                <Plus className="size-5" />
                No projects yet
              </button>
            )}
          </main>
        </div>
      </div>

      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}

/** Username and sign-out, tucked into a menu in the top bar */
function AccountMenu() {
  const workspace = useWorkspace((s) => s.workspace) ?? ''
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-2 px-1.5" aria-label={`Account: ${workspace}`}>
            <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background uppercase">
              {workspace.slice(0, 1)}
            </span>
            <span className="max-w-32 truncate">{workspace}</span>
            <ChevronDown className="text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">Workspace · {workspace}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => runAction(signOut())}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NewProjectDialog({ open: isOpen, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (next) setName('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm" initialFocus={nameRef}>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            const project = createProject(name.trim() || 'Untitled project')
            useProjects.getState().add(project)
            onOpenChange(false)
            open(project.id)
          }}
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <Input ref={nameRef} placeholder="Untitled project" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
          <DialogFooter>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
      <Card className="group gap-0 rounded-lg py-0">
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
            <span className="text-xs text-muted-foreground">Empty</span>
          )}
        </button>
        <div className="flex items-center gap-0.5 px-3 py-2">
          <button type="button" onClick={() => open(project.id)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-medium">{project.name}</div>
            <div className="text-xs text-muted-foreground">
              {project.notes.length} {project.notes.length === 1 ? 'banknote' : 'banknotes'}
            </div>
          </button>
          <IconButton label="Rename" onClick={() => setRenaming(true)}>
            <Pencil />
          </IconButton>
          <IconButton label="Duplicate" onClick={() => runAction(useProjects.getState().duplicate(project.id))}>
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
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => runAction(useProjects.getState().remove(project.id))}>
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
