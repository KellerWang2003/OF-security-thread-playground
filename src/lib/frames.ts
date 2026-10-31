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

/** How far the note can be tilted either way, whatever the length of the cycle */
export const TILT_LIMIT = 60

/**
 * Which frames show at a tilt angle, with frames of any length. The cycle is centred on flat and loops:
 * tilting past either end starts the frames again. `base` is drawn fully and `next` on top of it at
 * `blend` opacity, so a crossfade never dips through to the paper. The crossfade straddles each
 * boundary, the loop's included, and is a fraction of the shorter of the two frames meeting there.
 */
export function frameMix(angle: number, spans: number[], transition: number) {
  const count = spans.length
  const total = cycleDeg(spans)
  if (count === 0 || total <= 0) return { base: 0, next: 0, blend: 0, current: 0 }
  const span = (i: number) => spans.at(i) ?? 0
  // Position within one cycle, from 0 at its start
  const a = (((angle + total / 2) % total) + total) % total
  let start = 0
  let i = 0
  while (i < count - 1 && a >= start + span(i)) {
    start += span(i)
    i++
  }
  const end = start + span(i)
  const nextI = (i + 1) % count
  const prevI = (i - 1 + count) % count
  if (count > 1 && transition > 0) {
    const toNext = (transition / 2) * Math.min(span(i), span(nextI))
    if (a > end - toNext) {
      const blend = smoothstep(end - toNext, end + toNext, a)
      return { base: i, next: nextI, blend, current: blend >= 0.5 ? nextI : i }
    }
    const fromPrev = (transition / 2) * Math.min(span(prevI), span(i))
    if (a < start + fromPrev) {
      const blend = smoothstep(start - fromPrev, start + fromPrev, a)
      return { base: prevI, next: i, blend, current: blend >= 0.5 ? i : prevI }
    }
  }
  return { base: i, next: i, blend: 0, current: i }
}

export const formatDeg = (deg: number) => {
  const rounded = Math.round(deg)
  return `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${Math.abs(rounded)}°`
}
