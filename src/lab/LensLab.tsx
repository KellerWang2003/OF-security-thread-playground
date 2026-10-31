import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { InlineField, Panel, ScrubField, Segmented, SwitchField } from '@/components/controls'
import { cn } from '@/lib/utils'
import {
  acrossTilt,
  axisDirection,
  closeViewDrift,
  coverageRuns,
  cycleFraction,
  fittingRepeat,
  flatFraction,
  frameAt,
  lensFrom,
  reachFraction,
  repeatFit,
  samplesAcrossWidth,
  type FlatAt,
  type Lens,
  type ThreadGeometry,
} from '@/lib/lens'
import { drawFrame, frameFill } from './frameArt'

/** The lab lets you tilt further than the editor's ±60° so you can run past a cycle */
const TILT_LIMIT = 80
const RAD = Math.PI / 180

interface Settings {
  cycleX: number
  cycleY: number
  xOn: boolean
  yOn: boolean
  lean: 1 | -1
  flatAt: FlatAt
  count: number
  reach: number
  aircraft: boolean[]
  direction: 'vertical' | 'horizontal'
  widthMm: number
  /** Image width ÷ height; images stay upright */
  aspect: number
  gapMm: number
  noteW: number
  noteH: number
  drift: boolean
  viewMm: number
  pitchUm: number
  zoomPx: number
  ridges: boolean
}

const BASE: Settings = {
  cycleX: 60,
  cycleY: 200,
  xOn: true,
  yOn: true,
  lean: 1,
  flatAt: 'centre',
  count: 5,
  reach: 30,
  aircraft: [true, false, false, false, true],
  direction: 'vertical',
  widthMm: 5,
  aspect: 1,
  gapMm: 0,
  noteW: 150,
  noteH: 75,
  drift: false,
  viewMm: 300,
  pitchUm: 40,
  zoomPx: 18,
  ridges: true,
}

const PRESETS: { id: string; label: string; title: string; patch: Partial<Settings> }[] = [
  { id: 'today', label: 'Today', title: 'Horizontal lens: only up/down animates', patch: { xOn: false, yOn: true, cycleY: 64, flatAt: 'start', aircraft: [false, false, false, false, false] } },
  { id: '45', label: '45°', title: 'Both tilts play the sequence at the same speed', patch: { xOn: true, yOn: true, cycleX: 64, cycleY: 64, flatAt: 'centre', aircraft: [true, false, false, false, true] } },
  { id: 'steep', label: 'Steep', title: 'About 73°: a sideways tilt reaches the aircraft, up/down never does', patch: { xOn: true, yOn: true, cycleX: 60, cycleY: 200, flatAt: 'centre', aircraft: [true, false, false, false, true] } },
  { id: 'vertical', label: 'Vertical', title: 'Vertical lens: only left/right animates', patch: { xOn: true, yOn: false, cycleX: 64, flatAt: 'start', aircraft: [false, false, false, false, false] } },
]

const fmt = (v: number, digits = 1) => (Number.isFinite(v) ? (Math.round(v * 10 ** digits) / 10 ** digits).toString() : '∞')

