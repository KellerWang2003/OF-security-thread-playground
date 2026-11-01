import { EyeOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { InlineField, ScrubField, Section, Segmented } from '../components/controls'
import { clamp } from '../lib/frames'
import {
  LENS_EFFECTS,
  VIEW_LIMITS,
  cyclesFromLens,
  framesReached,
  lensAngle,
  lensCycle,
  lensMix,
  lensState,
  respondsTo,
  revealCycle,
  type Axis,
  type LensEffect,
  type LensState,
} from '../lib/lens'
import { CYCLE_LIMITS, FRAME_COLORS } from '../lib/notes'
import { updateProject } from '../lib/store'
import type { Note, TiltSettings } from '../lib/types'
import { setTilt, useTilt } from '../tilt/tilt'

const round = (v: number, digits = 0) => Math.round(v * 10 ** digits) / 10 ** digits
const swatch = (note: Note, i: number) => {
  const frame = note.frames.at(i)
  return frame?.kind === 'color' ? frame.color : FRAME_COLORS[i % FRAME_COLORS.length]
}

/**
 * The project's lens, as an effect: what tilting does. Each effect asks only what it needs and works out the
 * rest; Custom exposes the raw values. Like Cycle, it applies to every banknote in the project.
 */
export function EffectSection({ projectId, note }: { projectId: string; note: Note }) {
  const { tilt } = note
  const lens = lensState(tilt, note.frames)
  const [setBy, setSetBy] = useState<'tilt' | 'lens'>('tilt')
  const set = (patch: Partial<TiltSettings>) =>
    updateProject(projectId, (p) => ({ ...p, notes: p.notes.map((n) => ({ ...n, tilt: { ...n.tilt, ...patch } })) }))

  const chooseEffect = (effect: LensEffect) => {
    if (effect === 'custom') {
      // Custom starts from exactly what the current effect gives
      set({ effect, cycleDeg: round(lens.cycleY ?? tilt.cycleDeg), yOn: lens.cycleY != null, cycleXDeg: lens.cycleX == null ? null : round(lens.cycleX) })
    } else if (effect === 'side' || effect === 'both') {
      set({ effect, cycleXDeg: tilt.cycleXDeg ?? tilt.cycleDeg })
    } else {
      set({ effect })
    }
  }

  const cycleField = (axis: Axis, label?: string) => (
    <ScrubField
      label={label ?? (axis === 'y' ? '↕' : '↔')}
      title={axis === 'y' ? 'Degrees of up/down tilt for one full cycle of the frames' : 'Degrees of side tilt for one full cycle of the frames'}
      value={round((axis === 'y' ? lens.cycleY : lens.cycleX) ?? tilt.cycleDeg)}
      min={CYCLE_LIMITS.min}
      max={CYCLE_LIMITS.max}
      unit="°"
      onChange={(v) => set(axis === 'y' ? { cycleDeg: v } : { cycleXDeg: v })}
    />
  )
  const runY = (
    <InlineField label="1 → 5" title="Which way frames 1 to 5 play on the up/down tilt; frame 1 is flat">
      <Segmented value={tilt.runY ?? 'up'} options={[{ value: 'down', label: 'Down' }, { value: 'up', label: 'Up' }]} onChange={(v) => set({ runY: v })} />
    </InlineField>
  )
  const runX = (
    <InlineField label="1 → 5 ↔" title="Which way frames 1 to 5 play on the side tilt">
      <Segmented value={tilt.runX ?? 'right'} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} onChange={(v) => set({ runX: v })} />
    </InlineField>
  )

  return (
    <Section nested title="Lens effect">
      <Select value={lens.effect} items={LENS_EFFECTS} onValueChange={(v) => { if (v) chooseEffect(v) }}>
        <SelectTrigger aria-label="Effect" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {LENS_EFFECTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {lens.effect === 'updown' && (<>{cycleField('y', 'Cycle')}{runY}</>)}
      {lens.effect === 'side' && (<>{cycleField('x', 'Cycle')}{runX}</>)}
      {lens.effect === 'both' && (
        <>
          <div className="grid grid-cols-2 gap-2">{cycleField('y')}{cycleField('x')}</div>
          {runY}{runX}
        </>
      )}
      {lens.effect === 'reveal' && (
        <>
          <InlineField label="All frames" title="The tilt that plays every frame; the other never reaches the middle frames">
            <Segmented value={lens.revealAxis} options={[{ value: 'y', label: '↕' }, { value: 'x', label: '↔' }]} onChange={(v) => set({ revealAxis: v })} />
          </InlineField>
          <div className="grid grid-cols-2 gap-2">
            {cycleField(lens.revealAxis)}
            <div className="flex h-8 items-center rounded-md bg-muted/40 px-2 text-sm tabular-nums text-muted-foreground"
              title="The slowest cycle that never reaches the middle frames within the viewing range">
              {lens.revealAxis === 'y' ? '↔' : '↕'} {revealCycle(note.frames, lens.viewDeg) ?? '–'}°
            </div>
          </div>
          {runY}{runX}
        </>
      )}
      {lens.effect === 'custom' && (
        <>
          <Segmented value={setBy} options={[{ value: 'tilt', label: 'By tilt' }, { value: 'lens', label: 'By lens' }]} onChange={setSetBy} />
          {setBy === 'tilt' ? (
            <>
              <AxisCycle axis="y" lens={lens} tilt={tilt} set={set} />
              <AxisCycle axis="x" lens={lens} tilt={tilt} set={set} />
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <ScrubField label="∠" title="Ridge angle from the banknote's horizontal" value={round(Math.abs(lensAngle(lens)), 1)} min={0} max={90} step={0.5} unit="°"
                onChange={(angle) => {
                  const c = cyclesFromLens(angle, lensCycle(lens))
                  set({ yOn: c.cycleY != null, cycleDeg: c.cycleY == null ? tilt.cycleDeg : round(clamp(c.cycleY, CYCLE_LIMITS.min, CYCLE_LIMITS.max)), cycleXDeg: c.cycleX == null ? null : round(clamp(c.cycleX, CYCLE_LIMITS.min, CYCLE_LIMITS.max)) })
                }} />
              <ScrubField label="C" title="Degrees of tilt across the ridges for one full cycle" value={round(lensCycle(lens))} min={CYCLE_LIMITS.min} max={CYCLE_LIMITS.max} unit="°"
                onChange={(cycle) => {
                  const c = cyclesFromLens(lensAngle(lens), cycle)
                  set({ yOn: c.cycleY != null, cycleDeg: c.cycleY == null ? tilt.cycleDeg : round(clamp(c.cycleY, CYCLE_LIMITS.min, CYCLE_LIMITS.max)), cycleXDeg: c.cycleX == null ? null : round(clamp(c.cycleX, CYCLE_LIMITS.min, CYCLE_LIMITS.max)) })
                }} />
            </div>
          )}
          {respondsTo(lens, 'y') && runY}
          {respondsTo(lens, 'x') && runX}
        </>
      )}

      <InlineField label="Viewing" title="How far viewers tilt, each way; also how far the banknotes tilt by hand">
        <ScrubField label="±" value={lens.viewDeg} min={VIEW_LIMITS.min} max={VIEW_LIMITS.max} unit="°" onChange={(viewDeg) => set({ viewDeg })} />
      </InlineField>

      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-2 text-xs">
        <div title="Ridge angle from the banknote's horizontal">
          <div className="text-muted-foreground">Lens angle</div>
          <div className="text-sm font-medium tabular-nums">{round(Math.abs(lensAngle(lens)), 1)}° {lensAngle(lens) < 0 ? '\\' : lensAngle(lens) > 0 && lensAngle(lens) < 90 ? '/' : ''}</div>
        </div>
        <div title="Degrees of tilt across the ridges for one full cycle">
          <div className="text-muted-foreground">Lens cycle</div>
          <div className="text-sm font-medium tabular-nums">{round(lensCycle(lens), 1)}°</div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {(['y', 'x'] as const).filter((a) => respondsTo(lens, a)).map((axis) => (
          <FramesRow key={axis} axis={axis} note={note} lens={lens} />
        ))}
      </div>

      <TiltMap note={note} lens={lens} />
    </Section>
  )
}

function AxisCycle({ axis, lens, tilt, set }: { axis: Axis; lens: LensState; tilt: TiltSettings; set: (patch: Partial<TiltSettings>) => void }) {
  const on = respondsTo(lens, axis)
  const other: Axis = axis === 'y' ? 'x' : 'y'
  return (
    <div className="flex items-center gap-2">
      {on ? (
        <ScrubField
          className="flex-1"
          label={axis === 'y' ? '↕' : '↔'}
          title={axis === 'y' ? 'Degrees of up/down tilt for one full cycle of the frames' : 'Degrees of side tilt for one full cycle of the frames'}
          value={round((axis === 'y' ? lens.cycleY : lens.cycleX) ?? tilt.cycleDeg)}
          min={CYCLE_LIMITS.min}
          max={CYCLE_LIMITS.max}
          unit="°"
          onChange={(v) => set(axis === 'y' ? { cycleDeg: v } : { cycleXDeg: v })}
        />
      ) : (
        <div className="flex h-8 flex-1 items-center rounded-md bg-muted/40 px-2 text-sm text-muted-foreground">{axis === 'y' ? '↕' : '↔'} Off</div>
      )}
      <Switch
        checked={on}
        // One tilt always has to respond
        disabled={on && !respondsTo(lens, other)}
        aria-label={axis === 'y' ? 'Up/down tilt responds' : 'Side tilt responds'}
        onCheckedChange={(next) => set(axis === 'y' ? { yOn: next } : { cycleXDeg: next ? (tilt.cycleXDeg ?? tilt.cycleDeg) : null })}
      />
    </div>
  )
}

/** The frames one tilt alone shows within the viewing range; frames it never reaches are struck out */
function FramesRow({ axis, note, lens }: { axis: Axis; note: Note; lens: LensState }) {
  const reached = framesReached(note, axis, lens)
  return (
    <div className="flex items-center gap-1.5" title={axis === 'y' ? 'Frames tilting up or down shows' : 'Frames tilting side to side shows'}>
      <span className="w-4 shrink-0 text-xs text-muted-foreground">{axis === 'y' ? '↕' : '↔'}</span>
      {note.frames.map((frame, i) => {
        const seen = reached.has(i)
        return (
          <span key={frame.id}
            title={seen ? undefined : axis === 'y' ? 'Never seen tilting up or down' : 'Never seen tilting side to side'}
            className={cn('flex h-6 min-w-6 items-center justify-center gap-0.5 rounded px-1 text-[11px] font-medium tabular-nums', !seen && 'opacity-40')}
            style={{ backgroundColor: `color-mix(in oklch, ${swatch(note, i)} 35%, transparent)` }}>
            {seen ? i + 1 : <><EyeOff className="size-3" />{i + 1}</>}
          </span>
        )
      })}
    </div>
  )
}

const MAP_RES = 72

/**
 * Side tilt across, up/down tilt down (up at the top), each to the viewing range, coloured by the frame that
 * shows. The bands run along the ridges. Drag the dot to tilt every banknote.
 */
function TiltMap({ note, lens }: { note: Note; lens: LensState }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const angle = useTilt((s) => (s.source === 'hold' ? s.target : s.angle))
  const angleX = useTilt((s) => (s.source === 'hold' ? s.targetX : s.angleX))
  const range = lens.viewDeg
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    for (let py = 0; py < MAP_RES; py++) {
      for (let px = 0; px < MAP_RES; px++) {
        const x = ((px + 0.5) / MAP_RES) * 2 * range - range
        const y = range - ((py + 0.5) / MAP_RES) * 2 * range
        ctx.fillStyle = swatch(note, lensMix(note, { x, y }, lens).current)
        ctx.fillRect(px, py, 1, 1)
      }
    }
  }, [note, lens, range])

  const tiltAt = (clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    const x = clamp(((clientX - rect.left) / rect.width) * 2 * range - range, -range, range)
    const y = clamp(range - ((clientY - rect.top) / rect.height) * 2 * range, -range, range)
    setTilt({ source: 'hold', target: respondsTo(lens, 'y') ? Math.round(y) : 0, targetX: respondsTo(lens, 'x') ? Math.round(x) : 0 })
  }
  const dot = { left: `${((clamp(angleX, -range, range) + range) / (2 * range)) * 100}%`, top: `${((range - clamp(angle, -range, range)) / (2 * range)) * 100}%` }

  return (
    <div
      ref={box}
      className={cn('relative aspect-square w-full touch-none overflow-hidden rounded-md border border-border/60 select-none', dragging ? 'cursor-grabbing' : 'cursor-crosshair')}
      title="Tilt map: side tilt across, up/down tilt down"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
        tiltAt(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => { if (dragging && e.buttons) tiltAt(e.clientX, e.clientY) }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onLostPointerCapture={() => setDragging(false)}
    >
      <canvas ref={canvas} width={MAP_RES} height={MAP_RES} className="absolute inset-0 size-full [image-rendering:pixelated] opacity-80" />
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-foreground/20" />
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-foreground/20" />
      <div className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow" style={dot} />
    </div>
  )
}
