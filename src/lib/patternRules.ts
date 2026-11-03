import { FLAT, lensMix, type Axis } from './lens'
import {
  DEAD_ZONE_MM,
  HIDDEN_RIDGE_TOLERANCE_DEG,
  MAX_ANGLE_TYPES,
  MIN_SECTION_ACROSS_MM,
  MIN_SECTION_ALONG_MM,
  mod,
  preparePattern,
  reachedFrames,
  restFrame,
  type PreparedPattern,
  type PreparedSection,
} from './pattern'
import { fitSections, threadLength } from './thread'
import type { Note } from './types'
import { formatLength, lengthUnit, type LengthUnit } from './units'

/**
 * The layout rules every pattern is checked against. They are warnings, never blockers: the designer decides.
 * 1. Every window shows each tilt, wherever the print lands along the thread (it isn't registered to the banknote).
 * 2. Every section rests on the same frame, so the thread reads as one image flat.
 * 3. Frames only some sections show sit under ridges near parallel to their tilt's axis, so the other tilt is blind to them.
 * 4. Every section's print has one strip per frame; strips set for another number of frames are stretched to fit (shown, not blocked).
 * 5. Sections are big enough to print, dead zones where angles meet excluded.
 * 6. Few ridge angles on one thread.
 */

export type RuleNote = Pick<Note, 'frames' | 'tilt' | 'pattern' | 'thread' | 'widthMm' | 'heightMm'>
export interface PatternIssue {
  text: string
  /** More on hover */
  title?: string
  /** The section a click selects */
  sectionId?: string
  /** The window it's about */
  windowId?: string
}
export interface PatternCheck {
  id: 'windows' | 'rest' | 'hidden' | 'strips' | 'size' | 'angles' | 'gaps'
  title: string
  /** The rule in a line, on hover */
  explain: string
  /** Warnings matter for the print; info shows what happens */
  level: 'warn' | 'info'
  issues: PatternIssue[]
}

const EPS = 1e-6
const AXIS = { y: '↕', x: '↔' } as const
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0)
const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits
const frameList = (frames: number[]) => frames.map((f) => f + 1).join(', ')
const sameAngle = (a: number, b: number) => Math.abs(a - b) < 0.25

interface Usable {
  /** Along the repeat, mm, dead zones excluded */
  along: [number, number]
  /** Spans the whole repeat, so it runs on unbroken from one repeat into the next */
  continuous: boolean
  acrossMm: number
}

/** Each section's printable area: a dead zone is lost on each side where it meets a section at another ridge angle */
function usableAreas(pp: PreparedPattern, widthMm: number) {
  const repeat = pp.pattern.repeatMm
  const half = DEAD_ZONE_MM / 2
  const out = new Map<string, Usable>()
  for (const p of pp.sections) {
    const s = p.section
    const differs = (q: PreparedSection) => !sameAngle(q.angle, p.angle)
    const acrossMeets = (q: PreparedSection) => overlap(s.acrossStart, s.acrossEnd, q.section.acrossStart, q.section.acrossEnd) > EPS
    const alongMeets = (q: PreparedSection) => overlap(s.startMm, s.endMm, q.section.startMm, q.section.endMm) > EPS
    // Along, the repeat's ends meet the next repeat's start
    const atEnd = pp.sections.some((q) => differs(q) && acrossMeets(q) && (Math.abs(q.section.startMm - s.endMm) < EPS || (s.endMm >= repeat - EPS && q.section.startMm <= EPS)))
    const atStart = pp.sections.some((q) => differs(q) && acrossMeets(q) && (Math.abs(q.section.endMm - s.startMm) < EPS || (s.startMm <= EPS && q.section.endMm >= repeat - EPS)))
    const atFar = pp.sections.some((q) => differs(q) && alongMeets(q) && Math.abs(q.section.acrossStart - s.acrossEnd) < EPS)
    const atNear = pp.sections.some((q) => differs(q) && alongMeets(q) && Math.abs(q.section.acrossEnd - s.acrossStart) < EPS)
    out.set(s.id, {
      along: [s.startMm + (atStart ? half : 0), s.endMm - (atEnd ? half : 0)],
      continuous: s.startMm <= EPS && s.endMm >= repeat - EPS,
      acrossMm: (s.acrossEnd - s.acrossStart) * widthMm - (atNear ? half : 0) - (atFar ? half : 0),
    })
  }
  return out
}

