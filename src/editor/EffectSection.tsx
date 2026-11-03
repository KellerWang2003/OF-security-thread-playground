import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, EyeOff, MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { Labeled, ScrubField, Section, Segmented } from '../components/controls'
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
  flatLabel,
  flatStep,
  frameEdges,
  reachSpans,
  revealMinFast,
  revealReaches,
  stepOffset,
  tiltReach,
  type Axis,
  type LensEffect,
  type LensState,
} from '../lib/lens'
import { CYCLE_LIMITS } from '../lib/notes'
import { frameNumber } from '../lib/pattern'
import { PRINT_RIDGES, setPrintView, usePrintView } from '../lib/printView'
import { switchEffect } from '../lib/switchEffect'
import { CycleBar, Explain, MiniNote, RidgeIcon, swatch, useClock } from './LensVisuals'
import { PrintCanvas } from './PrintView'
import { useElementSize } from './useElementSize'
import type { Note, TiltSettings } from '../lib/types'
import { setTilt, useTilt } from '../tilt/tilt'

const round = (v: number, digits = 0) => Math.round(v * 10 ** digits) / 10 ** digits

/** Applies a change to the lens being edited: the banknote's, or one thread section's own */
export type SetLens = (patch: Partial<TiltSettings>) => void

/**
 * Which way frames run on each tilt. Flat always shows the middle frame, so the default (1 → 5 top to bottom
 * and left to right) rarely needs changing; it lives in the lens title's ⋯ menu.
 */
