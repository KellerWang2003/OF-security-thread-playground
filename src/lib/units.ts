import { create } from 'zustand'

/**
 * Units for lengths. Every length is stored in mm; the unit only changes how lengths are read and typed. One pick for
 * the whole app, made from the unit at the end of any length field and remembered per browser like the panel width:
 * a way of looking, never saved in a project, so switching never changes a value.
 */
export type LengthUnit = 'mm' | 'cm' | 'in' | 'pt'

export const LENGTH_UNITS: { unit: LengthUnit; name: string }[] = [
  { unit: 'mm', name: 'Millimetres' },
  { unit: 'cm', name: 'Centimetres' },
  { unit: 'in', name: 'Inches' },
  { unit: 'pt', name: 'Points' },
]

/** Millimetres in one of each; a point is 1/72 in */
const MM_PER: Record<LengthUnit, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 }
/** Decimals each is read to: mm 0.01, cm 0.001, in 0.001, pt 0.1 */
const DECIMALS: Record<LengthUnit, number> = { mm: 2, cm: 3, in: 3, pt: 1 }

const roundTo = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const toUnit = (mm: number, unit: LengthUnit) => mm / MM_PER[unit]

/** Back to mm, without float dust (to a millionth of a mm), so a typed 6.14 in is 155.956 mm */
export const toMm = (value: number, unit: LengthUnit) => Math.round(value * MM_PER[unit] * 1e6) / 1e6

/** A length as it reads in a unit, to that unit's decimals: 156.1 mm is 6.146 in */
export const lengthIn = (mm: number, unit: LengthUnit) => roundTo(toUnit(mm, unit), DECIMALS[unit])

/** A length for text, with its unit: "156.1 mm", "6.146 in" */
export const formatLength = (mm: number, unit: LengthUnit) => `${lengthIn(mm, unit)} ${unit}`

/**
 * The scrub and arrow-key step in a unit for a step set in mm: the largest round number (1, 2 or 5 times a power of
 * ten) that isn't coarser, so 0.5 mm steps 0.05 cm, 0.01 in or 1 pt, and 0.1 mm steps 0.01 cm, 0.002 in or 0.2 pt
 */
export function stepIn(stepMm: number, unit: LengthUnit) {
  const raw = toUnit(stepMm, unit)
  const power = Math.floor(Math.log10(raw) + 1e-9)
  const mantissa = raw / 10 ** power
  const round = mantissa >= 5 - 1e-9 ? 5 : mantissa >= 2 - 1e-9 ? 2 : 1
  return power < 0 ? round / 10 ** -power : round * 10 ** power
}

const TYPED: Record<string, LengthUnit> = { mm: 'mm', cm: 'cm', in: 'in', '"': 'in', '”': 'in', '″': 'in', pt: 'pt' }

/**
 * What's typed into a length field, in `unit`: a number, or a number with a unit (6.14in, 6.14", 15.6 cm, 442pt),
 * converted. A decimal comma is read as a point. Undefined when it isn't a length.
 */
export function parseLength(text: string, unit: LengthUnit): number | undefined {
  const match = /^\s*([-+]?(?:\d+[.,]?\d*|[.,]\d+))\s*(mm|cm|in|pt|"|”|″)?\s*$/i.exec(text)
  if (!match) return undefined
  const value = Number(match[1].replace(',', '.'))
  const typed = match[2] ? TYPED[match[2].toLowerCase()] : unit
  return typed === unit ? value : (value * MM_PER[typed]) / MM_PER[unit]
}

/**
 * A length field's numbers in `unit`, for a value and limits in mm: the limits reach half a last decimal further, so
 * the number shown at a limit can be typed; the step is `stepIn`'s, or converted as it is with `exactStep` (a section's
 * twelfths of the thread); and the way back to mm keeps within the limits
 */
export function lengthField(unit: LengthUnit, { value, min, max, step, exactStep = false }: {
  value: number
  min: number
  max: number
  step: number
  exactStep?: boolean
}) {
  const slack = 0.5 * 10 ** -DECIMALS[unit]
  return {
    value: toUnit(value, unit),
    min: toUnit(min, unit) - slack,
    max: toUnit(max, unit) + slack,
    step: exactStep ? toUnit(step, unit) : stepIn(step, unit),
    format: (shown: number) => String(roundTo(shown, DECIMALS[unit])),
    parse: (text: string) => parseLength(text, unit),
    toMm: (typed: number) => clamp(toMm(typed, unit), min, max),
  }
}

const KEY = 'of-playground.length-unit'

function load(): LengthUnit {
  try {
    const saved = localStorage.getItem(KEY)
    const known = LENGTH_UNITS.find((u) => u.unit === saved)
    if (known) return known.unit
  } catch { /* storage blocked: mm */ }
  return 'mm'
}

export const useLengthUnit = create<{ unit: LengthUnit }>(() => ({ unit: load() }))

/** The unit lengths are read in now, for text worked out outside a component (components subscribe with useLengthUnit) */
export const lengthUnit = () => useLengthUnit.getState().unit

/** Reads and types every length in `unit` from now on, in this browser */
export function setLengthUnit(unit: LengthUnit) {
  useLengthUnit.setState({ unit })
  try {
    localStorage.setItem(KEY, unit)
  } catch { /* storage blocked: it lasts until reload */ }
}