export function LensLab() {
  const [s, setS] = useState<Settings>(BASE)
  const set = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }))
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [sweep, setSweep] = useState<'x' | 'y' | 'both' | null>(null)

  const lens = useMemo(
    () => lensFrom({ cycleX: s.xOn ? s.cycleX : null, cycleY: s.yOn ? s.cycleY : null, lean: s.lean }),
    [s.xOn, s.yOn, s.cycleX, s.cycleY, s.lean],
  )
  const aircraft = useMemo(() => s.aircraft.slice(0, s.count), [s.aircraft, s.count])
  const frameFor = useCallback(
    (x: number, y: number) => frameAt(cycleFraction(acrossTilt(lens, x, y), lens.cycleDeg, s.flatAt), s.count),
    [lens, s.flatAt, s.count],
  )

  // Sweeps: left/right, up/down, or one after the other, out to the reach and back
  useEffect(() => {
    if (!sweep) return
    let raf = 0
    const start = performance.now()
    const period = 2.4
    const tick = (now: number) => {
      const t = (now - start) / 1000
      const round = Math.floor(t / period)
      const v = s.reach * Math.sin((2 * Math.PI * t) / period)
      const axis = sweep === 'both' ? (round % 2 === 0 ? 'x' : 'y') : sweep
      setTilt(axis === 'x' ? { x: v, y: 0 } : { x: 0, y: v })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sweep, s.reach])

  return (
    <div className="h-full overflow-auto bg-muted/30">
      <header className="flex items-center gap-3 border-b bg-background px-4 py-2.5">
        <Button variant="ghost" size="sm" nativeButton={false} render={<a href="#/" />}>
          <ArrowLeft /> Playground
        </Button>
        <h1 className="text-sm font-medium">Lens lab</h1>
        <span className="text-xs text-muted-foreground">Lenticular lens at any angle: what each tilt shows, and what the print needs</span>
      </header>
      <div className="mx-auto grid max-w-[1400px] gap-4 p-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Controls s={s} set={set} lens={lens} />
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Card
              title="Tilt"
              caption="Drag the dot. Colours are the frames; the bands run along the ridges, so tilting along a band changes nothing. The dashed square is the reach."
            >
              <TiltPad s={s} tilt={tilt} frameFor={frameFor} onTilt={(t) => { setSweep(null); setTilt(t) }} />
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ['x', 'Sweep ↔'],
                    ['y', 'Sweep ↕'],
                    ['both', '↔ then ↕'],
                  ] as const
                ).map(([id, label]) => (
                  <Button key={id} size="sm" variant={sweep === id ? 'default' : 'outline'} onClick={() => setSweep(sweep === id ? null : id)}>
                    {label}
                  </Button>
                ))}
                <Button size="icon-sm" variant="ghost" aria-label="Back to flat" title="Back to flat" onClick={() => { setSweep(null); setTilt({ x: 0, y: 0 }) }}>
                  <RotateCcw />
                </Button>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  ↔ {fmt(tilt.x, 0)}° ↕ {fmt(tilt.y, 0)}°
                </span>
              </div>
            </Card>
            <Card
              title="Banknote"
              caption="What a viewer sees. Every copy on the thread shows the same frame, unless close-view drift is on."
            >
              <div className="relative">
                <NotePreview lens={lens} s={s} tilt={tilt} aircraft={aircraft} frameFor={frameFor} />
                <CloseUp index={frameFor(tilt.x, tilt.y)} count={s.count} aircraft={aircraft} aspect={s.aspect} />
              </div>
            </Card>
          </div>
          <Card
            title="Timeline"
            caption="One sequence for both tilts. The brackets show how far each tilt alone reaches from flat; the letters show which way it plays. Past the cycle the frames repeat (faded). Tinted frames are reached by one tilt only, grey parts by neither."
          >
            <Timeline lens={lens} s={s} tilt={tilt} aircraft={aircraft} />
          </Card>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card
              title="Print"
              caption="One image copy as printed: every frame cut into strips parallel to the ridges and woven together, magnified. The real strips are far finer."
            >
              <PrintView lens={lens} s={s} aircraft={aircraft} />
            </Card>
            <Card title="Print check" caption="Thread direction, width and repeat never change the animation. They decide whether this thread prints it cleanly.">
              <PrintCheck lens={lens} s={s} set={set} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <Panel className="flex min-w-0 flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{title}</h2>
        <p className="text-xs leading-snug text-muted-foreground">{caption}</p>
      </div>
      {children}
    </Panel>
  )
}

function Group({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-b border-border/60 px-4 py-3 last:border-b-0">
      <h2 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{title}</h2>
      {caption && <p className="-mt-1 text-xs leading-snug text-muted-foreground">{caption}</p>}
      {children}
    </section>
  )
}

