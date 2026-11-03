import type { CSSProperties } from 'react'
import { clamp } from './frames'
import { FLAT, framesReached, lensAngle, lensMix, lensState, respondsTo, type Axis, type LensState, type Tilt2 } from './lens'
import type { Frame, Note, SectionLens, ThreadPattern, ThreadSection, ThreadSettings, TiltSettings } from './types'

/**
 * The thread as a pattern of sections. The banknote's frames are full-thread artwork; each section is a mask that
 * shows, at the current tilt, the frame its own lens and track give. Sections sit within one repeat, which tiles the
 * whole thread, shifted by wherever the print happens to land (the offset, a preview only).
 *
 * Every section's print has one strip per banknote frame, each as wide as that frame's share of the cycle, so flat
 * and the cycle mean the same everywhere; a section's track says which frame each strip shows (a shorter story is
 * padded: 1, 1, 2, 3, 3). With mixed angles off, every section plays the banknote's lens.
 */

export type PatternNote = Pick<Note, 'frames' | 'tilt' | 'pattern'>
export interface PatternPoint {
  /** Along the repeat, mm */
  along: number
  /** Across the thread, as a share of its width */
  across: number
}
type Rect = Pick<ThreadSection, 'startMm' | 'endMm' | 'acrossStart' | 'acrossEnd'>
export type Edge = keyof Rect

/** Placeholders until Oberthur confirms them */
export const MIN_SECTION_ALONG_MM = 1
export const MIN_SECTION_ACROSS_MM = 1
/** The unusable band where two ridge angles meet, mm in all, half on each side (placeholder) */
export const DEAD_ZONE_MM = 0.2
/** Ridges within this of parallel to a tilt's axis keep hidden frames from the other tilt: sin 10° ≈ 17% leaks */
export const HIDDEN_RIDGE_TOLERANCE_DEG = 10
/** Most ridge angles one thread should mix */
export const MAX_ANGLE_TYPES = 3
export const DEFAULT_REPEAT_MM = 4
export const REPEAT_LIMITS = { min: 1, max: 250 }
/** Snapping while drawing, moving and resizing: 0.5 mm along, twelfths of the width across (halves, thirds, quarters) */
export const ALONG_STEP = 0.5
export const ACROSS_STEP = 1 / 12
/** The one section of a banknote from before patterns */
export const WHOLE_ID = 'whole'

const EPS = 1e-6
const LENS_KEYS = ['effect', 'cycleDeg', 'cycleXDeg', 'yOn', 'runY', 'runX', 'revealAxis', 'revealWobble', 'revealLevel', 'flatAt'] as const

export const mod = (value: number, m: number) => ((value % m) + m) % m
/** Rounds away float noise so edges that should meet do: mm to a micron, shares to exact twelfths when they're on one */
const tidy = (value: number) => Math.round(value * 1e6) / 1e6
const tidyShare = (value: number) => {
  const k = Math.round(value * 12)
  return Math.abs(value * 12 - k) < 1e-6 ? k / 12 : Math.round(value * 1e9) / 1e9
}
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0)
const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

const wholeSection = (repeatMm: number): ThreadSection => ({ id: WHOLE_ID, name: 'Whole thread', startMm: 0, endMm: repeatMm, acrossStart: 0, acrossEnd: 1 })
export const defaultPattern = (repeatMm = DEFAULT_REPEAT_MM): ThreadPattern => ({ repeatMm, mixed: false, sections: [wholeSection(repeatMm)] })
const DEFAULT_PATTERN = defaultPattern()
/** A banknote's pattern; one from before patterns (or an open tab's older copy) is one section with its lens */
export const patternOf = (note: Pick<Note, 'pattern'>): ThreadPattern => note.pattern ?? DEFAULT_PATTERN

/** A saved pattern made safe to use, or the one-section pattern a banknote from before patterns gets. Running it again changes nothing. */
export function migratePattern(raw: unknown): ThreadPattern {
  const p = raw as Partial<ThreadPattern> | undefined
  if (!p || typeof p !== 'object' || !Array.isArray(p.sections)) return defaultPattern()
  const repeatMm = clamp(finite(p.repeatMm, DEFAULT_REPEAT_MM), REPEAT_LIMITS.min, REPEAT_LIMITS.max)
  const ids = new Set<string>()
  const sections = p.sections.flatMap((s: Partial<ThreadSection>, i): ThreadSection[] => {
    if (!s || typeof s !== 'object') return []
    const startMm = clamp(finite(s.startMm, 0), 0, repeatMm)
    const endMm = clamp(finite(s.endMm, repeatMm), startMm, repeatMm)
    const acrossStart = clamp(finite(s.acrossStart, 0), 0, 1)
    const acrossEnd = clamp(finite(s.acrossEnd, 1), acrossStart, 1)
    if (endMm - startMm < EPS || acrossEnd - acrossStart < EPS) return []
    let id = typeof s.id === 'string' && s.id ? s.id : `section-${i + 1}`
    while (ids.has(id)) id = `${id}-${i + 1}`
    ids.add(id)
    const { lens, track, ...rest } = s
    return [{
      ...rest, id, name: typeof s.name === 'string' ? s.name : `Section ${i + 1}`, startMm, endMm, acrossStart, acrossEnd,
      ...(lens && typeof lens === 'object' ? { lens } : {}),
      ...(Array.isArray(track) ? { track: track.filter((f): f is string => typeof f === 'string') } : {}),
    }]
  })
  return { ...p, repeatMm, mixed: p.mixed === true, sections: sections.length ? sections : [wholeSection(repeatMm)] }
}

