import { useState, type ComponentProps, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// Playground-specific compositions of the shadcn primitives in components/ui

const round = (value: number) => Math.round(value * 100) / 100

/** A floating panel over the canvas */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-lg border border-border/70 bg-background/95 shadow-panel backdrop-blur', className)}>{children}</div>
}

/**
 * A Figma-style number field: a short label inside the field that you can drag sideways to scrub the
 * value, and a number you can type. Commits while typing only when the value is in range.
 */
export function ScrubField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  title,
  className,
}: {
  label: ReactNode
  /** Tooltip naming what a terse label stands for */
  title?: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [scrub, setScrub] = useState<{ x: number; start: number } | null>(null)
  const snap = (v: number) => clampValue(Math.round(v / step) * step, min, max)

  return (
    <div
      title={title}
      className={cn(
        'flex h-8 min-w-0 items-center rounded-md border border-transparent bg-muted/60 focus-within:border-ring hover:border-border',
        className,
      )}
    >
      <span
        className="flex h-full min-w-7 shrink-0 cursor-ew-resize touch-none items-center justify-center px-2 text-xs text-muted-foreground select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setScrub({ x: e.clientX, start: value })
        }}
        onPointerMove={(e) => {
          if (scrub) onChange(snap(scrub.start + ((e.clientX - scrub.x) / 2) * step))
        }}
        onPointerUp={() => setScrub(null)}
      >
        {label}
      </span>
      <input
        type="number"
        className="h-full w-full min-w-0 bg-transparent text-sm tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none"
        value={draft ?? String(round(value))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value)
          const next = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(next) && next >= min && next <= max) onChange(next)
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      {unit && <span className="pr-2 text-xs text-muted-foreground">{unit}</span>}
    </div>
  )
}

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** A top-level part of the banknote in the side panel (the banknote itself, the thread, later others) */
export function Group({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col border-b border-border/60 pt-3">
      <div className="flex h-5 items-center justify-between pr-2.5 pl-4">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {action}
      </div>
      <div className="flex flex-col divide-y divide-border/40">{children}</div>
    </div>
  )
}

/** One titled set of controls in the side panel; inside a Group it drops its divider */
export function Section({ title, action, nested = false, children }: { title?: string; action?: ReactNode; nested?: boolean; children: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-3', nested ? 'mx-4 py-3' : 'border-b border-border/60 px-4 py-3')}>
      {(title || action) && (
        <div className="flex h-5 items-center justify-between">
          {title && <h3 className="text-[11px] font-medium text-muted-foreground">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground/80">{hint}</p>}
    </div>
  )
}

/** A label on the left and its control on the right, as in a video editor's export settings */
export function InlineField({ label, title, children }: { label: ReactNode; title?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-3" title={title}>
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Commits while typing only when the value is in range, so a half-typed number never jumps */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  className,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className={cn('relative', className)}>
      <Input
        type="number"
        className={cn('h-8 text-right tabular-nums [&::-webkit-inner-spin-button]:appearance-none', unit && 'pr-7')}
        value={draft ?? String(round(value))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value)
          const next = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(next) && next >= min && next <= max) onChange(next)
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      {unit && (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  )
}

export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
        <NumberField className="w-[88px]" value={value} onChange={onChange} min={min} max={max} step={step} unit={unit} />
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
      />
    </div>
  )
}

/** A single-choice toggle group that always keeps one option selected */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      className="w-full"
      value={[value]}
      onValueChange={(next) => {
        const picked = next.at(0)
        if (picked) onChange(picked as T)
      }}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className="flex-1 text-xs">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <Label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-normal text-muted-foreground">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </Label>
  )
}

export function CheckboxField({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span className="min-w-0 truncate">{label}</span>
    </Label>
  )
}

export function ColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="relative min-w-0">
      <input
        type="color"
        aria-label="Pick colour"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute top-1/2 left-1.5 size-5 -translate-y-1/2 cursor-pointer rounded-[max(0px,calc(var(--radius)-6px))] border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-[inherit] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
      />
      <Input
        className="h-8 pl-8 uppercase tabular-nums"
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value)
          if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value)
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  )
}

/** An icon-only button with its label in a tooltip */
export function IconButton({
  label,
  size = 'icon-sm',
  variant = 'ghost',
  ...props
}: Omit<ComponentProps<typeof Button>, 'aria-label'> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant={variant} size={size} aria-label={label} {...props} />} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