function CycleField({ label, title, on, value, onToggle, onChange }: { label: string; title: string; on: boolean; value: number; onToggle: (on: boolean) => void; onChange: (v: number) => void }) {
  return (
    <InlineField label={label} title={title}>
      <div className="flex items-center gap-2">
        {on ? (
          <ScrubField className="flex-1" label="°" value={value} onChange={onChange} min={10} max={600} step={1} />
        ) : (
          <div className="flex h-8 flex-1 items-center rounded-md bg-muted/40 px-2 text-sm text-muted-foreground">Off</div>
        )}
        <Switch checked={on} onCheckedChange={onToggle} aria-label={`${label} on`} />
      </div>
    </InlineField>
  )
}

function Controls({ s, set, lens }: { s: Settings; set: (p: Partial<Settings>) => void; lens: Lens }) {
  const bothOff = !s.xOn && !s.yOn
  return (
    <Panel className="flex h-fit flex-col lg:sticky lg:top-4">
      <Group title="Presets">
        <div className="grid grid-cols-4 gap-1.5">
          {PRESETS.map((p) => (
            <Button key={p.id} size="sm" variant="outline" title={p.title} onClick={() => set(p.patch)}>
              {p.label}
            </Button>
          ))}
        </div>
      </Group>
      <Group title="Animation" caption="Set how many degrees each tilt needs to play the whole sequence. The lens angle follows from the two.">
        <CycleField label="↔ Cycle" title="Degrees of left/right tilt for one full pass" on={s.xOn} value={s.cycleX} onToggle={(xOn) => set({ xOn })} onChange={(cycleX) => set({ cycleX })} />
        <CycleField label="↕ Cycle" title="Degrees of up/down tilt for one full pass" on={s.yOn} value={s.cycleY} onToggle={(yOn) => set({ yOn })} onChange={(cycleY) => set({ cycleY })} />
        <InlineField label="Lean" title="Which way the ridges slant">
          <Segmented value={String(s.lean)} options={[{ value: '1', label: '/' }, { value: '-1', label: '\\' }]} onChange={(v) => set({ lean: v === '1' ? 1 : -1 })} />
        </InlineField>
        <InlineField label="Flat at" title="Where the flat banknote sits in the cycle">
          <Segmented value={s.flatAt} options={[{ value: 'start', label: 'Start' }, { value: 'centre', label: 'Centre' }]} onChange={(flatAt) => set({ flatAt })} />
        </InlineField>
        <InlineField label="Frames">
          <Segmented value={String(s.count)} options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => set({ count: Number(v) })} />
        </InlineField>
        <InlineField label="Aircraft in" title="Frames that also show the hidden aircraft">
          <div className="flex gap-1.5">
            {Array.from({ length: s.count }, (_, i) => (
              <label key={i} className="flex cursor-pointer flex-col items-center gap-1 text-[11px] text-muted-foreground">
                <Checkbox
                  checked={s.aircraft[i] ?? false}
                  onCheckedChange={(on) => set({ aircraft: Array.from({ length: 5 }, (_, j) => (j === i ? on : (s.aircraft[j] ?? false))) })}
                />
                {i + 1}
              </label>
            ))}
          </div>
        </InlineField>
        <InlineField label="Reach" title="How far people tilt a banknote">
          <ScrubField label="±" value={s.reach} onChange={(reach) => set({ reach })} min={5} max={TILT_LIMIT} step={1} unit="°" />
        </InlineField>
        <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-2.5 text-xs">
          <div title="Ridge angle from the banknote's horizontal">
            <div className="text-muted-foreground">Lens angle</div>
            <div className="text-base font-medium tabular-nums">{bothOff ? '–' : `${fmt(Math.abs(lens.angleDeg))}° ${lens.angleDeg < 0 ? '\\' : lens.angleDeg > 0 ? '/' : ''}`}</div>
          </div>
          <div title="Degrees of tilt across the ridges for one full pass">
            <div className="text-muted-foreground">Lens cycle</div>
            <div className="text-base font-medium tabular-nums">{bothOff ? '–' : `${fmt(lens.cycleDeg)}°`}</div>
          </div>
        </div>
      </Group>
      <Group title="Thread" caption="These only affect the print layer.">
        <InlineField label="Direction">
          <Segmented value={s.direction} options={[{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }]} onChange={(direction) => set({ direction })} />
        </InlineField>
        <InlineField label="Width">
          <ScrubField label="W" value={s.widthMm} onChange={(widthMm) => set({ widthMm })} min={2} max={12} step={0.5} unit="mm" />
        </InlineField>
        <InlineField label="Image" title="Image width ÷ height">
          <ScrubField label="W/H" value={s.aspect} onChange={(aspect) => set({ aspect })} min={0.25} max={4} step={0.05} />
        </InlineField>
        <InlineField label="Image gap">
          <ScrubField label="G" value={s.gapMm} onChange={(gapMm) => set({ gapMm })} min={0} max={20} step={0.01} unit="mm" />
        </InlineField>
        <InlineField label="Banknote" title="Width × height">
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField label="W" value={s.noteW} onChange={(noteW) => set({ noteW })} min={60} max={200} step={1} />
            <ScrubField label="H" value={s.noteH} onChange={(noteH) => set({ noteH })} min={40} max={200} step={1} />
          </div>
        </InlineField>
      </Group>
      <Group title="Viewing and film">
        <SwitchField label="Close-view drift" checked={s.drift} onChange={(drift) => set({ drift })} />
        <InlineField label="View distance">
          <ScrubField label="D" value={s.viewMm} onChange={(viewMm) => set({ viewMm })} min={100} max={800} step={10} unit="mm" />
        </InlineField>
        <InlineField label="Ridge pitch" title="Placeholder until the sponsor gives the film's real pitch">
          <ScrubField label="P" value={s.pitchUm} onChange={(pitchUm) => set({ pitchUm })} min={10} max={200} step={1} unit="µm" />
        </InlineField>
      </Group>
    </Panel>
  )
}

