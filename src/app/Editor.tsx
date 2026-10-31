import { ArrowLeft, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { updateProject } from '../lib/store'
import type { Project } from '../lib/types'
import { AddNoteDialog } from '../editor/AddNoteDialog'
import { FrameStrip } from '../editor/FrameStrip'
import { Inspector } from '../editor/Inspector'
import { NotesPanel } from '../editor/NotesPanel'
import { Stage } from '../editor/Stage'

export function Editor({ project }: { project: Project }) {
  const [selectedId, setSelectedId] = useState<string>()
  const [adding, setAdding] = useState(false)
  const isEmpty = project.notes.length === 0

  // A new project has no notes yet, so it opens straight into adding the first one. Opening after mount
  // rather than on the first render keeps the dialog from dismissing itself during mount.
  useEffect(() => {
    if (isEmpty) setAdding(true)
    // Only on opening the project, not every time the last note is deleted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])
  const note = project.notes.find((n) => n.id === selectedId) ?? project.notes.at(0)
  const noteRef = note ? { projectId: project.id, noteId: note.id } : undefined

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
        <Button variant="ghost" size="sm" onClick={() => (location.hash = '')}>
          <ArrowLeft />
          Projects
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <Input
          className="h-8 max-w-sm border-transparent font-medium shadow-none hover:border-input"
          value={project.name}
          onChange={(e) => updateProject(project.id, (p) => ({ ...p, name: e.target.value }))}
          aria-label="Project name"
        />
        <span className="ml-auto text-xs text-muted-foreground">Saved in this browser</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <NotesPanel
          projectId={project.id}
          notes={project.notes}
          selectedId={note?.id}
          onSelect={setSelectedId}
          onAdd={() => setAdding(true)}
        />
        {note && noteRef ? (
          <>
            <main className="flex min-w-0 flex-1 flex-col">
              <Stage note={note} noteRef={noteRef} />
              <FrameStrip note={note} />
            </main>
            <Inspector key={note.id} note={note} noteRef={noteRef} />
          </>
        ) : (
          <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/40 text-center">
            <p className="text-sm text-muted-foreground">This project has no notes yet.</p>
            <Button onClick={() => setAdding(true)}>
              <Plus />
              Add a note
            </Button>
          </main>
        )}
      </div>
      {adding && (
        <AddNoteDialog
          projectId={project.id}
          notes={project.notes}
          open={adding}
          onOpenChange={setAdding}
          onAdded={setSelectedId}
        />
      )}
    </div>
  )
}
