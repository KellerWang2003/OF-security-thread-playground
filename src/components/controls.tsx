import { useState, type ComponentProps, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// Playground-specific compositions of the shadcn primitives in components/ui

const round = (value: number) => Math.round(value * 100) / 100

/** One titled group of controls in the side panel */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b px-4 py-4">
      <div className="flex h-5 items-center justify-between">
        <h2 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{title}</h2>
        {action}
      </div>
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

export function ColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="relative min-w-0">
      <input
        type="color"
        aria-label="Pick colour"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute top-1/2 left-1.5 size-5 -translate-y-1/2 cursor-pointer rounded border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
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
