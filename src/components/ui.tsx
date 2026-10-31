import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../lib/cn'

const round = (value: number) => Math.round(value * 100) / 100

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost'
  size?: 'md' | 'sm' | 'icon'
}

export function Button({ variant = 'outline', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40',
        variant === 'primary' && 'bg-neutral-900 text-white hover:bg-neutral-800',
        variant === 'outline' && 'border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50',
        variant === 'ghost' && 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
        size === 'md' && 'h-8 px-3',
        size === 'sm' && 'h-7 px-2 text-xs',
        size === 'icon' && 'size-7',
        className,
      )}
      {...props}
    />
  )
}

/** One titled group of controls in the side panel */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-4">
      <div className="flex h-5 items-center justify-between">
        <h2 className="text-[11px] font-medium tracking-wider text-neutral-500 uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-neutral-600">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-snug text-neutral-400">{hint}</span>}
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
    <div
      className={cn(
        'flex h-8 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 focus-within:border-neutral-400',
        className,
      )}
    >
      <input
        type="number"
        className="w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none"
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
      {unit && <span className="text-xs text-neutral-400">{unit}</span>}
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-600">{label}</span>
        <NumberField className="h-7 w-[84px]" value={value} onChange={onChange} min={min} max={max} step={step} unit={unit} />
      </div>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </div>
  )
}

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
    <div className="flex rounded-md bg-neutral-100 p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 flex-1 rounded-[5px] px-2 text-xs font-medium transition-colors',
            o.value === value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-neutral-600">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-[18px] w-8 shrink-0 rounded-full transition-colors', checked ? 'bg-neutral-900' : 'bg-neutral-300')}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white transition-transform',
            checked && 'translate-x-3.5',
          )}
        />
      </button>
    </label>
  )
}

export function ColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-neutral-200 bg-white px-1.5 focus-within:border-neutral-400">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
      />
      <input
        className="w-full min-w-0 bg-transparent text-sm uppercase tabular-nums outline-none"
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