/** What every window has to hold: a section from each set, on each tilt that plays */
interface Requirement {
  axis: Axis
  /** The frames only these sections show on this tilt; absent when it's the tilt itself */
  frames?: number[]
  sections: string[]
}

/**
 * For each tilt that plays somewhere: a section that plays it, and for frames only some of those sections show, one
 * of those. A set of frames whose carriers hold another set's is already met by it, so only the smallest are kept.
 */
function requirements(note: RuleNote, pp: PreparedPattern): Requirement[] {
  const all: Requirement[] = []
  for (const axis of ['y', 'x'] as const) {
    const reach = pp.sections.map((p) => ({ id: p.section.id, frames: reachedFrames(note, p, axis) })).filter((r) => r.frames.size >= 2)
    if (!reach.length) continue
    const tilt = { axis, sections: reach.map((r) => r.id) }
    const byCarriers = new Map<string, Requirement>()
    for (const f of [...new Set(reach.flatMap((r) => [...r.frames]))].toSorted((a, b) => a - b)) {
      const sections = reach.filter((r) => r.frames.has(f)).map((r) => r.id)
      if (sections.length === tilt.sections.length) continue
      const key = sections.join('|')
      const known = byCarriers.get(key)
      if (known) known.frames?.push(f)
      else byCarriers.set(key, { axis, frames: [f], sections })
    }
    const sets = [...byCarriers.values()]
    all.push(tilt, ...sets.filter((r) => !sets.some((o) => o !== r && o.sections.length < r.sections.length && o.sections.every((id) => r.sections.includes(id)))))
  }
  return all
}

/** Offsets (0 to the repeat) at which some copy of one of these sections shows at least the minimum in the window */
function goodOffsets(req: Requirement, usable: Map<string, Usable>, w0: number, w1: number, repeat: number): [number, number][] | 'always' {
  const m = MIN_SECTION_ALONG_MM
  // A section over the whole repeat runs through every window, however short
  if (req.sections.some((id) => usable.get(id)?.continuous)) return 'always'
  if (w1 - w0 < m - EPS) return []
  const pieces: [number, number][] = []
  for (const id of req.sections) {
    const u = usable.get(id)
    if (!u) continue
    const [a, b] = u.along
    if (b - a < m - EPS) continue
    // A copy shifted by o shows [a + o, b + o]: at least m of it is inside the window for o in [lo, hi], every repeat
    const lo = w0 + m - b, hi = w1 - m - a
    if (hi - lo >= repeat - EPS) return 'always'
    const start = mod(lo, repeat), end = start + (hi - lo)
    if (end <= repeat) pieces.push([start, end])
    else pieces.push([start, repeat], [0, end - repeat])
  }
  return pieces
}

const covered = (pieces: [number, number][]) => {
  let total = 0, reach = -Infinity
  for (const [a, b] of pieces.toSorted((p, q) => p[0] - q[0])) {
    if (b <= reach) continue
    total += b - Math.max(a, reach)
    reach = b
  }
  return total
}

export interface WindowReport {
  /** Absent for a thread without windows, checked as one */
  windowId?: string
  label: string
  /** What can go missing, one entry per tilt or set of frames: "↕", "↕ frames 1, 5" */
  misses: { label: string; share: number; now: boolean; sectionId?: string }[]
}

