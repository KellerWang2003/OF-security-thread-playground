import { describe, expect, it } from 'vitest'
import { lensAngle, lensMix, lensState, type Tilt2 } from '../src/lib/lens'
import { DEFAULT_TILT, migrateProject } from '../src/lib/notes'
import {
  ACROSS_STEP,
  WHOLE_ID,
  addBlankSection,
  defaultPattern,
  drawRect,
  duplicateSection,
  framesMissed,
  freeRect,
  migratePattern,
  moveRect,
  padTrack,
  patternMix,
  playbackLens,
  playbackTilt,
  preparePattern,
  remapTracks,
  removeSection,
  resizeEdge,
  sectionClip,
  sectionSlots,
  sectionSpans,
  sectionView,
  seamOf,
  setRepeat,
  setSectionLens,
  setSectionTrack,
  splitSection,
  trackFor,
} from '../src/lib/pattern'
import { presetPattern } from '../src/lib/patternPresets'
import { checkPattern, warningCount, windowReports } from '../src/lib/patternRules'
import type { Note, ThreadPattern, ThreadSection } from '../src/lib/types'

const frames = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `f${i}`, kind: 'color' as const, color: '#000', name: `${i + 1}`, length: 10 }))
const window = (startMm: number, endMm: number) => ({ id: `w${startMm}`, startMm, endMm })

/** The demo's first banknote: five frames on a vertical thread with three windows (12, 8 and 22 mm) */
function banknote(pattern?: ThreadPattern, patch: Partial<Note> = {}): Note {
  return {
    id: 'n', name: 'Banknote', x: 0, y: 0, widthMm: 134, heightMm: 68, background: 'solid', color: '#fff',
    frames: frames(5), tilt: { ...DEFAULT_TILT, cycleDeg: 25, transition: 0.3 },
    thread: { widthMm: 4, direction: 'vertical', positionMm: 101, imageGapMm: 0, windows: { enabled: true, sections: [window(5, 17), window(24, 32), window(40, 62)] } },
    ...(pattern ? { pattern } : {}),
    ...patch,
  }
}
const withPreset = (kind: Parameters<typeof presetPattern>[1], patch: Partial<Note> = {}) => {
  const note = banknote(undefined, patch)
  return { ...note, pattern: presetPattern(note, kind) }
}
const section = (patch: Partial<ThreadSection>): ThreadSection => ({ id: 's', name: 'S', startMm: 0, endMm: 4, acrossStart: 0, acrossEnd: 1, ...patch })
const shown = (note: Note, tilts: Tilt2[]) => {
  const seen = preparePattern(note).sections.map(() => new Set<number>())
  for (const t of tilts) patternMix(note, t).forEach((m, i) => seen[i].add(m.current))
  return seen.map((s) => [...s].toSorted())
}
const sweep = (axis: 'x' | 'y') => Array.from({ length: 181 }, (_, i) => (axis === 'y' ? { x: 0, y: i - 90 } : { x: i - 90, y: 0 }))
const issues = (note: Note, id: string) => checkPattern(note).find((c) => c.id === id)?.issues ?? []

