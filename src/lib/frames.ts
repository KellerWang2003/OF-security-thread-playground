export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Which frames show at a tilt angle. The range is split into equal slices, one per frame; `base` is drawn
 * fully and `next` on top of it at `blend` opacity, so a crossfade never dips through to the paper.
 */
export function frameMix(angle: number, rangeDeg: number, count: number, transition: number) {
  const u = clamp((angle + rangeDeg) / (2 * rangeDeg), 0, 1)
  // Continuous index measured from slice centres, so the boundary between frames i and i+1 sits at .5
  const f = u * count - 0.5
  const base = clamp(Math.floor(f), 0, count - 1)
  const next = Math.min(base + 1, count - 1)
  let blend = 0
  if (f >= 0 && f < count - 1) {
    const frac = f - Math.floor(f)
    blend = transition === 0 ? (frac >= 0.5 ? 1 : 0) : smoothstep(0.5 - transition / 2, 0.5 + transition / 2, frac)
  }
  return { base, next, blend, current: blend >= 0.5 ? next : base }
}

/** The angle range that shows frame `index` */
export function sliceRange(index: number, count: number, rangeDeg: number): [number, number] {
  const size = (2 * rangeDeg) / count
  return [-rangeDeg + index * size, -rangeDeg + (index + 1) * size]
}

export const formatDeg = (deg: number) => {
  const rounded = Math.round(deg)
  return `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${Math.abs(rounded)}°`
}