/** The lens fields a tilt carries, as a section keeps them */
export function pickLens(tilt: Partial<TiltSettings>): SectionLens {
  return Object.fromEntries(LENS_KEYS.filter((k) => tilt[k] !== undefined).map((k) => [k, tilt[k]])) as SectionLens
}
const BLANK_LENS = Object.fromEntries(LENS_KEYS.map((k) => [k, undefined])) as SectionLens

/** The tilt settings a section plays: its own lens while mixed angles is on, otherwise the banknote's */
export function sectionTilt(note: PatternNote, section: ThreadSection): TiltSettings {
  if (!patternOf(note).mixed || !section.lens) return note.tilt
  return { ...note.tilt, ...BLANK_LENS, cycleDeg: note.tilt.cycleDeg, ...section.lens }
}

/** A story stretched or cut to `count` strips, spreading it evenly: three frames on five strips play 1, 1, 2, 3, 3 */
export function padTrack<T>(track: T[], count: number): T[] {
  if (!track.length || count <= 0) return []
  return Array.from({ length: count }, (_, i) => track[Math.min(track.length - 1, Math.floor(((i + 0.5) * track.length) / count))])
}

/** Which banknote frame (by index) each strip of a section shows */
export function sectionSlots(frames: Pick<Frame, 'id'>[], section: Pick<ThreadSection, 'track'>): number[] {
  const identity = frames.map((_, i) => i)
  if (!section.track) return identity
  const indices = section.track.map((id) => frames.findIndex((f) => f.id === id)).filter((i) => i >= 0)
  return indices.length ? padTrack(indices, frames.length) : identity
}
export const isIdentity = (slots: number[]) => slots.every((f, i) => f === i)

/** The track to save for these strips: none when they play every frame in order */
export function trackFor(frames: Pick<Frame, 'id'>[], slots: number[]): string[] | undefined {
  if (slots.length === frames.length && isIdentity(slots)) return undefined
  return slots.map((i) => frames.at(i)?.id).filter((id): id is string => id !== undefined)
}

/** Tracks follow their frames when a banknote is copied and its frames get new ids */
export function remapTracks(pattern: ThreadPattern | undefined, ids: Map<string, string>): ThreadPattern | undefined {
  if (!pattern) return pattern
  return { ...pattern, sections: pattern.sections.map((s) => (s.track ? { ...s, track: s.track.map((id) => ids.get(id) ?? id) } : s)) }
}

export const isFull = (s: Rect, repeatMm: number) =>
  s.startMm <= EPS && s.endMm >= repeatMm - EPS && s.acrossStart <= EPS && s.acrossEnd >= 1 - EPS

export interface PreparedSection {
  section: ThreadSection
  tilt: TiltSettings
  lens: LensState
  /** The banknote frame (by index) each strip shows */
  slots: number[]
  /** Ridge angle from the banknote's horizontal, signed by lean (`lensAngle`) */
  angle: number
}
export interface PreparedPattern {
  pattern: ThreadPattern
  sections: PreparedSection[]
  /** One section over the whole thread playing every frame through the banknote's lens: drawn exactly as before patterns */
  plain: boolean
}

// Notes are never mutated, so each one's pattern is worked out once: NoteView asks on every tilt change
const prepared = new WeakMap<object, PreparedPattern>()
export function preparePattern(note: PatternNote): PreparedPattern {
  const known = prepared.get(note)
  if (known) return known
  const pattern = patternOf(note)
  const sections = pattern.sections.map((section) => {
    const tilt = sectionTilt(note, section)
    const lens = lensState(tilt, note.frames)
    return { section, tilt, lens, slots: sectionSlots(note.frames, section), angle: lensAngle(lens) }
  })
  const only = sections.length === 1 ? sections[0] : undefined
  const plain = !!only && isFull(only.section, pattern.repeatMm) && isIdentity(only.slots) && only.tilt === note.tilt
  const value = { pattern, sections, plain }
  prepared.set(note, value)
  return value
}

export interface SectionMix {
  /** Banknote frames (by index), as `lensMix`: `base` drawn fully, `next` over it at `blend` */
  base: number
  next: number
  blend: number
  current: number
  /** The strip under the ridges' middle now, for the print */
  slot: number
}
export function sectionMix(note: Pick<Note, 'frames'>, p: PreparedSection, tilt: Tilt2): SectionMix {
  const mix = lensMix({ frames: note.frames, tilt: p.tilt }, tilt, p.lens)
  const at = (slot: number) => p.slots.at(slot) ?? slot
  return { base: at(mix.base), next: at(mix.next), blend: mix.blend, current: at(mix.current), slot: mix.current }
}
/** Every section's frames at a tilt, in section order */
export const patternMix = (note: PatternNote, tilt: Tilt2) => preparePattern(note).sections.map((p) => sectionMix(note, p, tilt))