export function LensMenu({ note, set }: { note: Pick<Note, 'frames' | 'tilt'>; set: SetLens }) {
  const lens = lensState(note.tilt, note.frames)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Lens options" className="text-muted-foreground" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>1 → 5 ↕</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={lens.dirY < 0 ? 'down' : 'up'} onValueChange={(v) => set({ runY: v as 'up' | 'down' })}>
            <DropdownMenuRadioItem value="down"><ArrowDown />Top to bottom</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="up"><ArrowUp />Bottom to top</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>1 → 5 ↔</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={lens.dirX < 0 ? 'left' : 'right'} onValueChange={(v) => set({ runX: v as 'left' | 'right' })}>
            <DropdownMenuRadioItem value="right"><ArrowRight />Left to right</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="left"><ArrowLeft />Right to left</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A lens, as an effect: what tilting does. Each effect asks only what it needs and works out the rest; Custom
 * exposes the raw values. `note` is the banknote, or one thread section as the lens sees it (`sectionView`: its
 * strips as frames, its own lens); the print shows `printNote`, the whole thread. The right panel gives its first
 * section a title and puts Edit thread (`children`) above the effect. The thread editor leaves out the preview
 * (`preview={false}`) and shows `LensPreview` on its own.
 */
export function EffectSection({ note, set, printNote = note, title, action, children, preview = true }: {
  note: Note
  set: SetLens
  printNote?: Note
  title?: string
  action?: ReactNode
  children?: ReactNode
  preview?: boolean
}) {
  const { tilt } = note
  const lens = lensState(tilt, note.frames)
  const [setBy, setSetBy] = useState<'tilt' | 'lens'>('tilt')

  const chooseEffect = (effect: LensEffect) => set(switchEffect(tilt, lens, effect))

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
          onChange={(v) => set({ cycleDeg: v })}
        />
      </Explain>
    )
  }
  return (
    <>
    <Section nested title={title} action={action}>
      {children}
      <Labeled label="Effect">
        <EffectPicker note={note} lens={lens} onChoose={chooseEffect} />
      </Labeled>

      {/* Which tilt hides frames, then the Cycle, above where flat sits and how far each tilt reaches (Keller put the
          cycle first, 3 November), then the wobble allowance */}
      {lens.effect === 'reveal' && (
          <div className="flex items-center gap-3" title="The tilt that never shows the outer frames, at any angle; the other tilt plays every frame">
            <span className="shrink-0 text-xs text-muted-foreground">Hidden on</span>
            <div className="min-w-0 flex-1">
              <Segmented value={lens.revealAxis === 'y' ? 'x' : 'y'} options={[{ value: 'x', label: '↔ Side' }, { value: 'y', label: '↕ Up/down' }]} onChange={(v) => set({ revealAxis: v === 'y' ? 'x' : 'y' })} />
            </div>
          </div>
      )}
      {lens.effect === 'updown' && (cycleField('y', 'Cycle'))}
      {lens.effect === 'side' && (cycleField('x', 'Cycle'))}
      {lens.effect === 'both' && (
        cycleField('y', 'Cycle')
      )}
      {lens.effect === 'reveal' && (
        <Labeled label="Cycle">
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
        </Labeled>
      )}
      {lens.effect === 'custom' && (
        <>
          <Labeled label="Set by">
            <Segmented value={setBy} options={[{ value: 'tilt', label: 'By tilt' }, { value: 'lens', label: 'By lens' }]} onChange={setSetBy} />
          </Labeled>
          {setBy === 'tilt' ? (
            <Labeled label="Cycle">
              <AxisCycle axis="y" lens={lens} tilt={tilt} set={set} />
              <AxisCycle axis="x" lens={lens} tilt={tilt} set={set} />
            </Labeled>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Lens angle">
              <ScrubField label="∠" title="Ridge angle from the banknote's horizontal" value={round(Math.abs(lensAngle(lens)), 1)} min={0} max={90} step={0.5} unit="°"
                onChange={(angle) => {
                  const c = cyclesFromLens(angle, lensCycle(lens))
                  set({ yOn: c.cycleY != null, cycleDeg: c.cycleY == null ? tilt.cycleDeg : round(clamp(c.cycleY, CYCLE_LIMITS.min, CYCLE_LIMITS.max)), cycleXDeg: c.cycleX == null ? null : round(clamp(c.cycleX, CYCLE_LIMITS.min, CYCLE_LIMITS.max)) })
                }} />
              </Labeled>
              <Labeled label="Lens cycle">
              <ScrubField label="C" title="Degrees of tilt across the ridges for one full cycle" value={round(lensCycle(lens))} min={CYCLE_LIMITS.min} max={CYCLE_LIMITS.max} unit="°"
                onChange={(cycle) => {
                  const c = cyclesFromLens(lensAngle(lens), cycle)
                  set({ yOn: c.cycleY != null, cycleDeg: c.cycleY == null ? tilt.cycleDeg : round(clamp(c.cycleY, CYCLE_LIMITS.min, CYCLE_LIMITS.max)), cycleXDeg: c.cycleX == null ? null : round(clamp(c.cycleX, CYCLE_LIMITS.min, CYCLE_LIMITS.max)) })
                }} />
              </Labeled>
            </div>
          )}
        </>
      )}

      <Labeled label="Seen flat">
        <Explain caption={`Flat: ${flatLabel(flatStep(tilt, note.frames.length))}. ` + (lens.effect === 'reveal'
          ? `Drag the pin to choose the frame seen straight on. Drag the band's ends to set how far the ${lens.revealAxis === 'y' ? '↔' : '↕'} tilt ever reaches: frames outside it stay hidden. Double-click to reset.`
          : 'Drag the pin to choose the frame seen straight on; double-click to reset. The lines under it show how far each tilt reaches by 90°.')}>
          <FlatStrip note={note} lens={lens} set={set} />
        </Explain>
      </Labeled>
      {lens.effect === 'reveal' && (
          <Explain
            picture={<WobblePreview note={note} lens={lens} />}
            caption={`Hidden frames stay hidden even if the hand drifts ${round(lens.wobble, 1)}° ${lens.revealAxis === 'y' ? 'up or down' : 'sideways'} while tilting ${lens.revealAxis === 'y' ? 'sideways' : 'up or down'}`}>
            <ScrubField label="Wobble" title="Allowance for a hand that isn't perfectly straight" value={round(lens.wobble, 1)} min={0} max={20} step={0.5} unit="°"
              onChange={(v) => set({ revealWobble: v })} />
          </Explain>
      )}

    </Section>

    {preview && (
      <Section nested>
        <LensPreview note={note} printNote={printNote} />
      </Section>
    )}
    </>
  )
}