/** Rule 1 for each window: what it can miss, at what share of offsets, and whether it misses it at `offsetMm` */
export function windowReports(note: RuleNote, offsetMm = 0): WindowReport[] {
  const pp = preparePattern(note)
  const repeat = pp.pattern.repeatMm
  const usable = usableAreas(pp, note.thread.widthMm)
  const reqs = requirements(note, pp)
  const length = threadLength(note)
  const windows = note.thread.windows.enabled
    ? fitSections(note.thread.windows.sections ?? [], length).map((w, i) => ({ id: w.id, label: `Window ${i + 1}`, start: w.startMm, end: w.endMm }))
    : [{ id: undefined, label: 'Thread', start: 0, end: length }]
  const at = mod(offsetMm, repeat)
  return windows.map((w) => {
    const misses = reqs.flatMap((req) => {
      const good = goodOffsets(req, usable, w.start, w.end, repeat)
      if (good === 'always') return []
      const share = 1 - Math.min(repeat, covered(good)) / repeat
      if (share <= 1e-4) return []
      const now = !good.some(([a, b]) => at >= a - EPS && at <= b + EPS)
      return [{ req, label: req.frames ? `${AXIS[req.axis]} frames ${frameList(req.frames)}` : AXIS[req.axis], share, now, sectionId: req.sections.at(0) }]
    })
    // Missing a tilt altogether misses its frames too: name them only where they go missing more often
    const kept = misses.filter((m) => !m.req.frames || !misses.some((t) => !t.req.frames && t.req.axis === m.req.axis && t.share >= m.share - 1e-4 && (t.now || !m.now)))
    return { windowId: w.id, label: w.label, misses: kept.map(({ req: _req, ...rest }) => rest) }
  })
}