/** Where the image copies sit along the thread, in mm from the banknote's top-left corner */
function threadCopies(s: Settings) {
  const vertical = s.direction === 'vertical'
  const imgLen = vertical ? s.widthMm / s.aspect : s.widthMm * s.aspect
  const along = vertical ? s.noteH : s.noteW
  const step = Math.max(0.1, imgLen + s.gapMm)
  const centre = (vertical ? s.noteW : s.noteH) / 2
  const copies: { x: number; y: number; w: number; h: number }[] = []
  for (let a = 0; a < along && copies.length < 400; a += step) {
    copies.push(vertical ? { x: centre - s.widthMm / 2, y: a, w: s.widthMm, h: imgLen } : { x: a, y: centre - s.widthMm / 2, w: imgLen, h: s.widthMm })
  }
  return { copies, imgLen, step, along }
}

function TiltPad({ s, tilt, frameFor, onTilt }: { s: Settings; tilt: { x: number; y: number }; frameFor: (x: number, y: number) => number; onTilt: (t: { x: number; y: number }) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const size = 288
  const res = 144
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const x = ((px + 0.5) / res) * 2 * TILT_LIMIT - TILT_LIMIT
        const y = TILT_LIMIT - ((py + 0.5) / res) * 2 * TILT_LIMIT
        ctx.fillStyle = frameFill(frameFor(x, y), 80)
        ctx.fillRect(px, py, 1, 1)
      }
    }
  }, [frameFor])

  const toPad = (v: number) => ((v + TILT_LIMIT) / (2 * TILT_LIMIT)) * size
  const fromEvent = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const clamp = (v: number) => Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, v))
    let x = clamp(((e.clientX - r.left) / r.width) * 2 * TILT_LIMIT - TILT_LIMIT)
    let y = clamp(TILT_LIMIT - ((e.clientY - r.top) / r.height) * 2 * TILT_LIMIT)
    if (e.shiftKey) {
      if (Math.abs(x) > Math.abs(y)) y = 0
      else x = 0
    }
    onTilt({ x, y })
  }
  const r = (s.reach / TILT_LIMIT) * (size / 2)
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[288px] cursor-crosshair touch-none overflow-hidden rounded-md border select-none"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromEvent(e) }}
      onPointerMove={(e) => { if (e.buttons) fromEvent(e) }}
    >
      <canvas ref={canvas} width={res} height={res} className="absolute inset-0 size-full" style={{ imageRendering: 'pixelated' }} />
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 size-full">
        <line x1={size / 2} x2={size / 2} y1={0} y2={size} stroke="black" strokeOpacity={0.25} />
        <line y1={size / 2} y2={size / 2} x1={0} x2={size} stroke="black" strokeOpacity={0.25} />
        <rect x={size / 2 - r} y={size / 2 - r} width={2 * r} height={2 * r} fill="none" stroke="black" strokeOpacity={0.6} strokeDasharray="4 4" />
        <text x={size - 6} y={size / 2 - 6} textAnchor="end" fontSize={11} fill="black" fillOpacity={0.6}>R</text>
        <text x={6} y={size / 2 - 6} fontSize={11} fill="black" fillOpacity={0.6}>L</text>
        <text x={size / 2 + 6} y={14} fontSize={11} fill="black" fillOpacity={0.6}>U</text>
        <text x={size / 2 + 6} y={size - 6} fontSize={11} fill="black" fillOpacity={0.6}>D</text>
        <circle cx={toPad(tilt.x)} cy={size - toPad(tilt.y)} r={7} fill="white" stroke="black" strokeWidth={2} />
      </svg>
    </div>
  )
}

