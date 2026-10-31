import { describe, expect, it, vi } from 'vitest'
import { exportLayout, exportSize, perspectiveFor, playbackAngles, projectRow, sourceRow, tiltedBounds } from '../src/lib/exportRender'
import { createNote } from '../src/lib/notes'
import { imageTiles } from '../src/lib/thread'

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
    const together = exportSize(notes, { scale: 4, fps: 30, loops: 1, perspective: false, separate: false })
    const apart = exportSize(notes, { scale: 4, fps: 30, loops: 1, perspective: false, separate: true })
    expect(apart.width).toBeLessThan(together.width)
    expect(apart.seconds).toBeCloseTo(2)
  })
})

describe('image tiles', () => {
  it('repeats complete images with a gap to the end of the thread', () => {
    const { naturalPx, starts } = imageTiles(10, 100, 5, 2, 'vertical')
    expect(naturalPx).toBe(20)
    expect(starts).toEqual([0, 25, 50, 75])
  })

  it('keeps images upright on horizontal threads', () => {
    expect(imageTiles(10, 100, 0, 2, 'horizontal').naturalPx).toBe(5)
  })
})
