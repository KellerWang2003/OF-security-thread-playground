import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { CheckboxField, ColorField, Field, ScrubField, Segmented, SwitchField } from '../components/controls'
import { reportError } from '../cloud/notices'
import type { ExportFormat } from '../lib/exportMedia'
import { exportSize } from '../lib/exportRender'
import type { Project } from '../lib/types'
import { useTilt } from '../tilt/tilt'

type Scope = 'selected' | 'all' | 'choose'

const FPS: Record<ExportFormat, number[]> = { mp4: [30, 60], gif: [20, 25] }
const SCALE = { mp4: 8, gif: 5 }

/** Exports one playback loop of the tilt as MP4 or GIF, for one, all or some banknotes */
export function ExportDialog({ project, selectedId, open, onOpenChange }: {
  project: Project
  selectedId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [format, setFormat] = useState<ExportFormat>('mp4')
  const [scope, setScope] = useState<Scope>(selectedId ? 'selected' : 'all')
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(selectedId ? [selectedId] : project.notes.map((n) => n.id)))
  const [separate, setSeparate] = useState(false)
  const [scale, setScale] = useState(SCALE.mp4)
  const [fps, setFps] = useState(30)
  const [loops, setLoops] = useState(1)
  const [background, setBackground] = useState('#f4f4f5')
  const [transparent, setTransparent] = useState(false)
  const [progress, setProgress] = useState<number>()
  const abort = useRef<AbortController>(null)
  const { sheen, perspective } = useTilt()

  const notes = scope === 'selected' ? project.notes.filter((n) => n.id === selectedId)
    : scope === 'all' ? project.notes
    : project.notes.filter((n) => chosen.has(n.id))
  const several = notes.length > 1
  const options = { format, notes, separate: several && separate, scale, fps, loops: format === 'gif' ? 1 : loops, sheen, perspective,
    background: format === 'gif' && transparent ? undefined : background }
  const size = exportSize(notes, options)
  const busy = progress !== undefined

  const changeFormat = (next: ExportFormat) => {
    setFormat(next)
    setFps(FPS[next][0])
    setScale(SCALE[next])
  }

  const run = async () => {
    const controller = new AbortController()
    abort.current = controller
    setProgress(0)
    try {
      // The encoders load only when someone exports
      const { downloadFile, exportTilt } = await import('../lib/exportMedia')
      downloadFile(await exportTilt(project.name, options, setProgress, controller.signal))
      onOpenChange(false)
    } catch (error) {
      if (!controller.signal.aborted) reportError(error)
    } finally {
      abort.current = null
      setProgress(undefined)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next) abort.current?.abort()
      onOpenChange(next)
    }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
        </DialogHeader>
        <fieldset disabled={busy} className="contents">
          <Field label="Format">
            <Segmented value={format} options={[{ value: 'mp4', label: 'MP4' }, { value: 'gif', label: 'GIF' }]} onChange={changeFormat} />
          </Field>
          <Field label="Banknotes">
            <Segmented
              value={scope}
              options={[
                ...(selectedId ? [{ value: 'selected' as const, label: 'Selected' }] : []),
                { value: 'all', label: 'All' },
                { value: 'choose', label: 'Choose' },
              ]}
              onChange={setScope}
            />
            {scope === 'choose' && (
              <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border border-border/60 p-2.5">
                {project.notes.map((n) => (
                  <CheckboxField key={n.id} label={n.name} checked={chosen.has(n.id)} onChange={(on) => setChosen((set) => {
                    const next = new Set(set)
                    if (on) next.add(n.id)
                    else next.delete(n.id)
                    return next
                  })} />
                ))}
              </div>
            )}
          </Field>
          {several && (
            <Field label="Files">
              <Segmented value={separate ? 'separate' : 'one'} options={[{ value: 'one', label: 'Side by side' }, { value: 'separate', label: 'Separate' }]}
                onChange={(next) => setSeparate(next === 'separate')} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Scale">
              <ScrubField label="px" title="Pixels per millimetre" value={scale} min={2} max={40} step={1} unit="/mm" onChange={setScale} />
            </Field>
            {format === 'mp4' && (
              <Field label="Loops">
                <ScrubField label="×" title="Times the playback loop repeats" value={loops} min={1} max={10} onChange={setLoops} />
              </Field>
            )}
          </div>
          <Field label="Frame rate">
            <Segmented value={String(fps)} options={FPS[format].map((f) => ({ value: String(f), label: `${f} fps` }))} onChange={(next) => setFps(Number(next))} />
          </Field>
          <Field label="Background">
            {!(format === 'gif' && transparent) && <ColorField value={background} onChange={setBackground} />}
            {format === 'gif' && <SwitchField label="Transparent" checked={transparent} onChange={setTransparent} />}
          </Field>
        </fieldset>
        {busy && <Progress value={Math.round(progress * 100)} />}
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {notes.length > 0 && `${size.width} × ${size.height} px · ${size.seconds.toFixed(1)} s`}
          </span>
          <div className="flex gap-2">
            {busy && <Button variant="outline" onClick={() => abort.current?.abort()}>Cancel</Button>}
            <Button disabled={busy || notes.length === 0} onClick={() => void run()}>
              {busy ? `Exporting ${Math.round(progress * 100)}%` : 'Export'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
