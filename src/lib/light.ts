import { clamp } from './frames'
import type { Tilt2 } from './lens'

/**
 * Light from behind: holding a banknote up to a lamp. The light switch (or a Hold to light move) sets how far the
 * banknote is held to the light, 0 to 1; how much of it comes through also depends on the tilt, because a small lamp
 * falls out of line behind the banknote as it turns away. Both views and the export use these numbers.
 */

/** Backlight is full while the banknote faces the light within this many degrees, whichever way it tilts */
export const LIGHT_FULL_DEG = 8
/** …and gone once it faces this far away, when the banknote is back in reflected light */
export const LIGHT_CONE_DEG = 40
/** Seconds the light switch takes to fade the light in or out */
export const LIGHT_RAMP_SECONDS = 0.25

/** How the banknote looks held to the light */
export const BACKLIT = {
  /** Plain paper with the lamp behind it: warm, with headroom for a watermark's brighter, thinner parts */
  paper: 'rgb(232, 214, 180)',
  /** How strongly the printed design blocks the light (multiplied over the lit paper) */
  ink: 0.75,
  /** Light spreads in the paper, so print seen through it is soft, in mm */
  inkBlurMm: 0.2,
  /** The thread inside the paper blocks the light: one dark stripe along its whole length */
  thread: 'rgba(30, 26, 22, 0.92)',
  /** How dark the canvas around the banknotes gets at full backlight, so the glow reads as light coming through */
  scrim: 0.6,
}

const RAD = Math.PI / 180

/** How far the banknote faces away from the viewer (and the lamp behind it), in degrees, for both tilts together */
export function offAxisDeg(tilt: Tilt2) {
  return Math.acos(clamp(Math.cos(tilt.y * RAD) * Math.cos(tilt.x * RAD), -1, 1)) / RAD
}

/** Share of the light behind the banknote that comes through at a tilt: 1 facing the light, 0 past LIGHT_CONE_DEG */
export function lightCone(tilt: Tilt2) {
  const t = clamp((offAxisDeg(tilt) - LIGHT_FULL_DEG) / (LIGHT_CONE_DEG - LIGHT_FULL_DEG), 0, 1)
  return 1 - t * t * (3 - 2 * t)
}

/** How backlit the banknote looks: how far it is held to the light (0 to 1) times what the tilt lets through */
export const backlightAt = (light: number, tilt: Tilt2) => (light > 0 ? clamp(light, 0, 1) * lightCone(tilt) : 0)
