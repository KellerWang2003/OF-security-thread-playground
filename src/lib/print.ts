import { frameEdges, lensCycle, type LensState } from './lens'
import { mod } from './pattern'
import type { Frame, ThreadSection } from './types'

/**
 * The thread's print under a lenticular lens. Every frame is cut into strips parallel to the ridges and woven
 * together: each ridge covers one full cycle, so each frame's strip is as wide as its share of the cycle, and the
 * frame seen flat sits under the middle of each ridge. Only the ridge angle, the frame lengths and flat change the
 * print; how far a tilt has to go to play it (Cycle) is the lens's doing.
 *
 * Strips run across each ridge the same way round as the tilt map, so flipping between the two lines up; a real
 * lens mirrors the order within each ridge.
 */
export interface Weave {
  /** Unit vector across the ridges on the banknote (x right, y up): the way the cycle advances */
  ux: number
  uy: number
  /** Ridge width, mm */
  pitchMm: number
  /** Where flat sits along the cycle, 0 to 1 */
  offset: number
  /** Frame edges along one cycle, 0 to 1 */
  edges: number[]
}

const wrap01 = (v: number) => ((v % 1) + 1) % 1

export function weave(lens: Pick<LensState, 'cycleX' | 'cycleY' | 'dirX' | 'dirY' | 'offset'>, frames: Pick<Frame, 'length'>[], pitchMm: number): Weave {
  // Each tilt's share of the cycle per degree; scaled by the lens cycle, the pair has length 1
  const c = lensCycle(lens)
  const gx = lens.cycleX ? lens.dirX / lens.cycleX : 0
  const gy = lens.cycleY ? lens.dirY / lens.cycleY : 0
  return { ux: gx * c, uy: gy * c, pitchMm: Math.max(1e-6, pitchMm), offset: lens.offset, edges: frameEdges(frames) }
}

/** Where a point on the thread (mm from its top left, y down) sits across its ridge: 0 at one edge, 1 at the next */
export function ridgePhase(w: Weave, xMm: number, yMm: number) {
  return wrap01((w.ux * xMm - w.uy * yMm) / w.pitchMm)
}

/** Which frame (by index) shows at a position along the cycle */
export function frameAtPosition(edges: number[], position: number) {
  const p = wrap01(position)
  for (let i = 0; i < edges.length - 2; i++) if (p < (edges.at(i + 1) ?? 1)) return i
  return Math.max(0, edges.length - 2)
}

/** The cycle position printed at a ridge phase: flat in the middle of the ridge */
export const phasePosition = (w: Weave, phase: number) => w.offset + phase - 0.5

/** The frame printed at a point on the thread */
export function printedFrame(w: Weave, xMm: number, yMm: number) {
  return frameAtPosition(w.edges, phasePosition(w, ridgePhase(w, xMm, yMm)))
}

/** One section of a thread's pattern as printed: its area within the repeat, the frame each strip shows, its weave */
export interface SectionCut {
  startMm: number
  endMm: number
  acrossStart: number
  acrossEnd: number
  /** The banknote frame (by index) each strip shows */
  slots: number[]
  weave: Weave
}

/** What shapes a section's print: its area, its strips and its lens (`PreparedSection` has them all) */
export interface CutSource {
  section: Pick<ThreadSection, 'startMm' | 'endMm' | 'acrossStart' | 'acrossEnd'>
  slots: number[]
  lens: Pick<LensState, 'cycleX' | 'cycleY' | 'dirX' | 'dirY' | 'offset'>
}

/** Every section of a pattern cut at its own ridge angle, all with the same ridge width */
export function cutPattern(sections: CutSource[], frames: Pick<Frame, 'length'>[], pitchMm: number): SectionCut[] {
  return sections.map(({ section: { startMm, endMm, acrossStart, acrossEnd }, slots, lens }) => ({
    startMm, endMm, acrossStart, acrossEnd, slots, weave: weave(lens, frames, pitchMm),
  }))
}

/**
 * What prints at a point of the thread (mm from its top left, y down): the section there (by index), the strip of
 * its print and the banknote frame that strip shows, and where the point sits across its ridge. Undefined in a gap.
 */
export function printedAt(cuts: SectionCut[], repeatMm: number, thread: { widthMm: number; direction: 'vertical' | 'horizontal' }, xMm: number, yMm: number) {
  const vertical = thread.direction === 'vertical'
  const along = mod(vertical ? yMm : xMm, repeatMm), share = (vertical ? xMm : yMm) / thread.widthMm
  const section = cuts.findIndex((c) => along >= c.startMm && along < c.endMm && share >= c.acrossStart && share < c.acrossEnd)
  const cut = cuts.at(section)
  if (section < 0 || !cut) return undefined
  const phase = ridgePhase(cut.weave, xMm, yMm)
  const slot = frameAtPosition(cut.weave.edges, phasePosition(cut.weave, phase))
  return { section, slot, frame: cut.slots.at(slot) ?? slot, phase }
}