/** The frame numbers a thread shows, for its label: each section's, without repeats */
export const shownLabel = (currents: number[]) => [...new Set(currents)].map((c) => c + 1).join(' · ')

/** The frame a section shows flat (by index) */
export const restFrame = (note: Pick<Note, 'frames'>, p: PreparedSection) => sectionMix(note, p, FLAT).current

/** Which banknote frames one tilt alone shows in a section, within ±90° */
export function reachedFrames(note: Pick<Note, 'frames'>, p: PreparedSection, axis: Axis) {
  return new Set([...framesReached({ frames: note.frames, tilt: p.tilt }, axis, p.lens)].map((slot) => p.slots.at(slot) ?? slot))
}

/** For each banknote frame, the tilts that play somewhere on the thread yet never show it anywhere */
export function framesMissed(note: PatternNote): Axis[][] {
  const { sections } = preparePattern(note)
  const reach = (['y', 'x'] as const).map((axis) => {
    const live = sections.filter((p) => respondsTo(p.lens, axis))
    return { axis, live: live.length > 0, frames: new Set(live.flatMap((p) => [...reachedFrames(note, p, axis)])) }
  })
  return note.frames.map((_, f) => reach.filter((r) => r.live && !r.frames.has(f)).map((r) => r.axis))
}

/**
 * The lens playback reads. With mixed angles, each tilt sweeps the fastest cycle any section plays on it, so the
 * default moves play every section through.
 */
export function playbackLens(note: PatternNote): LensState {
  const base = lensState(note.tilt, note.frames)
  if (!patternOf(note).mixed) return base
  const lenses = preparePattern(note).sections.map((p) => p.lens)
  const fastest = (axis: Axis) => {
    const live = lenses.flatMap((l) => {
      const cycle = axis === 'y' ? l.cycleY : l.cycleX
      return cycle == null ? [] : [{ cycle, dir: axis === 'y' ? l.dirY : l.dirX }]
    })
    return live.toSorted((a, b) => a.cycle - b.cycle).at(0)
  }
  const y = fastest('y'), x = fastest('x')
  return { ...base, cycleY: y?.cycle ?? null, dirY: y?.dir ?? base.dirY, cycleX: x?.cycle ?? null, dirX: x?.dir ?? base.dirX }
}
/** The tilt settings playback reads: a mixed thread with no moves of its own sweeps both tilts when both play */
export function playbackTilt(note: PatternNote): TiltSettings {
  if (!patternOf(note).mixed || note.tilt.moves?.length || note.tilt.playTilt) return note.tilt
  const lens = playbackLens(note)
  return lens.cycleX != null && lens.cycleY != null ? { ...note.tilt, playTilt: 'both' } : note.tilt
}
/** The section the timeline's playhead, reach and flat follow: the one picked in the thread editor, otherwise the first */
export function timelineSection(note: PatternNote, sectionId?: string): PreparedSection {
  const { sections } = preparePattern(note)
  return sections.find((p) => p.section.id === sectionId) ?? sections[0]
}

/** A strip of a section's print, as the lens controls see it: the banknote frame it shows, at the strip's own length */
export interface SlotFrame extends Frame {
  /** The banknote frame shown (by index) */
  index?: number
}
/** The banknote frame (by index) a lens control's frame `i` stands for */
export const frameIndex = (frames: Pick<Frame, 'id'>[], i: number) => (frames.at(i) as SlotFrame | undefined)?.index ?? i
/** The number a lens control shows for its frame `i`: the banknote frame's, so a section's strips read as the frames they show */
export const frameNumber = (frames: Pick<Frame, 'id'>[], i: number) => frameIndex(frames, i) + 1

const views = new WeakMap<object, Map<string, unknown>>()
/** A section as the lens controls see it: its strips as frames and its own lens */
export function sectionView<T extends PatternNote>(note: T, section: ThreadSection): T {
  const known = views.get(note)?.get(section.id) as T | undefined
  if (known) return known
  const slots = sectionSlots(note.frames, section)
  const frames: SlotFrame[] = slots.map((f, i) => ({ ...note.frames[f], id: `${i}:${note.frames[f].id}`, length: note.frames[i].length, index: f }))
  const view = { ...note, frames, tilt: sectionTilt(note, section) }
  const cache = views.get(note) ?? new Map<string, unknown>()
  cache.set(section.id, view)
  views.set(note, cache)
  return view
}

/** Where a section's copies fall along the thread (mm from its top or left end): the repeat shifted by the offset, cut to the thread, touching copies joined */
export function sectionSpans(section: Pick<ThreadSection, 'startMm' | 'endMm'>, repeatMm: number, offsetMm: number, lengthMm: number): [number, number][] {
  const repeat = Math.max(repeatMm, ALONG_STEP)
  const shift = mod(offsetMm, repeat)
  const spans: [number, number][] = []
  for (let k = -1; k * repeat + shift + section.startMm < lengthMm; k++) {
    const lo = Math.max(0, section.startMm + k * repeat + shift)
    const hi = Math.min(lengthMm, section.endMm + k * repeat + shift)
    if (hi - lo <= EPS) continue
    const last = spans.at(-1)
    if (last && lo - last[1] <= EPS) last[1] = hi
    else spans.push([lo, hi])
  }
  return spans
}