/** What the lens gives, for information only: its angle and cycle, the frames each tilt shows, and the tilt map or print */
export function LensPreview({ note, printNote = note }: { note: Note; printNote?: Note }) {
  const lens = lensState(note.tilt, note.frames)
  return (
    <>
      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-2 text-xs">
        <div title="Ridge angle from the banknote's horizontal">
          <div className="text-muted-foreground">Lens angle</div>
          <div className="text-sm font-medium tabular-nums">{round(Math.abs(lensAngle(lens)), 1)}° {lensAngle(lens) < 0 ? '/' : lensAngle(lens) > 0 && lensAngle(lens) < 90 ? '\\' : ''}</div>
        </div>
        <div title="Degrees of tilt across the ridges for one full cycle">
          <div className="text-muted-foreground">Lens cycle</div>
          <div className="text-sm font-medium tabular-nums">{round(lensCycle(lens), 1)}°</div>
        </div>
      </div>

      <Labeled label="Frames seen">
        <div className="flex flex-col gap-1.5">
          {(['y', 'x'] as const).filter((a) => respondsTo(lens, a)).map((axis) => (
            <FramesRow key={axis} axis={axis} note={note} lens={lens} />
          ))}
        </div>
      </Labeled>

      <TiltMap note={note} lens={lens} printNote={printNote} />
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
/**
 * The frames as one strip, each as wide as its share of the cycle, with a pin where flat sits: drag it to move
 * flat, snapping to the start and middle of each frame. Each tilt's reach either way from flat shows under it;
 * for Partial reveal on one tilt the slow tilt's reach is a band whose ends you drag to hide more or fewer frames.
 */
function FlatStrip({ note, lens, set }: { note: Note; lens: LensState; set: (patch: Partial<TiltSettings>) => void }) {
  const strip = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<'flat' | 'reach' | null>(null)
  const count = note.frames.length
  const edges = frameEdges(note.frames)
  const step = flatStep(note.tilt, count)
  const reveal = lens.effect === 'reveal'
  const slowAxis: Axis = lens.revealAxis === 'y' ? 'x' : 'y'
  const fast = (lens.revealAxis === 'y' ? lens.cycleY : lens.cycleX) ?? 0
  const reaches = reveal ? revealReaches(note.frames, lens.offset, fast, lens.wobble) : []
  const rows = (['y', 'x'] as const).filter((a) => respondsTo(lens, a) && !(reveal && a === slowAxis))
  const band = reveal && reaches.length ? reachSpans(lens.offset, tiltReach(lens, slowAxis)) : []

  const at = (clientX: number) => {
    const box = strip.current?.getBoundingClientRect()
    return box ? clamp((clientX - box.left) / box.width, 0, 1) : 0
  }
  const follow = (clientX: number, mode: 'flat' | 'reach') => {
    const u = at(clientX)
    if (mode === 'flat') {
      // The nearest start or middle of a frame
      let best = 0
      for (let k = 1; k < 2 * count; k++) if (Math.abs(stepOffset(k, note.frames) - u) < Math.abs(stepOffset(best, note.frames) - u)) best = k
      if (best !== step) set({ flatAt: best })
    } else if (reaches.length) {
      // The reach nearest to how far the pointer is from flat, either way round the loop
      const d = Math.min(Math.abs(u - lens.offset), 1 - Math.abs(u - lens.offset))
      let level = 0
      reaches.forEach((r, k) => { if (Math.abs(r.reach - d) < Math.abs((reaches.at(level)?.reach ?? 0) - d)) level = k })
      set({ revealLevel: level })
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={strip}
        role="slider"
        aria-label="Flat"
        aria-valuetext={flatLabel(step)}
        aria-valuemin={0}
        aria-valuemax={2 * count - 1}
        aria-valuenow={step}
        tabIndex={0}
        className={cn('relative mt-2 h-6 touch-none rounded outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50', drag ? 'cursor-grabbing' : 'cursor-pointer')}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          const mode = (e.target as HTMLElement).closest('[data-reach]') ? 'reach' : 'flat'
          setDrag(mode)
          // Show the banknote straight on while flat or the reach changes
          setTilt({ source: 'hold', target: 0, targetX: 0 })
          follow(e.clientX, mode)
        }}
        onPointerMove={(e) => {
          if (!drag) return
          if (e.buttons === 0) return setDrag(null)
          follow(e.clientX, drag)
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onLostPointerCapture={() => setDrag(null)}
        onDoubleClick={() => set({ flatAt: undefined })}
        onKeyDown={(e) => {
          const next = e.key === 'ArrowRight' ? step + 1 : e.key === 'ArrowLeft' ? step - 1 : null
          if (next === null) return
          e.preventDefault()
          set({ flatAt: clamp(next, 0, 2 * count - 1) })
        }}
      >
        <div className="absolute inset-0 flex overflow-hidden rounded">
          {note.frames.map((frame, i) => (
            <div key={frame.id} className="flex items-center justify-center border-r border-background text-[10px] font-medium tabular-nums last:border-r-0"
              style={{ width: `${((edges.at(i + 1) ?? 1) - (edges.at(i) ?? 0)) * 100}%`, backgroundColor: `color-mix(in oklch, ${swatch(note, i)} 35%, transparent)` }}>
              {frameNumber(note.frames, i)}
            </div>
          ))}
        </div>
        {band.map(([lo, hi], k) => (
          <div key={k} className="pointer-events-none absolute inset-y-0 rounded-sm border-2 border-primary/70 bg-primary/10"
            style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
        ))}
        {/* The band's two ends, where it meets frames that stay hidden; drag either to hide more or fewer */}
        {band.length > 0 && [lens.offset - tiltReach(lens, slowAxis), lens.offset + tiltReach(lens, slowAxis)].map((end, k) => (
          <div key={k} data-reach title={`${slowAxis === 'y' ? '↕' : '↔'} reach: drag to hide more or fewer frames`}
            className="absolute inset-y-0 w-2.5 -translate-x-1/2 cursor-ew-resize"
            style={{ left: `${(((end % 1) + 1) % 1) * 100}%` }}>
            <div className="absolute inset-y-1 left-1/2 w-1 -translate-x-1/2 rounded-full bg-primary" />
          </div>
        ))}
        <div className="pointer-events-none absolute -top-2 bottom-0 -translate-x-1/2" style={{ left: `${lens.offset * 100}%` }}>
          <div className="size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-foreground" />
          <div className="absolute top-1.5 bottom-0 left-1/2 w-px -translate-x-1/2 bg-foreground" />
        </div>
      </div>
      {rows.map((axis) => (
        <div key={axis} className="relative h-0.5" title={axis === 'y' ? 'Up/down reach from flat' : 'Side reach from flat'}>
          {reachSpans(lens.offset, tiltReach(lens, axis)).map(([lo, hi], k) => (
            <div key={k} className={cn('absolute inset-y-0 rounded-full', axis === 'y' ? 'bg-sky-500' : 'bg-amber-500')} style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

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
            {seen ? frameNumber(note.frames, i) : <><EyeOff className="size-3" />{frameNumber(note.frames, i)}</>}
          </span>
        )
      })}
    </div>
  )
}

const MAP_RES = 72

/**
 * Side tilt across, up/down tilt down (up at the top), each to the viewing range, coloured by the frame that
 * shows, with a dot at the current tilt. The bands run along the ridges. Only a picture: clicking swaps it for the
 * print (the thread's frames woven under the ridges, `PrintCanvas`) and back.
 */
function TiltMap({ note, lens, printNote }: { note: Note; lens: LensState; printNote: Note }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const range = lens.viewDeg
  const print = usePrintView((s) => s.on)
  const ridges = usePrintView((s) => s.ridges)
  const size = useElementSize(box)
  const { frames, tilt } = note

  // Redrawn only when the lens or frames change: moving or renaming the banknote used to redraw it on
  // every pointer move. The lens follows from tilt and frames, so it is recomputed here, not read from props.
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const shape = { frames, tilt }
    const map = lensState(tilt, frames)
    const colours = frames.map((_, i) => swatch(shape, i))
    for (let py = 0; py < MAP_RES; py++) {
      for (let px = 0; px < MAP_RES; px++) {
        const x = ((px + 0.5) / MAP_RES) * 2 * range - range
        const y = range - ((py + 0.5) / MAP_RES) * 2 * range
        ctx.fillStyle = colours[lensMix(shape, { x, y }, map).current] ?? colours[0] ?? 'transparent'
        ctx.fillRect(px, py, 1, 1)
      }
    }
  }, [frames, tilt, range])

  const flip = () => setPrintView({ on: !print })

  return (
    <div className="flex flex-col gap-2">
      <Labeled label={print ? 'Print' : 'Tilt map'}>
        <Explain caption={print
          ? 'The print, magnified: every frame cut into strips under the ridges. The lit strips show at this tilt. Click for the tilt map.'
          : 'Which frame shows at each tilt. Click to see the print.'}>
          <div
            ref={box}
            role="button"
            tabIndex={0}
            aria-label={print ? 'Print' : 'Tilt map'}
            aria-pressed={print}
            className={cn('relative aspect-square w-full cursor-pointer overflow-hidden rounded-md border border-border/60 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50',
              print && 'bg-muted/60')}
            onClick={flip}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              flip()
            }}
          >
            <canvas ref={canvas} width={MAP_RES} height={MAP_RES} className={cn('absolute inset-0 size-full [image-rendering:pixelated] opacity-80', print && 'invisible')} />
            {print ? (
              size && <PrintCanvas note={printNote} ridges={ridges} sizePx={size.width} />
            ) : (
              <>
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-foreground/20" />
                <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-foreground/20" />
                <TiltMapDot noteId={note.id} range={range} />
              </>
            )}
          </div>
        </Explain>
      </Labeled>
      {print && <RidgesField ridges={ridges} />}
    </div>
  )
}

/** How many ridges the print draws across the thread; remembered per browser, like the view */
function RidgesField({ ridges }: { ridges: number }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <ScrubField label="Ridges" title="Ridges drawn across the thread, magnified: real ones are far finer" value={ridges}
        min={PRINT_RIDGES.min} max={PRINT_RIDGES.max} onChange={(v) => setPrintView({ ridges: v })} />
    </div>
  )
}

