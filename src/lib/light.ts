import { clamp } from './frames'
import type { Tilt2 } from './lens'

/**
 * How clearly the watermark shows (Keller, 3 November). Flat in reflected light it is only a hint; tilting the banknote
 * either way brings it out with no light needed, clear from WATERMARK_TILT_DEG on; held to the light (the lamp, L, or a
 * Hold to light move) it shows clearly even flat. Nothing else changes: the design and the thread look the same in any
 * light. Both views and the export use these numbers.
 */

/** Share of the watermark's depth that shows flat in reflected light: only a hint */
export const WATERMARK_FAINT = 0.05
/** Share of its depth that tilting alone shows, from WATERMARK_TILT_DEG on: all of it, as clear as held to the light */
export const WATERMARK_TILTED = 1
/** Tilt, whichever way, from which tilting shows the watermark as much as it can */
export const WATERMARK_TILT_DEG = 30
/** Seconds the light switch takes to fade the light in or out */
export const LIGHT_RAMP_SECONDS = 0.25

const RAD = Math.PI / 180

/** How far the banknote faces away from the viewer, in degrees, for both tilts together */
export function offAxisDeg(tilt: Tilt2) {
  return Math.acos(clamp(Math.cos(tilt.y * RAD) * Math.cos(tilt.x * RAD), -1, 1)) / RAD
}

/** How far a tilt brings the watermark out, of as far as tilting can: 0 flat, easing up to 1 at WATERMARK_TILT_DEG and beyond */
export function tiltReveal(tilt: Tilt2) {
  const t = clamp(offAxisDeg(tilt) / WATERMARK_TILT_DEG, 0, 1)
  return t * t * (3 - 2 * t)
}

/** How far tilting alone reveals it, on the scale from flat in reflected light (0) to held to the light (1) */
const TILTED_REVEAL = (WATERMARK_TILTED - WATERMARK_FAINT) / (1 - WATERMARK_FAINT)

/**
 * How clearly the watermark shows, 0 (flat in reflected light) to 1 (held to the light): the light from behind or the
 * tilt, whichever shows it more; tilting alone only takes it to WATERMARK_TILTED of its depth
 */
export const watermarkReveal = (light: number, tilt: Tilt2) => Math.max(clamp(light, 0, 1), TILTED_REVEAL * tiltReveal(tilt))

/** The watermark layer's opacity at a reveal: WATERMARK_FAINT of its depth at 0, all of it at 1 */
export const watermarkOpacity = (depth: number, reveal: number) =>
  depth * (WATERMARK_FAINT + (1 - WATERMARK_FAINT) * clamp(reveal, 0, 1))
