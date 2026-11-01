import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, EyeOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { InlineField, ScrubField, Section, Segmented } from '../components/controls'
import { clamp } from '../lib/frames'
import {
  LENS_EFFECTS,
  cyclesFromLens,
  framesReached,
  lensAngle,
  lensCycle,
  lensMix,
  lensState,
  respondsTo,
  revealMinFast,
  type Axis,
  type LensEffect,
  type LensState,
} from '../lib/lens'
import { CYCLE_LIMITS } from '../lib/notes'
import { CycleBar, Explain, MiniNote, RidgeIcon, TiltArrow, previewTilt, swatch, useClock } from './LensVisuals'
import { updateProject } from '../lib/store'
import type { Note, TiltSettings } from '../lib/types'
import { setTilt, useTilt } from '../tilt/tilt'

const round = (v: number, digits = 0) => Math.round(v * 10 ** digits) / 10 ** digits

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

  const cycleField = (axis: Axis, label?: string) => {
    const value = round((axis === 'y' ? lens.cycleY : lens.cycleX) ?? tilt.cycleDeg)
    return (
      <Explain
        picture={<CycleBar note={note} offset={lens.offset} cycleDeg={value} />}
        caption={axis === 'y' ? `Tilt ${value}° up or down to play every frame once` : `Tilt ${value}° to the side to play every frame once`}>
        <ScrubField
          label={label ?? (axis === 'y' ? '↕' : '↔')}
          value={value}
          min={CYCLE_LIMITS.min}
          max={CYCLE_LIMITS.max}
          unit="°"
          onChange={(v) => set(axis === 'y' ? { cycleDeg: v } : { cycleXDeg: v })}
        />
      </Explain>
    )
  }
  // Flat shows the middle frame; one way plays on towards the last frame, the other back towards frame 1
  const runCaption = ([toLast, toFirst]: [string, string]) => {
    const n = note.frames.length
    const mid = lens.offset > 0 ? Math.ceil(n / 2) : 1
    return lens.offset > 0
      ? `Flat shows frame ${mid}. Tilting ${toLast} plays on to ${n}; tilting ${toFirst} goes back to 1`
      : `Frames play 1 → ${n} as the banknote tilts ${toLast}, and backwards the other way`
  }
  const runY = (
    <InlineField label={<Explain label={respondsTo(lens, 'x') ? '1 → 5 ↕' : '1 → 5'} picture={<RunPreview note={note} lens={lens} axis="y" />}
      caption={runCaption(lens.dirY > 0 ? ['up', 'down'] : ['down', 'up'])} />}>
      <Segmented value={tilt.runY ?? 'up'} options={[
        { value: 'down', label: <><ArrowDown className="size-3" />Down</> },
        { value: 'up', label: <><ArrowUp className="size-3" />Up</> },
      ]} onChange={(v) => set({ runY: v })} />
    </InlineField>
  )
  const runX = (
    <InlineField label={<Explain label={respondsTo(lens, 'y') ? '1 → 5 ↔' : '1 → 5'} picture={<RunPreview note={note} lens={lens} axis="x" />}
      caption={runCaption(lens.dirX > 0 ? ['right', 'left'] : ['left', 'right'])} />}>
      <Segmented value={tilt.runX ?? 'right'} options={[
        { value: 'left', label: <><ArrowLeft className="size-3" />Left</> },
        { value: 'right', label: <><ArrowRight className="size-3" />Right</> },
      ]} onChange={(v) => set({ runX: v })} />
    </InlineField>
  )

  return (
    <>
    <Section nested>
      <EffectPicker note={note} lens={lens} onChoose={chooseEffect} />

      {lens.effect === 'updown' && (<>{cycleField('y', 'Cycle')}{runY}</>)}
      {lens.effect === 'side' && (<>{cycleField('x', 'Cycle')}{runX}</>)}
      {lens.effect === 'both' && (
        <>
          {cycleField('y', 'Cycle')}
          {runY}{runX}
        </>
      )}
      {lens.effect === 'reveal' && (
        <>
          <InlineField label="All frames" title="The tilt that plays every frame; the other only reaches the middle ones within ±60°">
            <Segmented value={lens.revealAxis} options={[{ value: 'y', label: '↕ Up/down' }, { value: 'x', label: '↔ Side' }]} onChange={(v) => set({ revealAxis: v })} />
          </InlineField>
          <div className="grid grid-cols-2 gap-2">
            {cycleField(lens.revealAxis)}
            {lens.revealSafe ? (
              <div className="flex h-8 items-center rounded-md bg-muted/40 px-2 text-sm tabular-nums text-muted-foreground"
                title="Worked out: the slowest cycle that keeps the outer frames hidden at any tilt up to 90°, wobble included">
                {lens.revealAxis === 'y' ? '↔' : '↕'} {round((lens.revealAxis === 'y' ? lens.cycleX : lens.cycleY) ?? 0)}°
              </div>
            ) : (
              <div className="flex h-8 items-center rounded-md bg-destructive/10 px-2 text-sm tabular-nums text-destructive"
                title="This cycle is too short for the wobble allowance: drifting onto this tilt alone would show the hidden frames">
                {lens.revealAxis === 'y' ? '↕' : '↔'} ≥ {revealMinFast(note.frames, lens.offset, lens.wobble)}°
              </div>
            )}
          </div>
          <Explain
            picture={<WobblePreview note={note} lens={lens} />}
            caption={`Hidden frames stay hidden even if the hand drifts ${round(lens.wobble, 1)}° ${lens.revealAxis === 'y' ? 'up or down' : 'sideways'} while tilting ${lens.revealAxis === 'y' ? 'sideways' : 'up or down'}`}>
            <ScrubField label="Wobble" title="Allowance for a hand that isn't perfectly straight" value={round(lens.wobble, 1)} min={0} max={20} step={0.5} unit="°"
              onChange={(v) => set({ revealWobble: v })} />
          </Explain>
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

    </Section>

    <Section nested>
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
    </>
  )
}

/** The effect dropdown: each option named by its ridges, with a picture of them and what it does in a line */
function EffectPicker({ note, lens, onChoose }: { note: Note; lens: LensState; onChoose: (effect: LensEffect) => void }) {
  // Each option's ridges as they would be if picked now; Custom shows the lens as it stands
  const angleOf = (effect: LensEffect) =>
    effect === 'custom' || effect === lens.effect ? lensAngle(lens) : lensAngle(lensState({ ...note.tilt, effect }, note.frames))
  return (
    <Select value={lens.effect} items={LENS_EFFECTS} onValueChange={(v) => { if (v) onChoose(v) }}>
      <SelectTrigger aria-label="Effect" className="w-full">
        <RidgeIcon angle={lensAngle(lens)} />
        <SelectValue className="flex-1 text-left" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {LENS_EFFECTS.map(({ value, label, description }) => (
          <SelectItem key={value} value={value} className="items-start py-1.5">
            <RidgeIcon angle={angleOf(value)} className="mt-0.5" />
            <span className="flex min-w-0 flex-col gap-0.5 whitespace-normal">
              <span>{label}</span>
              <span className="text-[11px] leading-snug whitespace-normal text-muted-foreground">{description}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** A banknote rocking in the 1 → 5 direction and back, its thread numbered with the frame that shows */
function RunPreview({ note, lens, axis }: { note: Note; lens: LensState; axis: Axis }) {
  const t = useClock()
  const cycle = (axis === 'y' ? lens.cycleY : lens.cycleX) ?? 30
  // One way, then the other, as far as a viewer would tilt
  const sign = Math.floor(t / 2.4) % 2 === 0 ? 1 : -1
  const tilt = previewTilt(t, Math.min(cycle, 60), { axis, sign })
  return (
    <div className="relative">
      <MiniNote note={note} lens={lens} tilt={tilt} label className="h-16 w-24" />
      <TiltArrow tilt={tilt} className="text-background/70" />
    </div>
  )
}

/** The slow tilt swept all the way to 90° each way while the hand drifts on the fast tilt: the outer frames never show */
function WobblePreview({ note, lens }: { note: Note; lens: LensState }) {
  const t = useClock()
  const slow = Math.sin((t / 4) * Math.PI * 2) * 90
  const drift = Math.sin(t * 7) * lens.wobble
  const tilt = lens.revealAxis === 'y' ? { x: slow, y: drift } : { x: drift, y: slow }
  return (
    <div className="relative">
      <MiniNote note={note} lens={lens} tilt={tilt} label className="h-16 w-24" />
      <span className="pointer-events-none absolute top-0.5 right-1 text-[10px] leading-none text-background/70 tabular-nums">{Math.round(Math.abs(slow))}°</span>
    </div>
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
