import { describe, expect, it } from 'vitest'
import { snapBox } from '../src/lib/snap'

const other = { x: 0, y: 0, width: 100, height: 50 }

describe('banknote snapping', () => {
  it('snaps a left edge to another banknote’s right edge and draws a guide through both', () => {
    const r = snapBox({ x: 102, y: 80, width: 60, height: 40 }, [other], 3)
    expect(r.x).toBe(100)
    expect(r.y).toBe(80)
    expect(r.guides).toEqual([{ axis: 'x', at: 100, from: 0, to: 120 }])
  })

  it('snaps centres', () => {
    const r = snapBox({ x: 200, y: 6, width: 60, height: 40 }, [other], 2)
    expect(r.y).toBe(5) // centre 25 lines up with centre 25
    expect(r.guides.map((g) => [g.axis, g.at])).toEqual([['y', 25]])
  })

  it('picks the nearest stop and snaps both axes on their own', () => {
    const r = snapBox({ x: 1, y: 49, width: 100, height: 50 }, [other], 3)
    expect(r.x).toBe(0)
    expect(r.y).toBe(50)
    // Same width, so left, centre and right all line up
    expect(r.guides.filter((g) => g.axis === 'x')).toHaveLength(3)
  })

  it('leaves the box alone when nothing is within reach', () => {
    const r = snapBox({ x: 120, y: 80, width: 60, height: 40 }, [other], 3)
    expect(r).toEqual({ x: 120, y: 80, guides: [] })
  })
})