/**
 * The whole thread's print, every section cut under its own ridges: what the thread editor shows in place of a lens
 * while angles are mixed and no section is selected.
 */
export function ThreadPrint({ note }: { note: Note }) {
  const box = useRef<HTMLDivElement>(null)
  const ridges = usePrintView((s) => s.ridges)
  const size = useElementSize(box)
  return (
    <div className="flex flex-col gap-2">
      <Explain caption="The print, magnified: each section's frames cut into strips under its own ridges. The lit strips show at this tilt.">
        <div ref={box} role="img" aria-label="Print" className="relative aspect-square w-full overflow-hidden rounded-md border border-border/60 bg-muted/60">
          {size && <PrintCanvas note={note} ridges={ridges} sizePx={size.width} />}
        </div>
      </Explain>
      <RidgesField ridges={ridges} />
    </div>
  )
}

/** The tilt map's dot, where the frames shown are (the timeline's once scrubbed); on its own so only it re-renders as the tilt moves */
function TiltMapDot({ noteId, range }: { noteId: string; range: number }) {
  const angle = useTilt((s) => s.frameTilts[noteId]?.y ?? (s.source === 'hold' ? s.target : s.angle))
  const angleX = useTilt((s) => s.frameTilts[noteId]?.x ?? (s.source === 'hold' ? s.targetX : s.angleX))
  const dot = { left: `${((clamp(angleX, -range, range) + range) / (2 * range)) * 100}%`, top: `${((range - clamp(angle, -range, range)) / (2 * range)) * 100}%` }
  return <div className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow" style={dot} />
}