describe('banknotes from before patterns', () => {
  const raw = () => {
    const { pattern: _pattern, ...note } = banknote()
    return { id: 'p', name: 'P', createdAt: 0, updatedAt: 0, notes: [note] }
  }

  it('get one section over the whole thread with mixed angles off', () => {
    const note = migrateProject(raw()).notes[0]
    expect(note.pattern).toEqual({ repeatMm: 4, mixed: false, sections: [{ id: WHOLE_ID, name: 'Whole thread', startMm: 0, endMm: 4, acrossStart: 0, acrossEnd: 1 }] })
    expect(preparePattern(note).plain).toBe(true)
  })

  it('show exactly the frame they always did at every tilt', () => {
    const before = banknote()
    const after = migrateProject(raw()).notes[0]
    for (let y = -90; y <= 90; y += 3.7) {
      for (const x of [-60, -12, 0, 7, 45]) {
        const [mix] = patternMix(after, { x, y })
        const old = lensMix(before, { x, y })
        expect([mix.base, mix.next, mix.current]).toEqual([old.base, old.next, old.current])
        expect(mix.blend).toBe(old.blend)
      }
    }
  })

  it('only gain a field, so the live app still opens projects edited here, and migrating again changes nothing', () => {
    const once = migrateProject(raw())
    const { pattern, ...rest } = once.notes[0]
    expect(pattern).toBeDefined()
    expect(Object.keys(rest).toSorted()).toEqual(Object.keys(raw().notes[0]).toSorted())
    expect(migrateProject(structuredClone(once))).toEqual(once)
    const edited = { ...once, notes: [{ ...once.notes[0], pattern: presetPattern(once.notes[0], 'split') }] }
    expect(migrateProject(structuredClone(edited))).toEqual(edited)
  })

  it('keep a saved pattern, cleaning up anything out of range', () => {
    const p = migratePattern({ repeatMm: 6, mixed: true, extra: 1, sections: [
      { id: 'a', name: 'A', startMm: -2, endMm: 9, acrossStart: 0, acrossEnd: 0.5, track: ['f1', 3] },
      { id: 'a', name: 'B', startMm: 0, endMm: 6, acrossStart: 0.5, acrossEnd: 1 },
      { id: 'c', startMm: 2, endMm: 2, acrossStart: 0, acrossEnd: 1 },
      null,
    ] })
    expect(p).toMatchObject({ repeatMm: 6, mixed: true, extra: 1 })
    expect(p.sections).toHaveLength(2)
    expect(p.sections[0]).toEqual({ id: 'a', name: 'A', startMm: 0, endMm: 6, acrossStart: 0, acrossEnd: 0.5, track: ['f1'] })
    expect(p.sections[1].id).not.toBe('a')
    expect(migratePattern(p)).toEqual(p)
    expect(migratePattern('nonsense')).toEqual(defaultPattern())
  })
})

describe('tracks', () => {
  it('spread a shorter story over every strip, and cut a longer one evenly', () => {
    expect(padTrack([1, 2, 3], 5)).toEqual([1, 1, 2, 3, 3])
    expect(padTrack([0, 1, 2, 3, 4], 4)).toEqual([0, 1, 3, 4])
    expect(padTrack([], 5)).toEqual([])
  })

  it('name frames by id, skip ones since deleted, and play every frame without one', () => {
    const f = frames(5)
    expect(sectionSlots(f, {})).toEqual([0, 1, 2, 3, 4])
    expect(sectionSlots(f, { track: ['f1', 'f2', 'f3'] })).toEqual([1, 1, 2, 3, 3])
    expect(sectionSlots(f, { track: ['f1', 'gone', 'f3'] })).toEqual([1, 1, 3, 3, 3])
    expect(sectionSlots(f, { track: ['gone'] })).toEqual([0, 1, 2, 3, 4])
    expect(trackFor(f, [0, 1, 2, 3, 4])).toBeUndefined()
    expect(trackFor(f, [1, 1, 2, 3, 3])).toEqual(['f1', 'f1', 'f2', 'f3', 'f3'])
  })

  it('follow their frames to new ids when a banknote is copied', () => {
    const pattern = { ...defaultPattern(), sections: [section({ track: ['f1', 'f2'] })] }
    expect(remapTracks(pattern, new Map([['f1', 'g1'], ['f2', 'g2']]))?.sections[0].track).toEqual(['g1', 'g2'])
  })

  it('pad the lens controls\' frames with the banknote frame each strip shows', () => {
    const note = withPreset('split')
    const view = sectionView(note, note.pattern!.sections[0])
    expect(view.frames.map((f) => (f as { index?: number }).index)).toEqual([1, 1, 2, 3, 3])
    expect(view.frames.map((f) => f.length)).toEqual(note.frames.map((f) => f.length))
    expect(sectionView(note, note.pattern!.sections[0])).toBe(view)
  })
})

