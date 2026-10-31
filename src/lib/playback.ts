import { clamp } from './frames'
import type { PlaybackCurve, TiltSettings } from './types'

export const PLAYBACK_CURVES: { value: PlaybackCurve; label: string }[] = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease in' },
  { value: 'ease-out', label: 'Ease out' },
]
export const SPEED_LIMITS = { min: 0.25, max: 4, step: 0.25 }
export const HOLD_LIMITS = { min: 0, max: 3, step: 0.1 }
export const DEFAULT_PLAYBACK = { speed: 1, curve: 'smooth' as PlaybackCurve, holdSeconds: 0 }
export type PlaybackSettings = Pick<TiltSettings, 'speed' | 'curve' | 'holdSeconds'>

export function playbackSettings(settings: PlaybackSettings = {}) {
  return {
    speed: Number.isFinite(settings.speed) ? clamp(settings.speed!, SPEED_LIMITS.min, SPEED_LIMITS.max) : 1,
    curve: PLAYBACK_CURVES.some((c) => c.value === settings.curve) ? settings.curve! : DEFAULT_PLAYBACK.curve,
    holdSeconds: Number.isFinite(settings.holdSeconds) ? clamp(settings.holdSeconds!, HOLD_LIMITS.min, HOLD_LIMITS.max) : 0,
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

export interface PlaybackPosition { phase: number; holdRemaining: number }
/** Advance motion independently of easing so changing speed preserves the current position. */
export function advancePlayback(position: PlaybackPosition, seconds: number, speed: number, holdSeconds: number): PlaybackPosition {
  let { phase, holdRemaining } = position
  let remaining = seconds
  while (remaining > 1e-10) {
    const wait = Math.min(remaining, holdRemaining)
    holdRemaining -= wait
    remaining -= wait
    if (remaining <= 1e-10) break
    const boundary = phase < 1 ? 1 : 2
    const travelTime = (boundary - phase) / speed
    if (remaining + 1e-10 < travelTime) {
      phase += remaining * speed
      remaining = 0
    } else {
      remaining = Math.max(0, remaining - travelTime)
      phase = boundary === 2 ? 0 : 1
      holdRemaining = holdSeconds
    }
  }
  return { phase, holdRemaining }
}