const pct = (share: number) => `${tidy(share * 100)}%`
/**
 * A section's area on the thread as CSS, at `scale` px per mm: clipped across, masked along with one opening per
 * copy. Empty for a section over the whole thread.
 */
export function sectionClip(section: ThreadSection, repeatMm: number, offsetMm: number, lengthMm: number, scale: number, direction: ThreadSettings['direction']): CSSProperties {
  const style: CSSProperties = {}
  const horizontal = direction === 'horizontal'
  if (section.acrossStart > EPS || section.acrossEnd < 1 - EPS) {
    const near = pct(section.acrossStart), far = pct(1 - section.acrossEnd)
    style.clipPath = horizontal ? `inset(${near} 0 ${far} 0)` : `inset(0 ${far} 0 ${near})`
  }
  const spans = sectionSpans(section, repeatMm, offsetMm, lengthMm)
  if (spans.length === 1 && spans[0][0] <= EPS && spans[0][1] >= lengthMm - EPS) return style
  const stops = ['transparent 0px']
  for (const [lo, hi] of spans) {
    const a = tidy(lo * scale), b = tidy(hi * scale)
    stops.push(`transparent ${a}px`, `#000 ${a}px`, `#000 ${b}px`, `transparent ${b}px`)
  }
  stops.push('transparent 100%')
  const mask = `linear-gradient(${horizontal ? 'to right' : 'to bottom'}, ${stops.join(', ')})`
  return { ...style, maskImage: mask, WebkitMaskImage: mask }
}

/** The section at a point of the repeat, if any */
export const sectionAt = (pattern: ThreadPattern, point: PatternPoint) =>
  pattern.sections.find((s) => point.along >= s.startMm - EPS && point.along <= s.endMm + EPS && point.across >= s.acrossStart - EPS && point.across <= s.acrossEnd + EPS)

export const snapAlong = (mm: number) => Math.round(mm / ALONG_STEP) * ALONG_STEP
export const snapAcross = (share: number) => Math.round(share * 12) / 12
export const rectsOverlap = (a: Rect, b: Rect) =>
  overlap(a.startMm, a.endMm, b.startMm, b.endMm) > EPS && overlap(a.acrossStart, a.acrossEnd, b.acrossStart, b.acrossEnd) > EPS
const area = (r: Rect) => (r.endMm - r.startMm) * (r.acrossEnd - r.acrossStart)
const rectOf = ({ startMm, endMm, acrossStart, acrossEnd }: Rect): Rect => ({ startMm, endMm, acrossStart, acrossEnd })

/**
 * A new section dragged out from `from` to `to`, snapped and kept clear of the others: where it would cover one,
 * it is cut back on whichever side keeps the most of it. Undefined while it is smaller than one snapping step.
 */
export function drawRect(pattern: ThreadPattern, from: PatternPoint, to: PatternPoint): Rect | undefined {
  const repeat = pattern.repeatMm
  const a0 = clamp(snapAlong(from.along), 0, repeat), a1 = clamp(snapAlong(to.along), 0, repeat)
  const c0 = clamp(snapAcross(from.across), 0, 1), c1 = clamp(snapAcross(to.across), 0, 1)
  let box: Rect = { startMm: Math.min(a0, a1), endMm: Math.max(a0, a1), acrossStart: Math.min(c0, c1), acrossEnd: Math.max(c0, c1) }
  const anchor = { along: clamp(from.along, box.startMm, box.endMm), across: clamp(from.across, box.acrossStart, box.acrossEnd) }
  for (let guard = 0; guard <= pattern.sections.length; guard++) {
    const hit = pattern.sections.find((s) => rectsOverlap(s, box))
    if (!hit) break
    const cuts: Rect[] = []
    if (hit.endMm <= anchor.along + EPS) cuts.push({ ...box, startMm: hit.endMm })
    if (hit.startMm >= anchor.along - EPS) cuts.push({ ...box, endMm: hit.startMm })
    if (hit.acrossEnd <= anchor.across + EPS) cuts.push({ ...box, acrossStart: hit.acrossEnd })
    if (hit.acrossStart >= anchor.across - EPS) cuts.push({ ...box, acrossEnd: hit.acrossStart })
    if (!cuts.length) return undefined
    box = cuts.reduce((best, cut) => (area(cut) > area(best) ? cut : best))
  }
  if (box.endMm - box.startMm < ALONG_STEP - EPS || box.acrossEnd - box.acrossStart < ACROSS_STEP - EPS) return undefined
  return pattern.sections.some((s) => rectsOverlap(s, box)) ? undefined : box
}

