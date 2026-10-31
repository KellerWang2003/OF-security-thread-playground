import { ChevronDown, ChevronUp, ImagePlus, Palette, RefreshCw, Trash2, Upload, X } from 'lucide-react'
import { FrameFill } from '../components/NoteView'
import { ColorField, Field, IconButton, NumberField, RangeField, Section, Segmented, SwitchField } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clamp } from '../lib/frames'
import { pickFiles } from '../lib/images'
import { MAX_FRAMES, MIN_FRAMES, NOTE_PRESETS, THREAD_WIDTH, defaultThreadX, presetNote } from '../lib/notes'
import { updateProject } from '../lib/store'
import type { NotePresetId, Project } from '../lib/types'
import { setTilt, useTilt, type TiltSource } from '../tilt/tilt'
import {
  addColorFrame,
  addImageFrames,
  deleteFrame,
  moveFrame,
  replaceFrameImage,
  setFaceImage,
  updateFrame,
} from './frameActions'

type Change = (project: Project) => Project

export function Inspector({ project }: { project: Project }) {
  const update = (change: Change) => updateProject(project.id, change)
  return (
    <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l bg-background">
      <NoteSection project={project} update={update} />
      <ThreadSection project={project} update={update} />
      <FramesSection project={project} />
      <TiltSection project={project} update={update} />
      <ViewSection />
    </aside>
  )
}

