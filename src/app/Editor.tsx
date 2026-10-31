import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Project } from '../lib/types'
import { AddNoteDialog } from '../editor/AddNoteDialog'
import { Canvas } from '../editor/Canvas'
import { Inspector } from '../editor/Inspector'
import { ProjectPanel } from '../editor/ProjectPanel'
import { TimelineBar } from '../editor/TimelineBar'

/**
 * A full-screen canvas with floating panels: project and banknotes top left, the frame timeline along
 * the bottom, and the selected note's properties on the right.
 */
export function Editor({ project }: { project: Project }) {
  const [selectedId, setSelectedId] = useState<string>()
  const [adding, setAdding] = useState(false)
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

  const selectAndFocus = (noteId: string) => {
    setSelectedId(noteId)
    setFocus({ noteId, token: Date.now() })
  }

  return (
    <div className="relative flex h-full bg-muted/40">
      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center">
          <Button onClick={() => setAdding(true)}>
            <Plus />
            Add a banknote
          </Button>
        </div>
      ) : (
        <Canvas projectId={project.id} notes={project.notes} selectedId={note?.id} onSelect={setSelectedId} focus={focus} />
      )}

      <ProjectPanel project={project} selectedId={note?.id} onSelect={selectAndFocus} onAdd={() => setAdding(true)} />
      {!isEmpty && <TimelineBar note={note} noteRef={noteRef} besidePanel={note !== undefined} />}
      {note && noteRef && <Inspector key={note.id} note={note} noteRef={noteRef} />}

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