/** A section moved by `by` from where the drag started (`start`), snapped, slid along until blocked and then across */
export function moveRect(pattern: ThreadPattern, start: ThreadSection, by: PatternPoint): Rect {
  const others = pattern.sections.filter((s) => s.id !== start.id)
  const length = start.endMm - start.startMm, width = start.acrossEnd - start.acrossStart
  let a = clamp(snapAlong(start.startMm + by.along), 0, Math.max(0, pattern.repeatMm - length))
  for (const o of others) {
    if (overlap(o.acrossStart, o.acrossEnd, start.acrossStart, start.acrossEnd) <= EPS) continue
    if (a > start.startMm && o.startMm >= start.endMm - EPS) a = Math.min(a, o.startMm - length)
    if (a < start.startMm && o.endMm <= start.startMm + EPS) a = Math.max(a, o.endMm)
  }
  let c = clamp(snapAcross(start.acrossStart + by.across), 0, Math.max(0, 1 - width))
  for (const o of others) {
    if (overlap(o.startMm, o.endMm, a, a + length) <= EPS) continue
    if (c > start.acrossStart && o.acrossStart >= start.acrossEnd - EPS) c = Math.min(c, o.acrossStart - width)
    if (c < start.acrossStart && o.acrossEnd <= start.acrossStart + EPS) c = Math.max(c, o.acrossEnd)
  }
  const moved = { startMm: tidy(a), endMm: tidy(a + length), acrossStart: tidyShare(c), acrossEnd: tidyShare(c + width) }
  return others.some((o) => rectsOverlap(o, moved)) ? rectOf(start) : moved
}

const OPPOSITE: Record<Edge, Edge> = { startMm: 'endMm', endMm: 'startMm', acrossStart: 'acrossEnd', acrossEnd: 'acrossStart' }
const isAlong = (edge: Edge) => edge === 'startMm' || edge === 'endMm'
const isEnd = (edge: Edge) => edge === 'endMm' || edge === 'acrossEnd'
const spanOf = (s: Rect, along: boolean) => (along ? [s.acrossStart, s.acrossEnd] : [s.startMm, s.endMm]) as [number, number]

/**
 * The edges that move with one when it's dragged: on the same line, joined to it through sections that meet across
 * it, so a boundary between two sections moves as one. Edges on the ends of the repeat or the thread's sides move alone.
 */
export function seamOf(pattern: ThreadPattern, id: string, edge: Edge): { id: string; edge: Edge }[] {
  const section = pattern.sections.find((s) => s.id === id)
  if (!section) return []
  const along = isAlong(edge)
  const line = section[edge]
  if (line <= EPS || line >= (along ? pattern.repeatMm : 1) - EPS) return [{ id, edge }]
  const group = [{ id, edge }]
  for (let i = 0; i < group.length; i++) {
    const member = pattern.sections.find((s) => s.id === group[i].id)
    if (!member) continue
    const facing = OPPOSITE[group[i].edge]
    for (const other of pattern.sections) {
      if (group.some((g) => g.id === other.id) || Math.abs(other[facing] - line) > EPS) continue
      if (overlap(...spanOf(member, along), ...spanOf(other, along)) > EPS) group.push({ id: other.id, edge: facing })
    }
  }
  return group
}

/** The pattern with one section's edge, and the edges joined to it, moved to `value`: snapped unless typed, kept clear of the others */
export function resizeEdge(pattern: ThreadPattern, id: string, edge: Edge, value: number, snap = true): ThreadPattern {
  const along = isAlong(edge)
  const group = seamOf(pattern, id, edge)
  const ids = new Set(group.map((g) => g.id))
  const step = along ? ALONG_STEP : ACROSS_STEP
  let lo = 0, hi = along ? pattern.repeatMm : 1
  for (const g of group) {
    const s = pattern.sections.find((x) => x.id === g.id)
    if (!s) continue
    const far = s[OPPOSITE[g.edge]]
    const size = Math.abs(s[g.edge] - far)
    for (const o of pattern.sections) {
      if (ids.has(o.id) || overlap(...spanOf(s, along), ...spanOf(o, along)) <= EPS) continue
      const facing = o[OPPOSITE[g.edge]]
      if (isEnd(g.edge) && facing >= s[g.edge] - EPS) hi = Math.min(hi, facing)
      if (!isEnd(g.edge) && facing <= s[g.edge] + EPS) lo = Math.max(lo, facing)
    }
    if (isEnd(g.edge)) lo = Math.max(lo, far + Math.min(step, size))
    else hi = Math.min(hi, far - Math.min(step, size))
  }
  if (lo > hi + EPS) return pattern
  const v = (along ? tidy : tidyShare)(clamp(snap ? (along ? snapAlong(value) : snapAcross(value)) : value, lo, hi))
  return {
    ...pattern,
    sections: pattern.sections.map((s) => {
      const g = group.find((x) => x.id === s.id)
      return g ? { ...s, [g.edge]: v } : s
    }),
  }
}

/** "Section N", the first number free */
export function nextName(pattern: ThreadPattern) {
  const names = new Set(pattern.sections.map((s) => s.name))
  let n = pattern.sections.length + 1
  while (names.has(`Section ${n}`)) n++
  return `Section ${n}`
}

/**
 * A name for a section made from `source`: its name with the next number after any its namesakes carry, so a half
 * cut from "Lane ↔" is "Lane ↔ 2", then "Lane ↔ 3". "Section N" when the source has no name.
 */
export function nameAfter(pattern: ThreadPattern, source: Pick<ThreadSection, 'name'>) {
  const parse = (name: string) => {
    const m = /^(.*?)\s+(\d+)$/.exec(name.trim())
    return m ? { base: m[1], n: Number(m[2]) } : { base: name.trim(), n: 1 }
  }
  const { base } = parse(source.name)
  if (!base) return nextName(pattern)
  const last = Math.max(...pattern.sections.map((s) => parse(s.name)).filter((p) => p.base === base).map((p) => p.n), 1)
  return `${base} ${last + 1}`
}

