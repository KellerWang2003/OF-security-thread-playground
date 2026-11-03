import { describe, expect, it } from 'vitest'
import { cyclePosition, lensAngle, lensMix, lensState } from '../src/lib/lens'
import { DEFAULT_TILT, createNote } from '../src/lib/notes'
import { patternMix, preparePattern } from '../src/lib/pattern'
import { presetPattern } from '../src/lib/patternPresets'
import { cutPattern, frameAtPosition, phasePosition, printedAt, printedFrame, ridgePhase, weave } from '../src/lib/print'
import type { Note, ThreadPattern, TiltSettings } from '../src/lib/types'

const frames = (lengths: number[]) => lengths.map((length, i) => ({ id: String(i), kind: 'color' as const, color: '#000', name: '', length }))
const tilt = (patch: Partial<TiltSettings>) => ({ cycleDeg: 40, transition: 0, ...patch }) as TiltSettings
const RAD = Math.PI / 180

describe('the print under the ridges', () => {
  it('runs horizontal strips for a horizontal lens and vertical ones for a vertical lens', () => {
    const f = frames([1, 1, 1, 1, 1])
    const flat = weave(lensState(tilt({ effect: 'updown' }), f), f, 1)
    const side = weave(lensState(tilt({ effect: 'side' }), f), f, 1)
    for (let y = 0; y < 3; y += 0.13) {
      expect(printedFrame(flat, 0, y)).toBe(printedFrame(flat, 2.7, y))
    }
    for (let x = 0; x < 3; x += 0.13) {
      expect(printedFrame(side, x, 0)).toBe(printedFrame(side, x, 2.7))
    }
  })

  it('runs its strips the way the tilt map runs its bands, at the lens angle', () => {
    const f = frames([1, 2, 1, 3])
    for (const patch of [{ effect: 'both' as const }, { effect: 'custom' as const, cycleDeg: 30, cycleXDeg: 75 }, { effect: 'custom' as const, cycleDeg: 60, cycleXDeg: 25, runX: 'left' as const }]) {
      const lens = lensState(tilt(patch), f)
      const w = weave(lens, f, 0.7)
      // A tilt that changes nothing (along the tilt map's bands), as a direction on the banknote with y up
      const cx = lens.cycleX ?? 0, cy = lens.cycleY ?? 0
      const d = { x: cx * lens.dirY, y: -cy * lens.dirX }
      expect(cyclePosition(lens, d)).toBeCloseTo(lens.offset, 9)
      expect(Math.atan2(Math.abs(d.y), Math.abs(d.x)) / RAD).toBeCloseTo(Math.abs(lensAngle(lens)), 9)
      const len = Math.hypot(d.x, d.y)
      for (let t = -3; t <= 3; t += 0.37) {
        const x = 1.1 + (t * d.x) / len, yUp = 0.4 + (t * d.y) / len
        expect(ridgePhase(w, x, -yUp)).toBeCloseTo(ridgePhase(w, 1.1, -0.4), 9)
      }
    }
  })

  it('puts the frame seen flat under the middle of every ridge', () => {
    for (const flatAt of [1, 3, 5, 7, 9]) {
      const f = frames([1, 1, 1, 1, 1])
      const lens = lensState(tilt({ flatAt }), f)
      const w = weave(lens, f, 1)
      const atFlat = lensMix({ frames: f, tilt: tilt({ flatAt }) }, { x: 0, y: 0 }, lens).current
      for (let k = 0; k < 4; k++) expect(printedFrame(w, 0, -(k + 0.5))).toBe(atFlat)
    }
  })

  it('gives each frame a strip as wide as its length on the timeline', () => {
    const lengths = [1, 3, 2, 4]
    const f = frames(lengths)
    const w = weave(lensState(tilt({ effect: 'updown' }), f), f, 1)
    const counts = lengths.map(() => 0)
    const samples = 10_000
    for (let i = 0; i < samples; i++) counts[printedFrame(w, 0, -(i + 0.5) / samples)]++
    counts.forEach((n, i) => expect(n / samples).toBeCloseTo(lengths[i] / 10, 2))
  })

  it("doesn't change when only the Cycle does", () => {
    const f = frames([1, 1, 2, 1])
    for (const effect of ['updown', 'side', 'both'] as const) {
      const a = weave(lensState(tilt({ effect, cycleDeg: 25 }), f), f, 0.5)
      const b = weave(lensState(tilt({ effect, cycleDeg: 120 }), f), f, 0.5)
      for (let x = 0; x < 2; x += 0.11) for (let y = 0; y < 2; y += 0.13) expect(printedFrame(a, x, y)).toBe(printedFrame(b, x, y))
    }
  })

  it('lights up, at any tilt, the frame the banknote shows', () => {
    const f = frames([2, 1, 1, 3, 1])
    for (const patch of [{ effect: 'updown' as const }, { effect: 'custom' as const, cycleDeg: 35, cycleXDeg: 90, runY: 'down' as const }, { effect: 'reveal' as const, flatAt: 3 }]) {
      const t = tilt(patch)
      const lens = lensState(t, f)
      const w = weave(lens, f, 1)
      for (let y = -90; y <= 90; y += 7.3) for (let x = -90; x <= 90; x += 11.9) {
        // The lens looks at the strip as far from each ridge's middle as the tilt has moved along the cycle
        const phase = (((cyclePosition(lens, { x, y }) - lens.offset + 0.5) % 1) + 1) % 1
        expect(frameAtPosition(w.edges, phasePosition(w, phase))).toBe(lensMix({ frames: f, tilt: t }, { x, y }, lens).current)
      }
    }
  })
})