describe('the frame each section shows', () => {
  it('splits the story by tilt in a split band: side to side plays three frames, up and down all five', () => {
    const note = withPreset('split')
    const [side, updown] = [0, 1]
    expect(patternMix(note, { x: 0, y: 0 }).map((m) => m.current)).toEqual([2, 2])
    const onY = shown(note, sweep('y'))
    const onX = shown(note, sweep('x'))
    expect(onY[updown]).toEqual([0, 1, 2, 3, 4])
    expect(onY[side]).toEqual([2])
    expect(onX[side]).toEqual([1, 2, 3])
    expect(onX[updown]).toEqual([2])
  })

  it('uses the banknote\'s lens for every section while mixed angles is off', () => {
    const note = withPreset('split')
    const off = { ...note, pattern: { ...note.pattern!, mixed: false } }
    for (const t of [{ x: 0, y: 14 }, { x: 30, y: 0 }]) {
      const [a, b] = patternMix(off, t)
      const shared = lensMix(off, t)
      expect(b.current).toBe(shared.current)
      // The side lane still plays its own track, through the shared lens
      expect(a.current).toBe([1, 1, 2, 3, 3][shared.current])
    }
  })

  it('keeps a section\'s own lens apart from the shared one', () => {
    const note = withPreset('split')
    const id = note.pattern!.sections[0].id
    const pattern = setSectionLens(note, id, { cycleDeg: 60 })
    expect(pattern.sections[0].lens).toMatchObject({ effect: 'side', cycleDeg: 60 })
    const changedShared = { ...note, pattern, tilt: { ...note.tilt, revealLevel: 2, cycleDeg: 10 } }
    expect(preparePattern(changedShared).sections[0].tilt).toMatchObject({ effect: 'side', cycleDeg: 60, revealLevel: undefined })
    expect(setSectionTrack(note, id, [0, 1, 2, 3, 4]).sections[0].track).toBeUndefined()
  })
})

describe('repeat and offset', () => {
  it('repeat each section along the thread, shifted by the offset', () => {
    const block = { startMm: 0, endMm: 2 }
    expect(sectionSpans(block, 4, 0, 10)).toEqual([[0, 2], [4, 6], [8, 10]])
    expect(sectionSpans(block, 4, 1, 10)).toEqual([[1, 3], [5, 7], [9, 10]])
    expect(sectionSpans(block, 4, 3, 10)).toEqual([[0, 1], [3, 5], [7, 9]])
    expect(sectionSpans(block, 4, -1, 10)).toEqual(sectionSpans(block, 4, 3, 10))
    expect(sectionSpans({ startMm: 0, endMm: 4 }, 4, 1.5, 10)).toEqual([[0, 10]])
  })

  it('clip across and mask along, and leave a whole-thread section alone', () => {
    expect(sectionClip(section({}), 4, 0, 10, 2, 'vertical')).toEqual({})
    const lane = sectionClip(section({ acrossStart: 0.5 }), 4, 0, 10, 2, 'vertical')
    expect(lane).toEqual({ clipPath: 'inset(0 0% 0 50%)' })
    const block = sectionClip(section({ endMm: 2, acrossEnd: 0.25 }), 4, 1, 10, 2, 'horizontal')
    expect(block.clipPath).toBe('inset(0% 0 75% 0)')
    expect(block.maskImage).toBe('linear-gradient(to right, transparent 0px, transparent 2px, #000 2px, #000 6px, transparent 6px, transparent 10px, #000 10px, #000 14px, transparent 14px, transparent 18px, #000 18px, #000 20px, transparent 20px, transparent 100%)')
  })

  it('scale sections with the repeat', () => {
    const note = withPreset('alternate')
    const scaled = setRepeat(note.pattern!, 6)
    expect(scaled.sections.map((s) => [s.startMm, s.endMm])).toEqual([[0, 3], [3, 6]])
  })
})