function NoteSection({ project, update }: { project: Project; update: (change: Change) => void }) {
  const { note, thread } = project
  const setSize = (widthMm: number, heightMm: number) =>
    update((p) => ({
      ...p,
      note: { ...p.note, preset: 'custom', widthMm, heightMm },
      thread: { ...p.thread, xMm: clamp(p.thread.xMm, 0, widthMm) },
    }))

  return (
    <Section title="Note">
      <Segmented<NotePresetId>
        value={note.preset}
        options={[...NOTE_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom' }]}
        onChange={(id) => {
          if (id === 'custom') return update((p) => ({ ...p, note: { ...p.note, preset: 'custom' } }))
          const next = presetNote(id)
          update((p) => ({
            ...p,
            note: { ...next, faceImageId: p.note.faceImageId },
            thread: { ...p.thread, xMm: clamp(p.thread.xMm, 0, next.widthMm) },
          }))
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <NumberField value={note.widthMm} min={20} max={250} step={1} unit="mm" onChange={(w) => setSize(w, note.heightMm)} />
        </Field>
        <Field label="Height">
          <NumberField value={note.heightMm} min={20} max={250} step={1} unit="mm" onChange={(h) => setSize(note.widthMm, h)} />
        </Field>
      </div>
      <Field label="Colour">
        <ColorField value={note.color} onChange={(color) => update((p) => ({ ...p, note: { ...p.note, color } }))} />
      </Field>
      <Field label="Face artwork" hint="Optional. Export at trim size; it sits behind the thread.">
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              const [file] = await pickFiles()
              if (file) await setFaceImage(project, file)
            }}
          >
            <Upload />
            {note.faceImageId ? 'Replace' : 'Upload'}
          </Button>
          {note.faceImageId && (
            <IconButton variant="outline" size="icon" label="Remove face artwork" onClick={() => void setFaceImage(project, undefined)}>
              <X />
            </IconButton>
          )}
        </div>
      </Field>
      {thread.xMm > note.widthMm && <p className="text-xs text-destructive">The thread sits outside the note.</p>}
    </Section>
  )
}

function ThreadSection({ project, update }: { project: Project; update: (change: Change) => void }) {
  const { note, thread } = project
  const set = (patch: Partial<Project['thread']>) => update((p) => ({ ...p, thread: { ...p.thread, ...patch } }))

  return (
    <Section title="Thread">
      <RangeField
        label="Width"
        value={thread.widthMm}
        min={THREAD_WIDTH.min}
        max={THREAD_WIDTH.max}
        step={THREAD_WIDTH.step}
        unit="mm"
        onChange={(widthMm) => set({ widthMm })}
      />
      <RangeField
        label="Position from left edge"
        value={thread.xMm}
        min={0}
        max={note.widthMm}
        step={0.5}
        unit="mm"
        onChange={(xMm) => set({ xMm })}
      />
      <div className="-mt-1 flex gap-1.5">
        <Button variant="outline" size="sm" onClick={() => set({ xMm: note.widthMm / 2 })}>
          Centre
        </Button>
        <Button variant="outline" size="sm" onClick={() => set({ xMm: defaultThreadX(note.widthMm) })}>
          Right of centre
        </Button>
      </div>
      <RangeField
        label="White surround"
        value={thread.surroundMm}
        min={0}
        max={8}
        step={0.5}
        unit="mm"
        onChange={(surroundMm) => set({ surroundMm })}
      />
      <Field label="Frame fit">
        <Segmented
          value={thread.fit}
          options={[
            { value: 'stretch', label: 'Full length' },
            { value: 'repeat', label: 'Repeat tile' },
          ]}
          onChange={(fit) => set({ fit })}
        />
      </Field>
      {thread.fit === 'repeat' && (
        <RangeField
          label="Tile length"
          value={thread.tileMm}
          min={1}
          max={note.heightMm}
          step={0.5}
          unit="mm"
          onChange={(tileMm) => set({ tileMm })}
        />
      )}
    </Section>
  )
}

function FramesSection({ project }: { project: Project }) {
  const { frames, thread } = project
  const full = frames.length >= MAX_FRAMES

  return (
    <Section title={`Frames · ${frames.length} of ${MAX_FRAMES}`}>
      <ol className="flex flex-col gap-1.5">
        {frames.map((frame, i) => (
          <li key={frame.id} className="flex items-center gap-2 rounded-lg border p-1.5">
            <div className="relative h-11 w-4 shrink-0 overflow-hidden rounded-sm bg-white ring-1 ring-border">
              <FrameFill frame={frame} fit={thread.fit} tilePx={12} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="tabular-nums">{i + 1}</span>
                <Input
                  aria-label="Frame name"
                  className="h-6 min-w-0 flex-1 border-transparent px-1 text-xs shadow-none hover:border-input"
                  value={frame.name}
                  onChange={(e) => updateFrame(project.id, frame.id, { name: e.target.value })}
                />
              </div>
              {frame.kind === 'color' ? (
                <ColorField value={frame.color} onChange={(color) => updateFrame(project.id, frame.id, { color })} />
              ) : (
                <span className="text-[11px] text-muted-foreground">Image</span>
              )}
            </div>
            <div className="flex flex-col">
              <IconButton size="icon-xs" label="Move up" disabled={i === 0} onClick={() => moveFrame(project.id, frame.id, -1)}>
                <ChevronUp />
              </IconButton>
              <IconButton size="icon-xs" label="Move down"
                disabled={i === frames.length - 1}
                onClick={() => moveFrame(project.id, frame.id, 1)}
              >
                <ChevronDown />
              </IconButton>
            </div>
            <div className="flex flex-col">
              <IconButton size="icon-xs" label={frame.kind === 'color' ? 'Use an image instead' : 'Replace image'}
                onClick={async () => {
                  const [file] = await pickFiles()
                  if (file) await replaceFrameImage(project.id, frame.id, file)
                }}
              >
                <RefreshCw />
              </IconButton>
              <IconButton size="icon-xs" label={frames.length <= MIN_FRAMES ? `A thread needs at least ${MIN_FRAMES} frames` : 'Delete frame'}
                disabled={frames.length <= MIN_FRAMES}
                onClick={() => void deleteFrame(project.id, frame.id)}
              >
                <Trash2 />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={full && !frames.every((f) => f.kind === 'color')}
          onClick={async () => {
            const files = await pickFiles({ multiple: true })
            if (files.length) await addImageFrames(project.id, files)
          }}
        >
          <ImagePlus />
          Upload images
        </Button>
        <Button variant="outline" disabled={full} onClick={() => addColorFrame(project.id)}>
          <Palette />
          Colour
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground/80">
        PNG, JPG or SVG, drawn at the thread's proportions. Uploading 2 or more images replaces the colour placeholders.
        Frame 1 shows at the start of the tilt range.
      </p>
    </Section>
  )
}

function TiltSection({ project, update }: { project: Project; update: (change: Change) => void }) {
  const { tilt } = project
  const { source, target, angle, wobbleSpeed, springBack, perspective, sheen } = useTilt()
  const set = (patch: Partial<Project['tilt']>) => update((p) => ({ ...p, tilt: { ...p.tilt, ...patch } }))

  return (
    <Section title="Tilt">
      <Segmented<TiltSource>
        value={source}
        options={[
          { value: 'drag', label: 'Drag' },
          { value: 'wobble', label: 'Wobble' },
          { value: 'slider', label: 'Slider' },
        ]}
        onChange={(next) => setTilt({ source: next, target: next === 'wobble' ? target : angle })}
      />
      <RangeField
        label="Angle"
        value={Math.round((source === 'slider' ? target : angle) * 10) / 10}
        min={-tilt.rangeDeg}
        max={tilt.rangeDeg}
        step={0.5}
        unit="°"
        onChange={(next) => setTilt({ source: 'slider', target: next })}
      />
      {source === 'wobble' && (
        <RangeField label="Wobble speed" value={wobbleSpeed} min={0.1} max={3} step={0.1} unit="×" onChange={(v) => setTilt({ wobbleSpeed: v })} />
      )}
      <Field label="Direction">
        <Segmented
          value={tilt.axis}
          options={[
            { value: 'vertical', label: 'Back and forth' },
            { value: 'horizontal', label: 'Side to side' },
          ]}
          onChange={(axis) => set({ axis })}
        />
      </Field>
      <RangeField label="Range (±)" value={tilt.rangeDeg} min={10} max={45} step={1} unit="°" onChange={(rangeDeg) => set({ rangeDeg })} />
      <RangeField
        label="Crossfade"
        value={Math.round(tilt.transition * 100)}
        min={0}
        max={100}
        step={5}
        unit="%"
        onChange={(v) => set({ transition: v / 100 })}
      />
      <SwitchField label="Spring back after dragging" checked={springBack} onChange={(v) => setTilt({ springBack: v })} />
      <SwitchField label="Show tilt in perspective" checked={perspective} onChange={(v) => setTilt({ perspective: v })} />
      <SwitchField label="Highlight on thread" checked={sheen} onChange={(v) => setTilt({ sheen: v })} />
    </Section>
  )
}

function ViewSection() {
  const zoom = useTilt((s) => s.zoom)
  return (
    <Section title="View">
      <RangeField label="Zoom" value={Math.round(zoom * 100)} min={50} max={300} step={10} unit="%" onChange={(v) => setTilt({ zoom: v / 100 })} />
    </Section>
  )
}
