import { undoProject, redoProject, updateNote } from '../lib/store'
import { beginHistoryGroup, endHistoryGroup, breakHistoryGroup } from '../lib/history'
import { togglePlayback } from '../tilt/tilt'
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
export function Editor({ project, isDemo = false }: { project: Project; isDemo?: boolean }) {
  const [selectedId, setSelectedId] = useState<string>()
  const [editingNoteId, setEditingNoteId] = useState<string>()
  const [selectedWindowId, setSelectedWindowId] = useState<string>()
  const editingWindows = editingNoteId !== undefined && editingNoteId === selectedId
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
      if (e.defaultPrevented) return
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && !document.querySelector('[role=dialog]')) {
        if (editingWindows) { setEditingNoteId(undefined); setSelectedWindowId(undefined) }
        else setSelectedId(undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingWindows])

  useEffect(() => {
    if (!editingWindows) return
    const onDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const element = event.target instanceof Element ? event.target : null
      if (element?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]')) return
      if (!selectedWindowId || document.querySelector('[role="dialog"], [role="menu"]')) return
      event.preventDefault()
      updateNote(project.id, editingNoteId!, (n) => ({ ...n, thread: { ...n.thread,
        windows: { ...n.thread.windows, sections: n.thread.windows.sections.filter((s) => s.id !== selectedWindowId) } } }))
      setSelectedWindowId(undefined)
    }
    window.addEventListener('keydown', onDelete)
    return () => window.removeEventListener('keydown', onDelete)
  }, [editingWindows, editingNoteId, selectedWindowId, project.id])

  useEffect(() => {
    const onSpace = (event: KeyboardEvent) => {
      if (editingWindows) return
      if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
      const element = event.target instanceof Element ? event.target : null
      if (element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"]')) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return
      event.preventDefault()
      if (!event.repeat) togglePlayback()
    }
    window.addEventListener('keydown', onSpace, { capture: true })
    return () => window.removeEventListener('keydown', onSpace, { capture: true })
  }, [editingWindows])

  useEffect(() => {
    const onHistory = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing) return
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      const element = event.target instanceof Element ? event.target : null
      // Text fields keep native text undo while they are being edited.
      if (element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return
      event.preventDefault()
      if (key === 'y' || event.shiftKey) redoProject(project.id)
      else undoProject(project.id)
    }
    const endGesture = () => endHistoryGroup(project.id)
    window.addEventListener('keydown', onHistory)
    window.addEventListener('pointerup', endGesture, true)
    window.addEventListener('pointercancel', endGesture, true)
    window.addEventListener('blur', endGesture)
    return () => {
      window.removeEventListener('keydown', onHistory)
      window.removeEventListener('pointerup', endGesture, true)
      window.removeEventListener('pointercancel', endGesture, true)
      window.removeEventListener('blur', endGesture)
      endGesture()
    }
  }, [project.id])

  const note = project.notes.find((n) => n.id === selectedId)
  const noteRef = note ? { projectId: project.id, noteId: note.id } : undefined

  const selectAndFocus = (noteId: string) => {
    setSelectedId(noteId)
    setFocus({ noteId, token: Date.now() })
  }

  return (
    <div className="relative flex h-full bg-muted/40"
      onPointerDownCapture={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest('input, textarea, [contenteditable]')) beginHistoryGroup(project.id)
      }}
      onFocusCapture={() => breakHistoryGroup(project.id)}
      onBlurCapture={() => breakHistoryGroup(project.id)}
    >
      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center">
          <Button onClick={() => setAdding(true)}>
            <Plus />
            Add a banknote
          </Button>
        </div>
      ) : (
        <Canvas projectId={project.id} notes={project.notes} selectedId={note?.id} onSelect={setSelectedId} focus={focus} editingWindows={editingWindows} selectedWindowId={selectedWindowId} onWindowSelect={setSelectedWindowId} />
      )}

      <ProjectPanel isDemo={isDemo} project={project} selectedId={note?.id} onSelect={selectAndFocus} onAdd={() => setAdding(true)} />
      {!isEmpty && (
        <TimelineBar projectId={project.id} notes={project.notes} note={note} noteRef={noteRef} besidePanel={note !== undefined} />
      )}
      {note && noteRef && <Inspector key={note.id} note={note} noteRef={noteRef} editingWindows={editingWindows} selectedWindowId={selectedWindowId} onWindowSelect={setSelectedWindowId}
        onEditingWindowsChange={(editing) => {
          setEditingNoteId(editing ? note.id : undefined)
          setSelectedWindowId(undefined)
        }} />}

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