describe('presets', () => {
  it('Single lens is the plain pattern', () => {
    const note = withPreset('single')
    expect(note.pattern).toEqual(defaultPattern())
    expect(preparePattern(note).plain).toBe(true)
  })

  it('Split band: a side lane with the middle three frames, an up/down lane with all, mixed angles on', () => {
    const note = withPreset('split')
    const p = preparePattern(note)
    expect(note.pattern!.mixed).toBe(true)
    expect(p.sections.map((s) => s.angle)).toEqual([90, 0])
    expect(p.sections.map((s) => [s.section.acrossStart, s.section.acrossEnd])).toEqual([[0, 0.5], [0.5, 1]])
    expect(p.sections.map((s) => s.slots)).toEqual([[1, 1, 2, 3, 3], [0, 1, 2, 3, 4]])
    // Flat moved to frame 2: the story moves with it so both lanes still rest on the same frame
    const early = withPreset('split', { tilt: { ...banknote().tilt, flatAt: 3 } })
    expect(preparePattern(early).sections[0].slots).toEqual([0, 1, 2, 2, 2])
    expect(issues(early, 'rest')).toEqual([])
    // Three frames or fewer: every frame on both lanes
    expect(withPreset('split', { frames: frames(3) }).pattern!.sections[0].track).toBeUndefined()
  })

  it('Alternating: blocks at 0° and 90° with a repeat of half the shortest window', () => {
    const note = withPreset('alternate')
    expect(note.pattern!.repeatMm).toBe(4)
    expect(preparePattern(note).sections.map((s) => [s.section.startMm, s.section.endMm, s.angle])).toEqual([[0, 2, 0], [2, 4, 90]])
    const noWindows = withPreset('alternate', { thread: { ...banknote().thread, windows: { enabled: false, sections: [] } } })
    expect(noWindows.pattern!.repeatMm).toBe(4)
  })

  it('Chevron lock: arms at ±45° step together up and down and opposite ways side to side', () => {
    const note = withPreset('chevron')
    expect(preparePattern(note).sections.map((s) => s.angle)).toEqual([45, -45])
    const [a, b] = patternMix(note, { x: 0, y: 8 })
    expect(a.current).toBe(b.current)
    expect(a.current).not.toBe(2)
    const [c, d] = patternMix(note, { x: 8, y: 0 })
    expect(c.current - 2).toBe(-(d.current - 2))
    expect(issues(note, 'hidden')).toEqual([])
  })
})