function NotePreview({ lens, s, tilt, aircraft, frameFor }: { lens: Lens; s: Settings; tilt: { x: number; y: number }; aircraft: boolean[]; frameFor: (x: number, y: number) => number }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = Math.min((width * 0.78) / s.noteW, 300 / s.noteH)
  const W = s.noteW * scale
  const H = s.noteH * scale
  const { copies } = threadCopies(s)

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const dpr = window.devicePixelRatio || 1
    el.width = Math.round(W * dpr)
    el.height = Math.round(H * dpr)
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0)
    ctx.clearRect(0, 0, s.noteW, s.noteH)
    for (const c of copies) {
      let x = tilt.x
      let y = tilt.y
      if (s.drift) {
        // A point right of centre is seen from further left, and a point above centre from further below
        x -= Math.atan((c.x + c.w / 2 - s.noteW / 2) / s.viewMm) / RAD
        y += Math.atan((c.y + c.h / 2 - s.noteH / 2) / s.viewMm) / RAD
      }
      drawFrame(ctx, frameFor(x, y), s.count, c.x, c.y, c.w, c.h, aircraft[frameFor(x, y)] ?? false)
    }
  })

  const vertical = s.direction === 'vertical'
  const thread = vertical
    ? { left: (s.noteW / 2 - s.widthMm / 2) * scale, top: 0, width: s.widthMm * scale, height: H }
    : { left: 0, top: (s.noteH / 2 - s.widthMm / 2) * scale, width: W, height: s.widthMm * scale }
  return (
    <div ref={box} className="flex min-h-[320px] items-center justify-center" style={{ perspective: `${Math.max(W, H) * 2.2}px` }}>
      <div
        className="relative rounded-sm shadow-md"
        style={{
          width: W,
          height: H,
          transform: `rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
          background: 'linear-gradient(135deg, hsl(40 30% 90%), hsl(200 20% 86%))',
        }}
      >
        <canvas ref={canvas} className="absolute inset-0 size-full" />
        {s.ridges && (
          <div
            className="pointer-events-none absolute"
            style={{
              ...thread,
              backgroundImage: `repeating-linear-gradient(${-lens.angleDeg}deg, rgb(255 255 255 / 0.28) 0 1px, transparent 1px 4px)`,
            }}
          />
        )}
      </div>
    </div>
  )
}

/** The frame at the centre of the thread, large enough to read */
function CloseUp({ index, count, aircraft, aspect }: { index: number; count: number; aircraft: boolean[]; aspect: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const h = 96
  const w = Math.round(Math.min(160, h * aspect))
  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const dpr = window.devicePixelRatio || 1
    el.width = w * dpr
    el.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawFrame(ctx, index, count, 0, 0, w, h, aircraft[index] ?? false)
  }, [index, count, aircraft, w])
  return (
    <div className="absolute right-0 bottom-0 flex flex-col items-end gap-1" title="Close-up of the frame at the thread's centre">
      <canvas ref={canvas} className="rounded border shadow-sm" style={{ width: w, height: h }} />
      <span className="text-xs text-muted-foreground tabular-nums">Frame {index + 1}</span>
    </div>
  )
}

/** Cycles shown at most on either side of the main one */
const MAX_REPEATS = 2

function Timeline({ lens, s, tilt, aircraft }: { lens: Lens; s: Settings; tilt: { x: number; y: number }; aircraft: boolean[] }) {
  const VW = 1000
  const left = 24
  const right = 24
  const flat = flatFraction(s.flatAt)
  // Reaches in cycles, not capped: a tilt can run past the cycle and the frames repeat
  const rx = reachFraction(s.reach, s.xOn ? s.cycleX : null)
  const ry = reachFraction(s.reach, s.yOn ? s.cycleY : null)
  const r = Math.max(rx, ry)
  const s0 = acrossTilt(lens, tilt.x, tilt.y)
  const head = lens.cycleDeg > 0 ? flat + s0 / lens.cycleDeg : flat
  // Show every cycle the reach or the current tilt runs into, up to a few repeats each way
  const lo = Math.max(-MAX_REPEATS, Math.min(0, Math.floor(Math.min(flat - r, head) + 1e-9)))
  const hi = Math.min(1 + MAX_REPEATS, Math.max(1, Math.ceil(Math.max(flat + r, head) - 1e-9)))
  const X = (f: number) => left + ((Math.max(lo, Math.min(hi, f)) - lo) / (hi - lo)) * (VW - left - right)
  const runs = coverageRuns(flat, rx, ry)
  const trackY = 120
  const trackH = 56
  const cycles = Array.from({ length: hi - lo }, (_, i) => lo + i)
  const boxW = (X(1) - X(0)) / s.count

  const bracket = (reach: number, y: number, color: string, name: string, axis: 'x' | 'y') => {
    if (reach <= 0) return null
    const dir = axisDirection(lens, axis)
    const pos = axis === 'x' ? 'R' : 'U'
    const neg = axis === 'x' ? 'L' : 'D'
    const fwd = dir >= 0 ? pos : neg
    const back = dir >= 0 ? neg : pos
    const a = flat - reach
    const b = flat + reach
    const clipA = a < lo
    const clipB = b > hi
    const passes = reach * 2 >= 1 ? ` · ${fmt(reach * 2, 1)} ${fmt(reach * 2, 1) === '1' ? 'cycle' : 'cycles'}` : ''
    return (
      <g>
        <rect x={X(a)} y={y} width={X(b) - X(a)} height={6} rx={3} fill={color} />
        {clipA && <path d={`M${X(lo) - 2} ${y + 3}l10 -7v14z`} fill={color} />}
        {clipB && <path d={`M${X(hi) + 2} ${y + 3}l-10 -7v14z`} fill={color} />}
        <text x={(X(a) + X(b)) / 2} y={y - 8} textAnchor="middle" fontSize={14} fontWeight={600} fill="currentColor">{name}{passes}</text>
        {!clipB && <text x={X(b)} y={y - 8} textAnchor="middle" fontSize={13} fill={color} fontWeight={600}>{fwd}</text>}
        {!clipA && <text x={X(a)} y={y - 8} textAnchor="middle" fontSize={13} fill={color} fontWeight={600}>{back}</text>}
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${VW} 240`} className="w-full text-foreground">
      {bracket(ry, 36, 'hsl(18 80% 52%)', '↕ up/down', 'y')}
      {bracket(rx, 84, 'hsl(214 80% 52%)', '↔ left/right', 'x')}
      {cycles.map((k) => (
        <g key={k} opacity={k === 0 ? 1 : 0.5}>
          {Array.from({ length: s.count }, (_, i) => {
            const a = k + i / s.count
            const b = k + (i + 1) / s.count
            const cx = (X(a) + X(b)) / 2
            return (
              <g key={i}>
                <rect x={X(a) + 2} y={trackY} width={X(b) - X(a) - 4} height={trackH} rx={8} fill={frameFill(i)} stroke="currentColor" strokeOpacity={0.25} />
                <text x={cx} y={trackY + (aircraft[i] ? 25 : 33)} textAnchor="middle" fontSize={14} fill="currentColor">{boxW > 90 ? `Frame ${i + 1}` : i + 1}</text>
                {aircraft[i] && <text x={cx} y={trackY + 43} textAnchor="middle" fontSize={12} fill="currentColor" fillOpacity={0.7}>{boxW > 90 ? '+ aircraft' : '✈'}</text>}
              </g>
            )
          })}
          {k !== 0 && (
            <text x={(X(k) + X(k + 1)) / 2} y={trackY + trackH + 22} textAnchor="middle" fontSize={12} fill="currentColor">repeat</text>
          )}
          {k !== lo && <line x1={X(k)} x2={X(k)} y1={trackY - 8} y2={trackY + trackH + 8} stroke="currentColor" strokeOpacity={0.5} />}
        </g>
      ))}
      {runs.filter((run) => run.coverage === 'none').map((run, i) => (
        <rect key={`n${i}`} x={X(run.from)} y={trackY} width={X(run.to) - X(run.from)} height={trackH} fill="hsl(0 0% 50%)" fillOpacity={0.45} />
      ))}
      {rx > 0 && ry > 0 && runs.filter((run) => run.coverage === 'x' || run.coverage === 'y').map((run, i) => (
        <g key={`o${i}`}>
          <rect x={X(run.from)} y={trackY + trackH + 8} width={X(run.to) - X(run.from)} height={8} rx={3} fill={run.coverage === 'x' ? 'hsl(214 80% 52%)' : 'hsl(18 80% 52%)'} fillOpacity={0.35} />
          {X(run.to) - X(run.from) > 50 && (
            <text x={(X(run.from) + X(run.to)) / 2} y={trackY + trackH + 34} textAnchor="middle" fontSize={13} fill="currentColor">{run.coverage === 'x' ? '↔ only' : '↕ only'}</text>
          )}
        </g>
      ))}
      <line x1={X(flat)} x2={X(flat)} y1={trackY - 14} y2={trackY} stroke="currentColor" strokeDasharray="3 3" />
      <text x={X(flat) + 5} y={trackY - 4} fontSize={12} fill="currentColor" fillOpacity={0.7}>flat</text>
      <line x1={X(head)} x2={X(head)} y1={trackY - 4} y2={trackY + trackH + 4} stroke="currentColor" strokeWidth={2.5} />
    </svg>
  )
}

