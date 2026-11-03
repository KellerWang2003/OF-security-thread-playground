import { clamp } from './frames'
import type { PlaybackCurve, TiltSettings } from './types'

export const PLAYBACK_CURVES: { value: PlaybackCurve; label: string }[] = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease in' },
  { value: 'ease-out', label: 'Ease out' },
]
export const SPEED_LIMITS = { min: 0.25, max: 4, step: 0.25 }
export const DEFAULT_PLAYBACK = { speed: 1, curve: 'smooth' as PlaybackCurve }
/**
 * Seconds one sweep takes at 1×, out or back. It was 1 until 3 November, when Keller slowed playback everywhere to
 * three quarters of that speed, 1× still reading 1×. Holds and recordings keep their own time
 */
export const SWEEP_SECONDS = 4 / 3
export type PlaybackSettings = Pick<TiltSettings, 'speed' | 'curve'>

export function playbackSettings(settings: PlaybackSettings = {}) {
  return {
    speed: Number.isFinite(settings.speed) ? clamp(settings.speed!, SPEED_LIMITS.min, SPEED_LIMITS.max) : 1,
    curve: PLAYBACK_CURVES.some((c) => c.value === settings.curve) ? settings.curve! : DEFAULT_PLAYBACK.curve,
  }
}

export function playbackEase(progress: number, curve: PlaybackCurve) {
  const t = clamp(progress, 0, 1)
  switch (curve) {
    case 'linear': return t
    case 'ease-in': return t * t
    case 'ease-out': return 1 - (1 - t) ** 2
    default: return (1 - Math.cos(Math.PI * t)) / 2
  }
}
