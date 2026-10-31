import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { NoteView } from '../components/NoteView'
import { Button, Field, NumberField, Segmented } from '../components/ui'
import { NOTE_PRESETS, createProject, presetNote } from '../lib/notes'
import { updateProject, useProjects } from '../lib/store'
import type { NotePresetId, Project } from '../lib/types'

const open = (id: string) => (location.hash = `#/p/${id}`)

export function ProjectList() {
  const projects = useProjects((s) => s.projects)
  const [creating, setCreating] = useState(projects.length === 0)
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Security thread playground</h1>
          <p className="text-sm text-neutral-500">Design a lenticular thread frame by frame and tilt the note to preview it.</p>
        </div>
        {!creating && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            New project
          </Button>
        )}
      </header>

      {creating && <NewProject onCancel={projects.length ? () => setCreating(false) : undefined} />}

      {sorted.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {sorted.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </ul>
      )}
    </div>
  )
}

function NewProject({ onCancel }: { onCancel?: () => void }) {
  const [name, setName] = useState('')
  const [preset, setPreset] = useState<NotePresetId>('25')
  const [size, setSize] = useState({ widthMm: 68, heightMm: 134 })

  const create = () => {
    const note =
      preset === 'custom'
        ? { preset, ...size, color: '#8A4F9E' }
        : presetNote(preset)
    const label = NOTE_PRESETS.find((p) => p.id === preset)?.label
    const project = createProject(name.trim() || `${label ? `${label} note` : 'Custom note'} thread`, note)
    useProjects.getState().add(project)
    open(project.id)
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault()
        create()
      }}
    >
      <h2 className="text-sm font-medium">New project</h2>
      <div className="grid gap-4 sm:grid-cols-[1fr_320px]">
        <Field label="Name">
          <input
            autoFocus
            className="h-8 rounded-md border border-neutral-200 px-2 text-sm outline-none focus:border-neutral-400"
            placeholder="e.g. 25 thread, two colours"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Note size">
          <Segmented<NotePresetId>
            value={preset}
            options={[...NOTE_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom' }]}
            onChange={setPreset}
          />
        </Field>
      </div>
      {preset === 'custom' ? (
        <div className="grid max-w-[320px] grid-cols-2 gap-2 sm:ml-auto">
          <Field label="Width">
            <NumberField value={size.widthMm} min={20} max={250} unit="mm" onChange={(widthMm) => setSize((s) => ({ ...s, widthMm }))} />
          </Field>
          <Field label="Height">
            <NumberField value={size.heightMm} min={20} max={250} unit="mm" onChange={(heightMm) => setSize((s) => ({ ...s, heightMm }))} />
          </Field>
        </div>
      ) : (
        <p className="text-xs text-neutral-500 sm:text-right">
          {(() => {
            const p = NOTE_PRESETS.find((n) => n.id === preset)
            return p ? `${p.widthMm} × ${p.heightMm} mm, portrait, Flight series` : null
          })()}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button variant="primary" type="submit">
          Create
        </Button>
      </div>
    </form>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const thumbHeight = 160
  const scale = thumbHeight / Math.max(project.note.heightMm, project.note.widthMm * 1.2)

  return (
    <li className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={() => open(project.id)}
        className="flex h-[196px] items-center justify-center bg-neutral-50 transition-colors group-hover:bg-neutral-100"
      >
        <NoteView project={project} scale={scale} />
      </button>
      <div className="flex items-center gap-1 px-3 py-2">
        <button type="button" onClick={() => open(project.id)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-medium">{project.name}</div>
          <div className="text-xs text-neutral-500">
            {project.note.widthMm} × {project.note.heightMm} mm · {project.frames.length} frames
          </div>
        </button>
        <Button
          variant="ghost"
          size="icon"
          title="Rename"
          onClick={() => {
            const name = window.prompt('Rename project', project.name)
            if (name?.trim()) updateProject(project.id, (p) => ({ ...p, name: name.trim() }))
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" title="Duplicate" onClick={() => void useProjects.getState().duplicate(project.id)}>
          <Copy className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Delete"
          onClick={() => {
            if (window.confirm(`Delete "${project.name}"? Its uploaded frames are deleted too.`)) {
              void useProjects.getState().remove(project.id)
            }
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  )
}