describe('the print of a thread with sections', () => {
  const note = (make?: (n: Note) => ThreadPattern): Note => {
    const base = { ...createNote({ name: 'P', x: 0, y: 0, widthMm: 134, heightMm: 68, color: '#fff' }), frames: frames([1, 1, 1, 1, 1]), tilt: { ...DEFAULT_TILT, cycleDeg: 25 } }
    base.thread = { ...base.thread, widthMm: 4 }
    return make ? { ...base, pattern: make(base) } : base
  }
  const printOf = (n: Note, pitch = 0.4) => {
    const prepared = preparePattern(n)
    return (x: number, y: number) => printedAt(cutPattern(prepared.sections, n.frames, pitch), prepared.pattern.repeatMm, n.thread, x, y)
  }

  it('prints a plain thread exactly as before', () => {
    const n = note()
    const lens = lensState(n.tilt, n.frames)
    const w = weave(lens, n.frames, 0.4)
    const at = printOf(n)
    for (let x = 0; x < 4; x += 0.17) for (let y = 0; y < 9; y += 0.23) expect(at(x, y)?.frame).toBe(printedFrame(w, x, y))
  })

  it('cuts each section at its own ridge angle', () => {
    const n = note((b) => presetPattern(b, 'chevron'))
    const at = printOf(n)
    const sections = preparePattern(n).sections
    expect(sections.map((p) => p.angle).toSorted()).toEqual([-45, 45])
    // Along each arm's ridges (a tilt that changes nothing, y down on the thread) the strip stays the same; across them it changes
    sections.forEach((p, i) => {
      const x0 = i === 0 ? 1 : 3
      const along = { x: (p.lens.cycleX ?? 0) * p.lens.dirY, y: (p.lens.cycleY ?? 0) * p.lens.dirX }
      const len = Math.hypot(along.x, along.y)
      for (let k = 0; k < 5; k++) {
        const y0 = 1 + k * 0.37
        const a = at(x0, y0)!, b = at(x0 + (0.5 * along.x) / len, y0 + (0.5 * along.y) / len)!
        expect(b.section).toBe(i)
        expect(b.phase).toBeCloseTo(a.phase, 9)
        expect(b.slot).toBe(a.slot)
      }
    })
    // The two arms lean opposite ways
    const [a, b] = sections.map((p) => Math.sign((p.lens.cycleX ?? 0) * p.lens.dirY * (p.lens.cycleY ?? 0) * p.lens.dirX))
    expect(a).toBe(-b)
    // Each the way its name says: / rises to the right, and y runs down the thread
    expect(sections.map((p) => p.section.name)).toEqual(['Arm /', 'Arm \\'])
    sections.forEach((p, i) => {
      const rise = i === 0 ? -1 : 1
      const w = weave(p.lens, n.frames, 0.4)
      for (let t = 0.2; t < 2; t += 0.3) expect(ridgePhase(w, 1 + t, 4 + rise * t)).toBeCloseTo(ridgePhase(w, 1, 4), 9)
    })
  })

  it('shows each section the frames its own track gives, and nothing in a gap', () => {
    const n = note((b) => ({ ...presetPattern(b, 'split'), sections: [presetPattern(b, 'split').sections[0]] }))
    const at = printOf(n)
    expect(at(3, 1)).toBeUndefined()
    const lane = preparePattern(n).sections[0]
    for (let y = 0; y < 3; y += 0.05) {
      const p = at(1, y)!
      expect(p.frame).toBe(lane.slots[p.slot])
      expect([1, 2, 3]).toContain(p.frame)
    }
  })

  it('lights the strip each section shows at a tilt', () => {
    const n = note((b) => presetPattern(b, 'split'))
    const prepared = preparePattern(n)
    for (const tilt of [{ x: 0, y: 17 }, { x: -33, y: 0 }]) {
      const mixes = patternMix(n, tilt)
      prepared.sections.forEach((p, i) => {
        const phase = (((cyclePosition(p.lens, tilt) - p.lens.offset + 0.5) % 1) + 1) % 1
        const w = weave(p.lens, n.frames, 1)
        expect(frameAtPosition(w.edges, phasePosition(w, phase))).toBe(mixes[i].slot)
      })
    }
  })
})