const newId = () => crypto.randomUUID()

/** One section cut in two, along the thread or across it; the new half keeps its lens and track and is named after it. Undefined when it's too small to cut */
export function splitSection(pattern: ThreadPattern, id: string, direction: 'along' | 'across', name?: string): { pattern: ThreadPattern; id: string } | undefined {
  const s = pattern.sections.find((x) => x.id === id)
  if (!s) return undefined
  name ??= nameAfter(pattern, s)
  const [start, end, step, snap] = direction === 'along'
    ? [s.startMm, s.endMm, ALONG_STEP, snapAlong] as const
    : [s.acrossStart, s.acrossEnd, ACROSS_STEP, snapAcross] as const
  if (end - start < 2 * step - EPS) return undefined
  const mid = (direction === 'along' ? tidy : tidyShare)(clamp(snap((start + end) / 2), start + step, end - step))
  const created = newId()
  const first = direction === 'along' ? { ...s, endMm: mid } : { ...s, acrossEnd: mid }
  const second = direction === 'along' ? { ...s, id: created, name, startMm: mid } : { ...s, id: created, name, acrossStart: mid }
  return { pattern: { ...pattern, sections: pattern.sections.flatMap((x) => (x.id === id ? [first, second] : [x])) }, id: created }
}

/** A section split along its longer side (or the other, when that one is too small), the new half named `name` */
function splitLonger(pattern: ThreadPattern, id: string, widthMm: number, name: string) {
  const s = pattern.sections.find((x) => x.id === id)
  if (!s) return undefined
  const along = s.endMm - s.startMm >= (s.acrossEnd - s.acrossStart) * widthMm
  return splitSection(pattern, id, along ? 'along' : 'across', name) ?? splitSection(pattern, id, along ? 'across' : 'along', name)
}

/** A copy beside the original: the section split along its longer side, both halves alike */
export function duplicateSection(pattern: ThreadPattern, id: string, widthMm: number) {
  const s = pattern.sections.find((x) => x.id === id)
  return s && splitLonger(pattern, id, widthMm, `${s.name} copy`)
}

/** The largest empty area of the repeat, on the snapping grid; undefined when the sections cover it */
export function freeRect(pattern: ThreadPattern): Rect | undefined {
  const cols = Math.floor(pattern.repeatMm / ALONG_STEP + EPS), rows = Math.round(1 / ACROSS_STEP)
  // A cell any section reaches into at all, so a section left off the grid (by a new repeat, or a typed edge) still counts
  const covered = (c: number, r: number) => {
    const start = c * ALONG_STEP, end = start + ALONG_STEP, top = r / rows, bottom = (r + 1) / rows
    return pattern.sections.some((s) => Math.min(end, s.endMm) - Math.max(start, s.startMm) > EPS && Math.min(bottom, s.acrossEnd) - Math.max(top, s.acrossStart) > EPS)
  }
  // Each column's run of free cells ending at this row, then the widest stretch of columns at least as tall
  const heights = new Array<number>(cols).fill(0)
  let best: Rect | undefined, most = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights[c] = covered(c, r) ? 0 : heights[c] + 1
    for (let c = 0; c < cols; c++) {
      const h = heights[c]
      if (!h) continue
      let lo = c, hi = c
      while (lo > 0 && heights[lo - 1] >= h) lo--
      while (hi < cols - 1 && heights[hi + 1] >= h) hi++
      const size = (hi - lo + 1) * ALONG_STEP * (h / rows)
      if (size > most + EPS) {
        most = size
        best = { startMm: tidy(lo * ALONG_STEP), endMm: tidy((hi + 1) * ALONG_STEP), acrossStart: tidyShare((r + 1 - h) / rows), acrossEnd: tidyShare((r + 1) / rows) }
      }
    }
  }
  return best
}

/**
 * A new section: over the largest empty area, looking like the section beside it (`placeSection`), or else cut from
 * `fromId` (or the largest section) along its longer side, keeping that section's lens and track so the thread still
 * looks the same, and named after it. Undefined when there's no room.
 */
export function addBlankSection(pattern: ThreadPattern, widthMm: number, fromId?: string): { pattern: ThreadPattern; id: string } | undefined {
  const free = freeRect(pattern)
  if (free) return placeSection(pattern, free, widthMm)
  const largest = pattern.sections.reduce((a, b) => (area(b) > area(a) ? b : a))
  const from = pattern.sections.find((s) => s.id === fromId) ?? largest
  return splitLonger(pattern, from.id, widthMm, nameAfter(pattern, from)) ?? (from === largest ? undefined : splitLonger(pattern, largest.id, widthMm, nameAfter(pattern, largest)))
}

/**
 * The empty parts of the repeat as rectangles, largest first. The repeat is cut along every section edge, so a gap
 * left by an edge off the snapping grid is filled exactly, with no sliver; given `at`, only the gap around that point.
 */