describe('rules', () => {
  it('pass the presets on the demo banknote', () => {
    for (const kind of ['single', 'split', 'alternate', 'chevron'] as const) {
      expect(warningCount(checkPattern(withPreset(kind)))).toBe(0)
    }
  })

  it('1: warns when a window can miss a tilt wherever the print lands, and says whether it does now', () => {
    const note = withPreset('alternate')
    const long = { ...note, pattern: setRepeat(note.pattern!, 24) }
    const [, second] = windowReports(long)
    expect(second.label).toBe('Window 2')
    expect(second.misses.map((m) => m.label)).toEqual(['↕', '↔'])
    expect(second.misses[0].share).toBeCloseTo(1 - 17.8 / 24, 6)
    // Shifted so window 2 (24 to 32 mm) sits inside an up/down block: it misses side tilt now
    const now = windowReports(long, 22)[1].misses
    expect(now.find((m) => m.label === '↔')?.now).toBe(true)
    expect(now.find((m) => m.label === '↕')?.now).toBe(false)
    expect(issues(long, 'windows').map((i) => i.text)).toContain('Window 2 can miss ↕ · ↔')
    // Without windows the thread is one long window
    const continuous = { ...long, thread: { ...long.thread, windows: { enabled: false, sections: [] } } }
    expect(issues(continuous, 'windows')).toEqual([])
  })

  it('1: also asks for the frames only one section shows', () => {
    // One lens for both, but only the second block carries frames 1 and 5
    const note = banknote({ repeatMm: 24, mixed: false, sections: [
      section({ id: 'a', name: 'A', startMm: 0, endMm: 12, track: ['f1', 'f1', 'f2', 'f3', 'f3'] }),
      section({ id: 'b', name: 'B', startMm: 12, endMm: 24 }),
    ] })
    const misses = windowReports(note)[1].misses
    expect(misses.map((m) => m.label)).toEqual(['↕ frames 1, 5'])
    expect(misses[0].sectionId).toBe('b')
  })

  it('2: warns when a section rests on another frame', () => {
    const note = withPreset('split')
    const off = { ...note, pattern: setSectionTrack(note, note.pattern!.sections[0].id, [0, 0, 0, 0, 0]) }
    expect(issues(off, 'rest')).toEqual([{ text: 'Lane ↔ rests on 1, the others on 3', sectionId: note.pattern!.sections[0].id }])
  })

  it('3: warns when hidden frames sit under ridges off the axis, with the leak', () => {
    const note = withPreset('split')
    const [side, updown] = note.pattern!.sections
    // Up/down lane at 20° from horizontal: tan 20° = ↕ cycle ÷ ↔ cycle
    const tilted = { ...note, pattern: setSectionLens(note, updown.id, { effect: 'custom', yOn: true, cycleDeg: 25, cycleXDeg: 25 / Math.tan((20 * Math.PI) / 180) }) }
    expect(Math.round(Math.abs(lensAngle(preparePattern(tilted).sections[1].lens)))).toBe(20)
    expect(issues(tilted, 'hidden')).toEqual([{ text: 'Lane ↕ hides 1, 5 at 20° off ↕ · 34% leaks', title: 'Ridges 20° from horizontal', sectionId: updown.id }])
    const slight = { ...note, pattern: setSectionLens(note, updown.id, { effect: 'custom', yOn: true, cycleDeg: 25, cycleXDeg: 25 / Math.tan((8 * Math.PI) / 180) }) }
    expect(issues(slight, 'hidden')).toEqual([])
    expect(side.id).toBeDefined()
  })

  it('3: lets mirrored arms carry hidden frames together, not one alone', () => {
    const chevron = withPreset('chevron')
    const [a, b] = chevron.pattern!.sections
    const third = { ...section({ id: 'mid', name: 'Middle', startMm: 0, endMm: 4, acrossStart: 0.5, acrossEnd: 1, track: ['f1', 'f1', 'f2', 'f3', 'f3'] }), lens: b.lens }
    const paired = { ...chevron, pattern: { ...chevron.pattern!, sections: [{ ...a, acrossEnd: 0.25 }, { ...b, acrossStart: 0.25, acrossEnd: 0.5 }, third] } }
    expect(issues(paired, 'hidden')).toEqual([])
    const alone = { ...paired, pattern: setSectionTrack(paired, b.id, [1, 1, 2, 3, 3]) }
    expect(issues(alone, 'hidden').map((i) => i.sectionId)).toEqual([a.id])
  })

  it('4: shows a padded story', () => {
    const note = withPreset('split')
    expect(issues(note, 'strips')).toEqual([{ text: 'Lane ↔: 3 frames on 5 strips', title: '2 2 3 4 4', sectionId: note.pattern!.sections[0].id }])
  })

  it('5: warns about sections too small to print, dead zones excluded', () => {
    const note = withPreset('alternate')
    const [blockY, blockX] = note.pattern!.sections
    const thin = { ...note, pattern: { ...note.pattern!, sections: [{ ...blockY, endMm: 0.5 }, { ...blockX, startMm: 0.5 }] } }
    // It meets the side block at both ends, its own and across the repeat's
    expect(issues(thin, 'size')).toEqual([{ text: 'Block ↕: 0.3 mm along', sectionId: blockY.id }])
    const lanes = withPreset('split')
    const [side, updown] = lanes.pattern!.sections
    const narrow = { ...lanes, pattern: { ...lanes.pattern!, sections: [{ ...side, acrossEnd: 0.25 }, { ...updown, acrossStart: 0.25 }] } }
    expect(issues(narrow, 'size')).toEqual([{ text: 'Lane ↔: 0.9 mm across', sectionId: side.id }])
    // With mixed angles off there are no dead zones
    expect(issues({ ...narrow, pattern: { ...narrow.pattern, mixed: false } }, 'size')).toEqual([])
  })

  it('6: warns past three ridge angles', () => {
    const lens = (angle: number) => ({ effect: 'custom' as const, yOn: true, cycleDeg: 30, cycleXDeg: 30 / Math.tan((angle * Math.PI) / 180) })
    const lanes = [10, 30, 50, 70].map((angle, i) => section({ id: `l${i}`, name: `L${i}`, acrossStart: i / 4, acrossEnd: (i + 1) / 4, lens: lens(angle) }))
    expect(issues(banknote({ repeatMm: 4, mixed: true, sections: lanes }), 'angles').map((i) => i.text)).toEqual(['4 ridge angles'])
    expect(issues(banknote({ repeatMm: 4, mixed: true, sections: lanes.slice(0, 3) }), 'angles')).toEqual([])
  })

  it('flags gaps', () => {
    const note = withPreset('split')
    const gappy = { ...note, pattern: removeSection(note.pattern!, note.pattern!.sections[1].id) }
    expect(issues(gappy, 'gaps').map((i) => i.text)).toEqual(['50% of each repeat is empty'])
  })
})

