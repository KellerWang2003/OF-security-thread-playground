import { undoProject, redoProject, updateNote } from '../lib/store'
import { beginHistoryGroup, endHistoryGroup, breakHistoryGroup } from '../lib/history'
import { pressLight, releaseLight, togglePlayback } from '../tilt/tilt'
import { lensState } from '../lib/lens'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Project } from '../lib/types'
import { AddNoteDialog } from '../editor/AddNoteDialog'
import { Canvas } from '../editor/Canvas'
import { ExportDialog } from '../editor/ExportDialog'
import { Inspector } from '../editor/Inspector'
import { ProjectPanel } from '../editor/ProjectPanel'
import { TimelineBar } from '../editor/TimelineBar'
import { TiltRail } from '../editor/TiltRail'
import { addWatermark, layerOf, removeWatermark, type Layer } from '../editor/watermarkActions'

/** Keys typed into these, or pressed while a dialog or menu is open, are not shortcuts */
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"]'
const POPUP = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

/**
 * A full-screen canvas with floating panels: project and banknotes top left, the frame timeline along
 * the bottom, and the selected banknote's selected layer on the right.
 */
export function Editor({ project, isDemo = false }: { project: Project; isDemo?: boolean }) {
  const [selectedId, setSelectedId] = useState<string>()
  // Which part of the selected banknote the right panel shows. It stays as you click from banknote to banknote,
  // so tilting or picking another banknote never throws you out of the lens settings
  const [layer, setLayer] = useState<Layer>('thread')
  const [editingNoteId, setEditingNoteId] = useState<string>()
  const [selectedWindowId, setSelectedWindowId] = useState<string>()
  const [placingNoteId, setPlacingNoteId] = useState<string>()
  const note = project.notes.find((n) => n.id === selectedId)
  const shownLayer = layerOf(note, layer)
  // Window editing has no mode of its own: it starts when a window is picked (on the canvas or in the panel,
  // or by turning windows on) and ends on a click elsewhere on the banknote, on the canvas, or with Escape
  const editingWindows = editingNoteId !== undefined && editingNoteId === selectedId && shownLayer === 'thread'
  // Placing the watermark works the same way: it starts when the watermark is picked (its layer, on the canvas
  // while backlit, adding it or uploading its image) and shows the banknote flat and backlit until it ends
  const placingWatermark = placingNoteId !== undefined && placingNoteId === selectedId && shownLayer === 'watermark'
  const exitWindows = () => {
    setEditingNoteId(undefined)
    setSelectedWindowId(undefined)
  }
  const exitPlacing = () => setPlacingNoteId(undefined)
  /** Selects a banknote and keeps the layer shown */
  const selectNote = (noteId: string | undefined) => {
    if (noteId !== selectedId) {
      exitWindows()
      exitPlacing()
    }
    setSelectedId(noteId)
  }
  /** Selects a banknote's layer; picking its watermark places it */
  const selectLayer = (noteId: string, next: Layer) => {
    selectNote(noteId)
    setLayer(next)
    if (next !== 'thread') exitWindows()
    setPlacingNoteId(next === 'watermark' ? noteId : undefined)
  }
  const [adding, setAdding] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [focus, setFocus] = useState<{ noteId: string; token: number }>()
  const isEmpty = project.notes.length === 0

  // A new project has no notes yet, so it opens straight into adding the first one. Opening after mount
  // rather than on the first render keeps the dialog from dismissing itself during mount.
  useEffect(() => {
    if (isEmpty) setAdding(true)
    // Only on opening the project, not every time the last note is deleted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  // Escape leaves window editing or placing the watermark, otherwise clears the selection, unless a field or dialog is handling it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && !document.querySelector('[role=dialog]')) {
        // Clearing the selection always leaves window editing and placing; avoids reading a stale selectedId here
        exitWindows()
        exitPlacing()
        if (!editingWindows && !placingWatermark) setSelectedId(undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingWindows, placingWatermark])

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

  // Delete while placing the watermark removes it, as it removes a selected window
  useEffect(() => {
    if (!placingWatermark || !placingNoteId) return
    const onDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const element = event.target instanceof Element ? event.target : null
      if (element?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]')) return
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      event.preventDefault()
      void removeWatermark({ projectId: project.id, noteId: placingNoteId })
      setLayer('thread')
      exitPlacing()
    }
    window.addEventListener('keydown', onDelete)
    return () => window.removeEventListener('keydown', onDelete)
  }, [placingWatermark, placingNoteId, project.id])

  // L holds every banknote up to the light: a tap flips the lamp switch, holding it peeks at the other light
  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'l' || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.defaultPrevented) return
      const element = event.target instanceof Element ? event.target : null
      if (element?.closest(TYPING) || document.querySelector(POPUP)) return
      event.preventDefault()
      if (!event.repeat) pressLight()
    }
    const onUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'l') releaseLight()
    }
    // A release that happens in another window never arrives: end the peek without flipping the switch
    const onBlur = () => releaseLight(performance.now(), false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      onBlur()
    }
  }, [])

  useEffect(() => {
    const onSpace = (event: KeyboardEvent) => {
      if (editingWindows || placingWatermark) return
      if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
      const element = event.target instanceof Element ? event.target : null
      if (element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"]')) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return
      event.preventDefault()
      if (!event.repeat) togglePlayback()
    }
    window.addEventListener('keydown', onSpace, { capture: true })
    return () => window.removeEventListener('keydown', onSpace, { capture: true })
  }, [editingWindows, placingWatermark])

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

  // Each banknote has its own lens; playback and the tilt pad follow the selected one (or the first)
  const reference = note ?? project.notes.at(0)
  const lens = reference ? lensState(reference.tilt, reference.frames) : undefined
  const noteRef = note ? { projectId: project.id, noteId: note.id } : undefined
  const tiltPad = !isEmpty && !editingWindows && !placingWatermark

  const selectAndFocus = (noteId: string) => {
    selectNote(noteId)
    setFocus({ noteId, token: Date.now() })
  }
  /** From the Banknotes list: a banknote row shows the banknote itself, a layer row that layer; a new banknote is brought into view */
  const selectFromList = (noteId: string, next?: Layer) => {
    const elsewhere = noteId !== selectedId
    if (next) selectLayer(noteId, next)
    else selectNote(noteId)
    if (elsewhere || next === 'note') setFocus({ noteId, token: Date.now() })
  }
  const dropWatermark = (noteId: string) => {
    void removeWatermark({ projectId: project.id, noteId })
    if (noteId === selectedId && shownLayer === 'watermark') setLayer('thread')
    if (noteId === placingNoteId) exitPlacing()
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
        <Canvas projectId={project.id} notes={project.notes} selectedId={note?.id} onSelect={selectNote} onSelectLayer={selectLayer} onExitWindows={exitWindows} focus={focus} editingWindows={editingWindows} selectedWindowId={selectedWindowId} onWindowSelect={setSelectedWindowId} onExport={() => setExporting(true)}
          placingWatermark={placingWatermark} onExitPlacing={exitPlacing}
          onEditWindow={(noteId, windowId) => {
            selectLayer(noteId, 'thread')
            setEditingNoteId(noteId)
            setSelectedWindowId(windowId)
          }} />
      )}

      {tiltPad && <TiltRail limit={lens?.viewDeg} playback={reference && lens ? { projectId: project.id, tilt: reference.tilt, lens } : undefined} />}
      <ProjectPanel isDemo={isDemo} project={project} selectedId={note?.id} layer={shownLayer} onSelect={selectFromList} onAdd={() => setAdding(true)} aboveTilt={tiltPad}
        onAddWatermark={(noteId) => {
          addWatermark({ projectId: project.id, noteId })
          selectFromList(noteId, 'watermark')
        }}
        onRemoveWatermark={dropWatermark} />
      {!isEmpty && (
        <TimelineBar projectId={project.id} notes={project.notes} note={note} noteRef={noteRef} besidePanel={note !== undefined} />
      )}
      {note && noteRef && <Inspector key={note.id} note={note} noteRef={noteRef} layer={shownLayer} onExport={() => setExporting(true)} selectedWindowId={editingWindows ? selectedWindowId : undefined}
        onWindowSelect={(windowId) => {
          if (!windowId) return exitWindows()
          setEditingNoteId(note.id)
          setSelectedWindowId(windowId)
        }}
        onPlaceWatermark={() => setPlacingNoteId(note.id)}
        onRemoveWatermark={() => dropWatermark(note.id)} />}

      {exporting && <ExportDialog project={project} selectedId={note?.id} open={exporting} onOpenChange={setExporting} />}

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
