import type { LensEffect, LensState } from './lens'
import { DEFAULT_TILT } from './notes'
import type { TiltSettings } from './types'

/** A preset's Cycle above this would leave frames out of reach of a 90° tilt */
export const PRESET_CYCLE_MAX = 180

const round = (v: number) => Math.round(v)

/**
 * What changes when the lens effect switches. Flat, the band, the wobble and the 1 → 5 directions are the
 * project's and stay as they are; only the cycles change.
 * - Custom starts from exactly what the current effect gives, both cycles.
 * - Every preset (Horizontal, Vertical, Diagonal 45°, Partial reveal on one tilt) plays one Cycle on its fast
 *   tilt. It carries over the fastest cycle playing now, so a slow cycle from Partial reveal or Custom never
 *   comes along; past 180° a 90° tilt would miss frames, so it starts again from the default instead.
 */
export function switchEffect(tilt: TiltSettings, lens: LensState, effect: LensEffect): Partial<TiltSettings> {
  if (effect === 'custom') {
    return { effect, cycleDeg: round(lens.cycleY ?? tilt.cycleDeg), yOn: lens.cycleY != null, cycleXDeg: lens.cycleX == null ? null : round(lens.cycleX) }
  }
  const playing = [lens.cycleY, lens.cycleX].filter((c): c is number => c != null)
  const fastest = playing.length ? Math.min(...playing) : tilt.cycleDeg
  return { effect, cycleDeg: round(fastest > PRESET_CYCLE_MAX ? DEFAULT_TILT.cycleDeg : fastest) }
}
