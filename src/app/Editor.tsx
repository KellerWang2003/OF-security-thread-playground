import { ArrowLeft, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { updateProject } from '../lib/store'
import type { Project } from '../lib/types'
import { AddNoteDialog } from '../editor/AddNoteDialog'
import { Canvas } from '../editor/Canvas'
import { FramesPanel } from '../editor/FramesPanel'
import { Inspector } from '../editor/Inspector'
import { NotesPanel } from '../editor/NotesPanel'
import { TiltBar } from '../editor/TiltBar'

/**
 * Left: the selected note's frames, with the notes accordion at the bottom. Centre: the canvas with the
 * universal tilt bar. Right: the selected note's properties, only while a note is selected.
 */
export function Editor({ project }: { project: Project }) {
  const [selectedId, setSelectedId] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [focus, setFocus] = useState<{ noteId: string; token: number }>()
  const isEmpty = project.notes.length === 0

  // A new project has no notes yet, so it opens straight into adding the first one. Opening after mount
  // rather than on the first render keeps the dialog from dismissing itself during mount.
  useEffect(() => {
    if (isEmpty) setAdding(true)
    // Only on opening the project, not every time the last note is deleted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  // Escape clears the selection, unless a field or dialog is handling it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && !document.querySelector('[role=dialog]')) {
        setSelectedId(undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const note = project.notes.find((n) => n.id === selectedId)
  const noteRef = note ? { projectId: project.id, noteId: note.id } : undefined
  // The tilt bar follows the selected note, or the first note when nothing is selected
  const tiltNote = note ?? project.notes.at(0)

  const selectAndFocus = (noteId: string) => {
    setSelectedId(noteId)
    setFocus({ noteId, token: Date.now() })
  }

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
        <aside className="flex w-[260px] shrink-0 flex-col border-r bg-background">
          {note && noteRef ? (
            <FramesPanel note={note} noteRef={noteRef} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
              {isEmpty ? 'Add a note to start.' : 'Select a note on the canvas to see its frames.'}
            </div>
          )}
          <NotesPanel
            projectId={project.id}
            notes={project.notes}
            selectedId={note?.id}
            open={notesOpen}
            onOpenChange={setNotesOpen}
            onSelect={selectAndFocus}
            onAdd={() => setAdding(true)}
          />
        </aside>

        {isEmpty ? (
          <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/40 text-center">
            <p className="text-sm text-muted-foreground">This project has no notes yet.</p>
            <Button onClick={() => setAdding(true)}>
              <Plus />
              Add a note
            </Button>
          </main>
        ) : (
          <main className="relative flex min-w-0 flex-1 flex-col">
            <Canvas
              projectId={project.id}
              notes={project.notes}
              selectedId={note?.id}
              onSelect={setSelectedId}
              focus={focus}
            />
            {tiltNote && <TiltBar note={tiltNote} />}
          </main>
        )}

        {note && noteRef && <Inspector key={note.id} note={note} noteRef={noteRef} />}
      </div>

      {adding && (
        <AddNoteDialog
          projectId={project.id}
          notes={project.notes}
          open={adding}
          onOpenChange={setAdding}
          onAdded={selectAndFocus}
        />
      )}
    </div>
  )
}
