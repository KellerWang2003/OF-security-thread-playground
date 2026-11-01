/** A rectangle on the canvas, in mm */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A guide line to draw while snapped: vertical lines sit at a fixed x, horizontal ones at a fixed y */
export interface Guide {
  axis: 'x' | 'y'
  /** Where the line sits on its axis, in mm */
  at: number
  /** Where it starts and ends along the other axis, in mm */
  from: number
  to: number
}

/** Left/top edge, centre, right/bottom edge of a box on one axis */
const stops = (start: number, size: number) => [start, start + size / 2, start + size]

/**
 * Snaps a box being dragged to the edges and centres of the others, Figma-style. Each axis snaps on
 * its own to the nearest match within `thresholdMm`; an axis with no match keeps its own position.
 * Returns the snapped position and the guides to draw through every box that lines up.
 */
export function snapBox(moving: Box, others: Box[], thresholdMm: number): { x: number; y: number; guides: Guide[] } {
  const snapAxis = (axis: 'x' | 'y') => {
    const pos = axis === 'x' ? moving.x : moving.y
    const size = axis === 'x' ? moving.width : moving.height
    let best: number | undefined
    for (const o of others) {
      for (const target of stops(axis === 'x' ? o.x : o.y, axis === 'x' ? o.width : o.height)) {
        for (const own of stops(pos, size)) {
          const delta = target - own
          if (Math.abs(delta) <= thresholdMm && (best === undefined || Math.abs(delta) < Math.abs(best))) best = delta
        }
      }
    }
    return best
  }

  const dx = snapAxis('x')
  const dy = snapAxis('y')
  const x = moving.x + (dx ?? 0)
  const y = moving.y + (dy ?? 0)
  const placed = { ...moving, x, y }

  // Guides run through every box that shares a stop with the snapped box, spanning all of them
  const guides: Guide[] = []
  const eps = 1e-6
  const addGuides = (axis: 'x' | 'y') => {
    const across = axis === 'x' ? 'y' : 'x'
    const sizeOf = (b: Box) => (axis === 'x' ? b.width : b.height)
    const acrossSize = (b: Box) => (axis === 'x' ? b.height : b.width)
    for (const at of stops(placed[axis], sizeOf(placed))) {
      const matches = others.filter((o) => stops(o[axis], sizeOf(o)).some((s) => Math.abs(s - at) < eps))
      if (!matches.length) continue
      const all = [placed, ...matches]
      guides.push({
        axis,
        at,
        from: Math.min(...all.map((b) => b[across])),
        to: Math.max(...all.map((b) => b[across] + acrossSize(b))),
      })
    }
  }
  if (dx !== undefined) addGuides('x')
  if (dy !== undefined) addGuides('y')
  return { x, y, guides }
}