function PrintView({ lens, s, aircraft }: { lens: Lens; s: Settings; aircraft: boolean[] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { imgLen } = threadCopies(s)
  const copyW = s.direction === 'vertical' ? s.widthMm : imgLen
  const copyH = s.direction === 'vertical' ? imgLen : s.widthMm
  const maxW = 560
  const maxH = 380
  const k = Math.min(maxW / copyW, maxH / copyH)
  const w = Math.max(40, Math.round(copyW * k))
  const h = Math.max(40, Math.round(copyH * k))

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    // Each frame drawn at the copy's size, then sampled strip by strip
    const frames = Array.from({ length: s.count }, (_, i) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const fctx = c.getContext('2d')!
      drawFrame(fctx, i, s.count, 0, 0, w, h, aircraft[i] ?? false)
      return fctx.getImageData(0, 0, w, h).data
    })
    const out = ctx.createImageData(w, h)
    const a = lens.angleDeg * RAD
    const sin = Math.sin(a)
    const cos = Math.cos(a)
    const P = s.zoomPx
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x * sin + y * cos
        const m = ((u % P) + P) % P
        const strip = Math.min(s.count - 1, Math.floor((m / P) * s.count))
        const i = (y * w + x) * 4
        const src = frames[strip]
        const edge = s.ridges && m < 1
        out.data[i] = edge ? 30 : src[i]
        out.data[i + 1] = edge ? 30 : src[i + 1]
        out.data[i + 2] = edge ? 30 : src[i + 2]
        out.data[i + 3] = 255
      }
    }
    ctx.putImageData(out, 0, 0)
  }, [lens, s.count, s.zoomPx, s.ridges, w, h, aircraft])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center overflow-hidden rounded-md border bg-background p-2">
        <canvas ref={canvas} width={w} height={h} className={cn('max-w-full')} style={{ imageRendering: 'pixelated' }} />
      </div>
    </div>
  )
}