/** Every rule, with what breaks it; lengths in the text in `unit`, the one picked by default */
export function checkPattern(note: RuleNote, unit: LengthUnit = lengthUnit()): PatternCheck[] {
  const pp = preparePattern(note)
  const { pattern, sections } = pp
  const name = (p: PreparedSection) => p.section.name || 'Section'
  const usable = usableAreas(pp, note.thread.widthMm)
  const checks: PatternCheck[] = []

  checks.push({
    id: 'windows', title: 'Every window shows each tilt', level: 'warn',
    explain: 'The print lands anywhere along the thread, so every window needs a section for each tilt, and for frames only one tilt shows, wherever it lands: keep the repeat at most half the shortest window.',
    issues: windowReports(note).flatMap((w) => w.misses.length ? [{
      text: `${w.label} can miss ${w.misses.map((m) => m.label).join(' · ')}`,
      title: `At ${Math.round(Math.max(...w.misses.map((m) => m.share)) * 100)}% of print offsets`,
      sectionId: w.misses[0].sectionId, windowId: w.windowId,
    }] : []),
  })

  // The frame most sections rest on; a tie goes to the banknote's own flat frame
  const rests = sections.map((p) => restFrame(note, p))
  const own = lensMix(note, FLAT).current
  const counts = new Map<number, number>()
  for (const f of rests) counts.set(f, (counts.get(f) ?? 0) + 1)
  const common = [...counts].reduce((best, entry) => (entry[1] > best[1] || (entry[1] === best[1] && entry[0] === own) ? entry : best), [own, 0])[0]
  checks.push({
    id: 'rest', title: 'Shared rest frame', level: 'warn',
    explain: 'Every section shows the same frame flat, so the thread reads as one image at rest.',
    issues: sections.flatMap((p, i) => rests[i] === common ? [] : [{ text: `${name(p)} rests on ${rests[i] + 1}, the others on ${common + 1}`, sectionId: p.section.id }]),
  })

  // Frames only some sections show: their ridges should sit near a tilt's axis so the other tilt never sees them
  const shows = sections.map((p) => new Set([...reachedFrames(note, p, 'y'), ...reachedFrames(note, p, 'x')]))
  const hiddenBy = new Map<number, number[]>()
  note.frames.forEach((_, f) => {
    const carriers = sections.flatMap((_, i) => (shows[i].has(f) ? [i] : []))
    if (carriers.length === 0 || carriers.length === sections.length) return
    for (const i of carriers) {
      const p = sections[i]
      const off = Math.min(Math.abs(p.angle), 90 - Math.abs(p.angle))
      if (off <= HIDDEN_RIDGE_TOLERANCE_DEG + EPS) continue
      // Chevron-style pairs: mirrored arms carrying the same frames step together on one tilt
      if (carriers.some((j) => j !== i && Math.abs(sections[j].angle + p.angle) < 0.25)) continue
      hiddenBy.set(i, [...(hiddenBy.get(i) ?? []), f])
    }
  })
  checks.push({
    id: 'hidden', title: 'Hidden frames on a blind tilt', level: 'warn',
    explain: `Frames only some sections show need ridges within ${HIDDEN_RIDGE_TOLERANCE_DEG}° of parallel to their tilt's axis, or the other tilt sees them (leak ≈ sin of the offset). Mirrored pairs are fine.`,
    issues: [...hiddenBy].map(([i, frames]) => {
      const p = sections[i]
      const off = Math.min(Math.abs(p.angle), 90 - Math.abs(p.angle))
      const axis = Math.abs(p.angle) <= 45 ? 'y' : 'x'
      return {
        text: `${name(p)} hides ${frameList(frames)} at ${round(off)}° off ${AXIS[axis]} · ${Math.round(Math.sin((off * Math.PI) / 180) * 100)}% leaks`,
        title: `Ridges ${round(Math.abs(p.angle))}° from horizontal`,
        sectionId: p.section.id,
      }
    }),
  })

  checks.push({
    id: 'strips', title: 'One strip count', level: 'info',
    explain: 'Every section prints one strip per banknote frame. Strips set for another number of frames (after adding or deleting one) are stretched to fit.',
    // Only strips set for another number of frames: a story that repeats frames on purpose is fine, and one whose
    // frames are all gone plays every frame in order
    issues: sections.flatMap((p) => {
      const set = p.section.track?.filter((id) => note.frames.some((f) => f.id === id)).length
      return set && set !== note.frames.length
        ? [{ text: `${name(p)}: ${set} strips set for ${note.frames.length} frames`, title: p.slots.map((f) => f + 1).join(' '), sectionId: p.section.id }]
        : []
    }),
  })

  checks.push({
    id: 'size', title: 'Minimum sizes', level: 'warn',
    explain: `Each section at least ${formatLength(MIN_SECTION_ALONG_MM, unit)} along and ${formatLength(MIN_SECTION_ACROSS_MM, unit)} across, less ${formatLength(DEAD_ZONE_MM, unit)} where two ridge angles meet.`,
    issues: sections.flatMap((p) => {
      const u = usable.get(p.section.id)
      if (!u) return []
      const out: PatternIssue[] = []
      const along = u.along[1] - u.along[0]
      if (!u.continuous && along < MIN_SECTION_ALONG_MM - EPS) out.push({ text: `${name(p)}: ${formatLength(Math.max(0, along), unit)} along`, sectionId: p.section.id })
      if (u.acrossMm < MIN_SECTION_ACROSS_MM - EPS) out.push({ text: `${name(p)}: ${formatLength(Math.max(0, u.acrossMm), unit)} across`, sectionId: p.section.id })
      return out
    }),
  })

  const angles = [...new Set(sections.map((p) => round(p.angle, 0)))]
  checks.push({
    id: 'angles', title: 'Few angle types', level: 'warn',
    explain: `At most ${MAX_ANGLE_TYPES} ridge angles on one thread.`,
    issues: angles.length > MAX_ANGLE_TYPES ? [{ text: `${angles.length} ridge angles`, title: angles.map((a) => `${a}°`).join(', ') }] : [],
  })

  const gap = 1 - pattern.sections.reduce((total, s) => total + (s.endMm - s.startMm) * (s.acrossEnd - s.acrossStart), 0) / pattern.repeatMm
  checks.push({
    id: 'gaps', title: 'No gaps', level: 'warn',
    explain: 'Areas with no section print no frames.',
    issues: gap > 1e-3 ? [{ text: `${round(gap * 100, 0)}% of each repeat is empty` }] : [],
  })
  return checks
}

/** Warnings across every rule, for a badge */
export const warningCount = (checks: PatternCheck[]) => checks.reduce((n, c) => n + (c.level === 'warn' ? c.issues.length : 0), 0)
