import { describe, expect, it, vi } from 'vitest'
import { exportLayout, exportSize, perspectiveFor, playbackAngles, projectRow, sourceRow, tiltedBounds } from '../src/lib/exportRender'
import { createNote } from '../src/lib/notes'
import { copyStarts, imageBox } from '../src/lib/artwork'

vi.mock('../src/lib/images', () => ({ loadImageUrl: async () => undefined }))

const makeNote = (widthMm = 68, heightMm = 120) => createNote({ name: 'Test', x: 0, y: 0, widthMm, heightMm, color: '#ffffff' })

describe('playback angles', () => {
  it('goes from flat up through the cycle and back, like live playback', () => {
    const tilt = { cycleDeg: 30, transition: 0, speed: 1, curve: 'linear' as const, holdSeconds: 0 }
    const angles = playbackAngles(tilt, 30)
    expect(angles).toHaveLength(60)
    expect(angles[0]).toBe(0)
    expect(angles[15]).toBeCloseTo(15)
    expect(angles[30]).toBeCloseTo(30)
    expect(angles[45]).toBeCloseTo(15)
  })

  it('adds holds and loops', () => {
    const tilt = { cycleDeg: 20, transition: 0, speed: 2, curve: 'smooth' as const, holdSeconds: 0.5 }
    // 0.5 s up, 0.5 s hold, 0.5 s down, 0.5 s hold
    const angles = playbackAngles(tilt, 10, 2)
    expect(angles).toHaveLength(40)
    expect(angles[5]).toBeCloseTo(20)
    expect(angles[8]).toBeCloseTo(20)
    expect(angles[20]).toBe(0)
  })
})

describe('tilt projection', () => {
  it('matches CSS rotateX under perspective: the far top edge narrows, the near bottom edge widens', () => {
    const top = projectRow(-60, 30, 500)
    const bottom = projectRow(60, 30, 500)
    expect(top.scale).toBeLessThan(1)
    expect(bottom.scale).toBeGreaterThan(1)
    // y' = y·cos a, scaled by p / (p − y·sin a)
    expect(bottom.y).toBeCloseTo(60 * Math.cos(Math.PI / 6) * (500 / (500 - 30)))
  })

  it('finds the source row for each screen row', () => {
    for (const y of [-50, -10, 0, 25, 60]) {
      const screen = projectRow(y, -40, 420).y
      expect(sourceRow(screen, -40, 420)).toBeCloseTo(y)
    }
  })

  it('keeps flat notes their own size', () => {
    expect(tiltedBounds(100, 200, 0, 400)).toEqual({ top: -100, bottom: 100, halfWidth: 50 })
  })
})

describe('layout', () => {
  it('places banknotes side by side with room for the tilt, at even pixel sizes', () => {
    const notes = [makeNote(), makeNote(80, 140)]
    const angles = [0, 30]
    const layout = exportLayout(notes, 5, angles, true)
    expect(layout.width % 2).toBe(0)
    expect(layout.height % 2).toBe(0)
    expect(layout.cells[1].cx).toBeGreaterThan(layout.cells[0].cx + 68 * 5 / 2)
    const near = tiltedBounds(80 * 5, 140 * 5, 30, perspectiveFor(notes[1], 5))
    expect(layout.width).toBeGreaterThanOrEqual(Math.ceil(layout.cells[1].cx + near.halfWidth))
  })

  it('sizes separate files by the largest banknote', () => {
    const notes = [makeNote(), makeNote(80, 140)]
    const together = exportSize(notes, { height: 720, fps: 30, loops: 1, perspective: false, separate: false })
    const apart = exportSize(notes, { height: 720, fps: 30, loops: 1, perspective: false, separate: true })
    expect(together.height).toBe(720)
    expect(apart.height).toBe(720)
    expect(apart.width).toBeLessThan(together.width)
    expect(apart.seconds).toBeCloseTo(2)
  })

  it('hits the chosen resolution with tilt, and keeps wide rows within 4K', () => {
    const notes = [makeNote()]
    expect(exportSize(notes, { height: 1080, fps: 30, loops: 1, perspective: true, separate: false }).height).toBe(1080)
    const row = Array.from({ length: 8 }, () => makeNote(150, 70))
    const wide = exportSize(row, { height: 2160, fps: 30, loops: 1, perspective: false, separate: false })
    expect(wide.width).toBeLessThanOrEqual(3840)
  })
})

describe('an image in the repeat', () => {
  it('fits the repeat and the thread by default, centred, and its copies fall one repeat apart', () => {
    // Twice as tall as wide on a 10 mm vertical thread: 20 mm long, centred in a 25 mm repeat
    const box = imageBox(undefined, 2, 25, 10, 'vertical')
    expect(box).toEqual({ along: 2.5, across: 0, alongSize: 20, acrossSize: 10 })
    expect(copyStarts(box, 25, 0, 90)).toEqual([2.5, 27.5, 52.5, 77.5])
    // A repeat shorter than the image shrinks it to fit, centred across
    expect(imageBox(undefined, 2, 10, 10, 'vertical')).toEqual({ along: 0, across: 2.5, alongSize: 10, acrossSize: 5 })
  })

  it('keeps images upright on horizontal threads', () => {
    expect(imageBox(undefined, 2, 25, 10, 'horizontal').alongSize).toBe(5)
  })

  it('carries a copy that runs past the repeat on into the next, and follows the repeat’s start', () => {
    const box = imageBox({ alongMm: 20, across: 0.25, size: 0.5 }, 2, 25, 10, 'vertical')
    expect(box).toEqual({ along: 20, across: 2.5, alongSize: 10, acrossSize: 5 })
    // The copy from before the stretch shows its last 5 mm at the start
    expect(copyStarts(box, 25, 0, 90)).toEqual([-5, 20, 45, 70])
    expect(copyStarts(box, 25, 3, 90)).toEqual([-2, 23, 48, 73])
  })
})