export function gapRects(pattern: ThreadPattern, at?: PatternPoint): Rect[] {
  const lines = (values: number[], max: number) => [0, max, ...values.map((v) => clamp(v, 0, max))]
    .toSorted((a, b) => a - b)
    .filter((v, i, all) => i === 0 || v - all[i - 1] > EPS)
  const along = lines(pattern.sections.flatMap((s) => [s.startMm, s.endMm]), pattern.repeatMm)
  const across = lines(pattern.sections.flatMap((s) => [s.acrossStart, s.acrossEnd]), 1)
  const cols = along.length - 1, rows = across.length - 1
  // No section edge runs through a cell, so its middle says whether a section covers it
  const free = Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, r) => {
    const a = (along[c] + along[c + 1]) / 2, x = (across[r] + across[r + 1]) / 2
    return !pattern.sections.some((s) => a > s.startMm && a < s.endMm && x > s.acrossStart && x < s.acrossEnd)
  }))
  if (at) {
    // The cells at the point (more than one on an edge), and of those a free one
    const cells = (lines: number[], v: number) => lines.slice(0, -1).flatMap((line, i) => (v >= line - EPS && v <= lines[i + 1] + EPS ? [i] : []))
    const start = cells(along, at.along).flatMap((c) => cells(across, at.across).map((r) => [c, r])).find(([c, r]) => free[c][r])
    if (!start) return []
    const [c0, r0] = start
    // Only the free cells joined to that one
    const keep = free.map((col) => col.map(() => false))
    const todo = [[c0, r0]]
    keep[c0][r0] = true
    while (todo.length) {
      const [c, r] = todo.pop()!
      for (const [nc, nr] of [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]]) {
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || keep[nc][nr] || !free[nc][nr]) continue
        keep[nc][nr] = true
        todo.push([nc, nr])
      }
    }
    free.forEach((col, c) => col.forEach((_, r) => (col[r] = keep[c][r])))
  }
  const rects: Rect[] = []
  for (;;) {
    // The largest free rectangle: each column's run of free cells ending at this row, then the widest stretch of columns at least as tall
    const heights = new Array<number>(cols).fill(0)
    let best: { c0: number; c1: number; r0: number; r1: number } | undefined, most = EPS * EPS
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) heights[c] = free[c][r] ? heights[c] + 1 : 0
      for (let c = 0; c < cols; c++) {
        const h = heights[c]
        if (!h) continue
        let lo = c, hi = c
        while (lo > 0 && heights[lo - 1] >= h) lo--
        while (hi < cols - 1 && heights[hi + 1] >= h) hi++
        const size = (along[hi + 1] - along[lo]) * (across[r + 1] - across[r + 1 - h])
        if (size > most) {
          most = size
          best = { c0: lo, c1: hi, r0: r + 1 - h, r1: r }
        }
      }
    }
    if (!best) return rects
    for (let c = best.c0; c <= best.c1; c++) for (let r = best.r0; r <= best.r1; r++) free[c][r] = false
    // A sliver left by rounding (under a micron along or a thousandth across) is no gap worth a section
    if (along[best.c1 + 1] - along[best.c0] < 1e-3 || across[best.r1 + 1] - across[best.r0] < 1e-3) continue
    rects.push({ startMm: tidy(along[best.c0]), endMm: tidy(along[best.c1 + 1]), acrossStart: tidyShare(across[best.r0]), acrossEnd: tidyShare(across[best.r1 + 1]) })
  }
}

/** How a section meets a rectangle: on its ends along the thread (`along`, or `seam` across the repeat's ends) or beside it (`across`) */
interface Touch {
  section: ThreadSection
  side: 'along' | 'seam' | 'across'
  /** Edge they share, mm */
  shared: number
  /** The section runs the rectangle's whole side: the rectangle sits in line with it, as a gap left in a lane does */
  inline: boolean
  /** The two sides match exactly, so together they make one rectangle */
  exact: boolean
}

function touches(pattern: ThreadPattern, rect: Rect, widthMm: number): Touch[] {
  const near = (a: number, b: number) => Math.abs(a - b) <= EPS
  const repeat = pattern.repeatMm
  const found: Touch[] = []
  for (const s of pattern.sections) {
    const across = overlap(s.acrossStart, s.acrossEnd, rect.acrossStart, rect.acrossEnd)
    if (across > EPS) {
      const inline = s.acrossStart <= rect.acrossStart + EPS && s.acrossEnd >= rect.acrossEnd - EPS
      const touch = { section: s, shared: across * widthMm, inline, exact: inline && near(s.acrossStart, rect.acrossStart) && near(s.acrossEnd, rect.acrossEnd) }
      if (near(s.endMm, rect.startMm) || near(s.startMm, rect.endMm)) found.push({ ...touch, side: 'along' })
      else if ((near(s.endMm, repeat) && near(rect.startMm, 0)) || (near(s.startMm, 0) && near(rect.endMm, repeat))) found.push({ ...touch, side: 'seam' })
    }
    const along = overlap(s.startMm, s.endMm, rect.startMm, rect.endMm)
    if (along > EPS && (near(s.acrossEnd, rect.acrossStart) || near(s.acrossStart, rect.acrossEnd))) {
      const inline = s.startMm <= rect.startMm + EPS && s.endMm >= rect.endMm - EPS
      found.push({ section: s, side: 'across', shared: along, inline, exact: inline && near(s.startMm, rect.startMm) && near(s.endMm, rect.endMm) })
    }
  }
  return found
}
/** Closest in line first: an exact match, then along the thread (the lane it carries on) before beside it, then not across the seam, then the longer edge */
const closer = (a: Touch, b: Touch) =>
  Number(b.exact) - Number(a.exact) || Number(b.side !== 'across') - Number(a.side !== 'across')
  || Number(b.side !== 'seam') - Number(a.side !== 'seam') || b.shared - a.shared