function PrintCheck({ lens, s, set }: { lens: Lens; s: Settings; set: (p: Partial<Settings>) => void }) {
  const { imgLen, step, along } = threadCopies(s)
  const geometry: ThreadGeometry = { direction: s.direction, widthMm: s.widthMm, lengthMm: along, repeatMm: step }
  const drift = closeViewDrift(lens, geometry, s.viewMm, s.count)
  const samples = samplesAcrossWidth(lens, geometry, s.pitchUm)
  const fit = repeatFit(lens, geometry, s.pitchUm, s.count)
  const snapGap = fittingRepeat(lens, s.direction, imgLen + s.gapMm, s.pitchUm) - imgLen
  const rows: { label: string; value: ReactNode; title: string; ok?: boolean }[] = [
    {
      label: 'Close-view drift',
      title: `Held ${s.viewMm} mm away, the thread's ends are seen ±${fmt(drift.viewingDeg)}° apart; this much reaches across the ridges`,
      value: `±${fmt(drift.driftDeg)}° · ${fmt(drift.driftFrames, 2)} frames`,
      ok: drift.driftFrames < 0.5,
    },
    {
      label: 'Detail across width',
      title: 'How many distinct points the lens can show across the thread width',
      value: Number.isFinite(samples) ? `${Math.round(samples)} points` : 'Unlimited',
      ok: !Number.isFinite(samples) || samples >= 60,
    },
    {
      label: 'Repeat step',
      title: 'One image copy plus the gap, and that step measured across the ridges in pitches',
      value: fit.pitches === 0 ? `${fmt(step, 2)} mm · along the ridges` : `${fmt(step, 2)} mm · ${fmt(fit.pitches, 2)} pitches`,
      ok: fit.fits,
    },
  ]
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start justify-between gap-3 text-sm" title={r.title}>
          <span className="text-muted-foreground">{r.label}</span>
          <span className="flex items-center gap-2 text-right tabular-nums">
            {r.value}
            <span className={cn('size-2 shrink-0 rounded-full', r.ok ? 'bg-emerald-500' : 'bg-amber-500')} />
          </span>
        </div>
      ))}
      {!fit.fits && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-amber-500/10 p-2 text-xs">
          <span>Tiled copies land {fmt(Math.abs(fit.offStrips), 2)} strips off.</span>
          <Button size="sm" variant="outline" onClick={() => set({ gapMm: Math.round(snapGap * 1000) / 1000 })}>
            Gap {fmt(snapGap, 3)} mm
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-2 border-t pt-3">
        <InlineField label="Print zoom" title="Ridge width on screen in the print view">
          <ScrubField label="Z" value={s.zoomPx} onChange={(zoomPx) => set({ zoomPx })} min={6} max={60} step={1} unit="px" />
        </InlineField>
        <SwitchField label="Show ridges" checked={s.ridges} onChange={(ridges) => set({ ridges })} />
      </div>
    </div>
  )
}
