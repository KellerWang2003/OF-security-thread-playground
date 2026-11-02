import { clamp } from './frames'
import type { Tilt2 } from './lens'

/**
 * How clearly the watermark shows. Flat in reflected light it is faint; tilting the banknote either way brings it
 * out, clearest from WATERMARK_CLEAR_DEG on; held to the light (the lamp, L, or a Hold to light move) it shows
 * clearly at any tilt. Nothing else changes: the design and the thread look the same in any light. The watermark is
 * always drawn in the banknote's own colours, lighter where the paper is thinner and darker where it is thicker.
 * Both views and the export use these numbers.
 */

/** Share of the watermark's depth that shows flat in reflected light */
export const WATERMARK_FAINT = 0.3
/** Tilt, whichever way, from which the watermark is as clear as held to the light */
export const WATERMARK_CLEAR_DEG = 30
/** Seconds the light switch takes to fade the light in or out */
export const LIGHT_RAMP_SECONDS = 0.25

const RAD = Math.PI / 180

/** How far the banknote faces away from the viewer, in degrees, for both tilts together */
export function offAxisDeg(tilt: Tilt2) {
  return Math.acos(clamp(Math.cos(tilt.y * RAD) * Math.cos(tilt.x * RAD), -1, 1)) / RAD
}

/** How far a tilt brings the watermark out: 0 flat, easing up to 1 at WATERMARK_CLEAR_DEG and beyond */
export function tiltReveal(tilt: Tilt2) {
  const t = clamp(offAxisDeg(tilt) / WATERMARK_CLEAR_DEG, 0, 1)
  return t * t * (3 - 2 * t)
}

/** How clearly the watermark shows, 0 (faint) to 1 (clear): the light from behind or the tilt, whichever shows it more */
export const watermarkReveal = (light: number, tilt: Tilt2) => Math.max(clamp(light, 0, 1), tiltReveal(tilt))

/** The watermark layer's opacity at a reveal: a faint share of its depth at 0, all of it at 1 */
export const watermarkOpacity = (depth: number, reveal: number) =>
  depth * (WATERMARK_FAINT + (1 - WATERMARK_FAINT) * clamp(reveal, 0, 1))