/**
 * The section a new one over `rect` should look like: the one it sits in line with, so a gap left in a lane goes
 * back to that lane, else the one it shares the most edge with, across the repeat's ends too. Undefined when it
 * touches none.
 */
export function neighbourLook(pattern: ThreadPattern, rect: Rect, widthMm: number): ThreadSection | undefined {
  const found = touches(pattern, rect, widthMm)
  const inline = found.filter((t) => t.inline).toSorted(closer).at(0)
  if (inline) return inline.section
  let best: ThreadSection | undefined, most = EPS
  for (const s of pattern.sections) {
    const shared = found.reduce((sum, t) => sum + (t.section === s ? t.shared : 0), 0)
    if (shared > most) {
      most = shared
      best = s
    }
  }
  return best
}

/**
 * A new section over `rect`, an empty area of the repeat, carrying on the thread around it: the lens and track of
 * the section `neighbourLook` picks, and named after it. Plain (the banknote's lens, every frame, "Section N") only
 * when it touches no section. Drawing, Add section and Fill all place new sections this way.
 */
export function placeSection(pattern: ThreadPattern, rect: Rect, widthMm: number): { pattern: ThreadPattern; id: string } {
  const look = neighbourLook(pattern, rect, widthMm)
  const id = newId()
  const section: ThreadSection = {
    id, name: look ? nameAfter(pattern, look) : nextName(pattern), ...rectOf(rect),
    ...(look?.lens && { lens: look.lens }), ...(look?.track && { track: look.track }),
  }
  return { pattern: { ...pattern, sections: [...pattern.sections, section] }, id }
}

/** The section that `rect` would grow into one bigger rectangle: sharing one whole side with it, within the repeat (along the thread first) */
function growInto(pattern: ThreadPattern, rect: Rect, widthMm: number): ThreadSection | undefined {
  return touches(pattern, rect, widthMm).filter((t) => t.exact && t.side !== 'seam').toSorted(closer).at(0)?.section
}

/**
 * Every empty area of the repeat (or only the one around `at`) filled, so the thread carries on as it looks next to
 * it: a section that shares a whole side with the gap grows over it (a lane cut short runs on again), otherwise a
 * new section is placed there (`placeSection`), like the one it sits in line with, else the one it borders most. The id is the
 * section over the largest gap, to select. Undefined when there's no gap.
 */
export function fillGaps(pattern: ThreadPattern, widthMm: number, at?: PatternPoint): { pattern: ThreadPattern; id: string } | undefined {
  let next = pattern, first: string | undefined
  for (const rect of gapRects(pattern, at)) {
    const grow = growInto(next, rect, widthMm)
    if (grow) {
      next = updateSection(next, grow.id, {
        startMm: Math.min(grow.startMm, rect.startMm), endMm: Math.max(grow.endMm, rect.endMm),
        acrossStart: Math.min(grow.acrossStart, rect.acrossStart), acrossEnd: Math.max(grow.acrossEnd, rect.acrossEnd),
      })
      first ??= grow.id
      continue
    }
    const added = placeSection(next, rect, widthMm)
    next = added.pattern
    first ??= added.id
  }
  return first === undefined ? undefined : { pattern: next, id: first }
}

export const removeSection = (pattern: ThreadPattern, id: string): ThreadPattern =>
  pattern.sections.length > 1 ? { ...pattern, sections: pattern.sections.filter((s) => s.id !== id) } : pattern

export const updateSection = (pattern: ThreadPattern, id: string, patch: Partial<ThreadSection>): ThreadPattern =>
  ({ ...pattern, sections: pattern.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

/** The pattern with a new repeat length: sections keep their place within it, scaled along */
export function setRepeat(pattern: ThreadPattern, repeatMm: number): ThreadPattern {
  const repeat = clamp(repeatMm, REPEAT_LIMITS.min, REPEAT_LIMITS.max)
  const k = repeat / pattern.repeatMm
  return { ...pattern, repeatMm: repeat, sections: pattern.sections.map((s) => ({ ...s, startMm: tidy(s.startMm * k), endMm: tidy(s.endMm * k) })) }
}

/** The pattern with a change to one section's own lens; the first change starts from the lens it plays now */
export function setSectionLens(note: PatternNote, id: string, patch: Partial<TiltSettings>): ThreadPattern {
  const pattern = patternOf(note)
  return updateSection(pattern, id, { lens: pickLens({ ...(pattern.sections.find((s) => s.id === id)?.lens ?? pickLens(note.tilt)), ...patch }) })
}

/** The pattern with one section's strips showing these banknote frames (by index) */
export function setSectionTrack(note: PatternNote, id: string, slots: number[]): ThreadPattern {
  return updateSection(patternOf(note), id, { track: trackFor(note.frames, slots) })
}