describe('editing sections', () => {
  const lanes = () => withPreset('split').pattern!

  it('draws a new section, snapped, cut back clear of the others', () => {
    const pattern = { repeatMm: 4, mixed: false, sections: [section({ id: 'a', endMm: 2, acrossEnd: 0.5 })] }
    expect(drawRect(pattern, { along: 2.2, across: 0.1 }, { along: 3.9, across: 0.9 })).toEqual({ startMm: 2, endMm: 4, acrossStart: 1 / 12, acrossEnd: 11 / 12 })
    // Dragged back over the first section: cut along, keeping the side the drag started on
    const cut = drawRect(pattern, { along: 3.6, across: 0.2 }, { along: 1, across: 0.4 })
    expect(cut).toEqual({ startMm: 2, endMm: 3.5, acrossStart: 2 / 12, acrossEnd: 5 / 12 })
    expect(drawRect(pattern, { along: 3, across: 0.6 }, { along: 3.1, across: 0.62 })).toBeUndefined()
  })

  it('moves a section until it meets another', () => {
    const pattern = { repeatMm: 8, mixed: false, sections: [section({ id: 'a', endMm: 2, acrossEnd: 0.5 }), section({ id: 'b', startMm: 5, endMm: 8, acrossEnd: 1 })] }
    expect(moveRect(pattern, pattern.sections[0], { along: 2, across: 0.3 })).toEqual({ startMm: 2, endMm: 4, acrossStart: 4 / 12, acrossEnd: 10 / 12 })
    expect(moveRect(pattern, pattern.sections[0], { along: 6, across: 0 })).toEqual({ startMm: 3, endMm: 5, acrossStart: 0, acrossEnd: 0.5 })
  })

  it('moves a shared edge as one, never past a step from the far side', () => {
    const pattern = lanes()
    const [side, updown] = pattern.sections
    expect(seamOf(pattern, side.id, 'acrossEnd')).toEqual([{ id: side.id, edge: 'acrossEnd' }, { id: updown.id, edge: 'acrossStart' }])
    const moved = resizeEdge(pattern, side.id, 'acrossEnd', 0.74)
    expect(moved.sections.map((s) => [s.acrossStart, s.acrossEnd])).toEqual([[0, 0.75], [0.75, 1]])
    const far = resizeEdge(pattern, side.id, 'acrossEnd', 1)
    expect(far.sections[1].acrossStart).toBeCloseTo(1 - ACROSS_STEP, 6)
    // Typed values aren't snapped
    expect(resizeEdge(pattern, updown.id, 'acrossStart', 0.4, false).sections[0].acrossEnd).toBe(0.4)
  })

  it('never links edges at the ends of the repeat', () => {
    const pattern = withPreset('alternate').pattern!
    const [first] = pattern.sections
    expect(seamOf(pattern, first.id, 'startMm')).toEqual([{ id: first.id, edge: 'startMm' }])
    const shrunk = resizeEdge(pattern, first.id, 'startMm', 1)
    expect(shrunk.sections.map((s) => [s.startMm, s.endMm])).toEqual([[1, 2], [2, 4]])
  })

  it('splits, duplicates and removes, always keeping one section', () => {
    const pattern = withPreset('single').pattern!
    const split = splitSection(pattern, WHOLE_ID, 'across')!
    expect(split.pattern.sections.map((s) => [s.acrossStart, s.acrossEnd])).toEqual([[0, 0.5], [0.5, 1]])
    expect(split.pattern.sections[1]).toMatchObject({ id: split.id, name: 'Section 2' })
    const copy = duplicateSection(pattern, WHOLE_ID, 4)!
    // As long along as across (4 mm each way): the copy goes along
    expect(copy.pattern.sections.map((s) => [s.startMm, s.endMm, s.name])).toEqual([[0, 2, 'Whole thread'], [2, 4, 'Whole thread copy']])
    expect(removeSection(pattern, WHOLE_ID)).toBe(pattern)
    expect(removeSection(split.pattern, split.id).sections).toHaveLength(1)
    expect(splitSection({ ...pattern, sections: [section({ id: 't', endMm: 0.5 })] }, 't', 'along')).toBeUndefined()
  })

  it('finds the largest empty area on the snapping grid', () => {
    const covered = lanes()
    expect(freeRect(covered)).toBeUndefined()
    expect(freeRect(removeSection(covered, covered.sections[1].id))).toEqual({ startMm: 0, endMm: 4, acrossStart: 0.5, acrossEnd: 1 })
    // An L-shaped gap: the bigger of its two rectangles
    const corner = { repeatMm: 4, mixed: false, sections: [section({ id: 'a', endMm: 1, acrossEnd: 0.5 })] }
    expect(freeRect(corner)).toEqual({ startMm: 1, endMm: 4, acrossStart: 0, acrossEnd: 1 })
  })

  it('adds a plain section in the largest gap, or cut from the selected section when there is none', () => {
    const covered = lanes()
    const [side, updown] = covered.sections
    const filled = addBlankSection(removeSection(covered, updown.id), 4)!
    expect(filled.pattern.sections[1]).toEqual({ id: filled.id, name: 'Section 2', startMm: 0, endMm: 4, acrossStart: 0.5, acrossEnd: 1 })
    // No gap: the selected lane is cut along its longer side, and the new half plays the banknote's lens and every frame
    const cut = addBlankSection(covered, 4, side.id)!
    expect(cut.pattern.sections.map((s) => s.name)).toEqual(['Lane ↔', 'Section 3', 'Lane ↕'])
    expect(cut.pattern.sections[0]).toMatchObject({ lens: side.lens, track: side.track, startMm: 0, endMm: 2 })
    expect(cut.pattern.sections[1]).toEqual({ id: cut.id, name: 'Section 3', startMm: 2, endMm: 4, acrossStart: 0, acrossEnd: 0.5 })
    // Nothing selected: the largest section is cut
    expect(addBlankSection(covered, 4)!.pattern.sections).toHaveLength(3)
  })
})

describe('playback and the timeline', () => {
  it('sweep both tilts at the fastest section cycle when angles are mixed', () => {
    const note = withPreset('split')
    const lens = playbackLens(note)
    expect([lens.cycleY, lens.cycleX]).toEqual([25, 25])
    expect(playbackTilt(note).playTilt).toBe('both')
    const off = { ...note, pattern: { ...note.pattern!, mixed: false } }
    expect(playbackLens(off)).toEqual(lensState(off.tilt, off.frames))
    expect(playbackTilt(off)).toBe(off.tilt)
  })

  it('marks frames no section ever shows on a tilt', () => {
    expect(framesMissed(withPreset('split'))).toEqual([['x'], [], [], [], ['x']])
    expect(framesMissed(banknote())).toEqual([[], [], [], [], []])
  })
})
