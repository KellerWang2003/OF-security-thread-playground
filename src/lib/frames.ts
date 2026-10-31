export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** The whole cycle in degrees, centred on flat: frames play from -total/2 to +total/2 */
export const cycleDeg = (spans: number[]) => spans.reduce((sum, s) => sum + s, 0)
export const tiltRange = (spans: number[]) => cycleDeg(spans) / 2

/** The angle range that shows frame `index` */
export function sliceRange(index: number, spans: number[]): [number, number] {
  const start = -tiltRange(spans) + spans.slice(0, index).reduce((sum, s) => sum + s, 0)
  return [start, start + (spans.at(index) ?? 0)]
}

/**
 * Which frames show at a tilt angle, with frames of any length. `base` is drawn fully and `next` on top of
 * it at `blend` opacity, so a crossfade never dips through to the paper. The crossfade straddles each
 * boundary and is a fraction of the shorter of the two frames meeting there.
 */
export function frameMix(angle: number, spans: number[], transition: number) {
  const count = spans.length
  let start = -tiltRange(spans)
  for (let i = 0; i < count; i++) {
    const end = start + (spans.at(i) ?? 0)
    const isLast = i === count - 1
    if (angle < end || isLast) {
      const nextSpan = spans.at(i + 1) ?? 0
      const prevSpan = spans.at(i - 1) ?? 0
      const half = transition / 2
      // Blending into the next frame near the end of this one
      if (!isLast && transition > 0 && angle > end - half * Math.min(spans.at(i) ?? 0, nextSpan)) {
        const w = half * Math.min(spans.at(i) ?? 0, nextSpan)
        const blend = smoothstep(end - w, end + w, angle)
        return { base: i, next: i + 1, blend, current: blend >= 0.5 ? i + 1 : i }
      }
      // Still finishing the blend from the previous frame near the start of this one
      if (i > 0 && transition > 0 && angle < start + half * Math.min(prevSpan, spans.at(i) ?? 0)) {
        const w = half * Math.min(prevSpan, spans.at(i) ?? 0)
        const blend = smoothstep(start - w, start + w, angle)
        return { base: i - 1, next: i, blend, current: blend >= 0.5 ? i : i - 1 }
      }
      return { base: i, next: i, blend: 0, current: i }
    }
    start = end
  }
  return { base: 0, next: 0, blend: 0, current: 0 }
}

export const formatDeg = (deg: number) => {
  const rounded = Math.round(deg)
  return `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${Math.abs(rounded)}°`
}
