import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { advancePlayback, playbackEase, playbackSettings, type PlaybackSettings } from '../lib/playback'
import { TILT_LIMIT, clamp } from '../lib/frames'

/** drag springs back on release, slider scrubs within one cycle, hold stays at a set angle */
export type TiltSource = 'drag' | 'wobble' | 'slider' | 'hold'

interface TiltState {
  source: TiltSource
  /** The smoothed angle everything renders from */
  angle: number
  /** Where the current source wants the angle to be */
  target: number
  springBack: boolean
  perspective: boolean
  sheen: boolean
}

// Preview state only: it is not part of a project and is not saved
export const useTilt = create<TiltState>()(() => ({
  source: 'drag',
  angle: 0,
  target: 0,
  springBack: true,
  perspective: true,
  sheen: true,
}))

export const setTilt = (patch: Partial<TiltState>) => useTilt.setState(patch)

/** Shared by the keyboard shortcut and the playback button. Pause holds the rendered angle. */
export function togglePlayback() {
  const { source, angle, target } = useTilt.getState()
  setTilt({ source: source === 'wobble' ? 'slider' : 'wobble', target: source === 'wobble' ? angle : target })
}

/**
 * Manual tilt uses a critically damped spring. Playback eases from flat to the full
 * cycle angle and back, reaching both endpoints without spring attenuation.
 */
export function useTiltLoop(cycleDeg: number, settings: PlaybackSettings = {}) {
  const { speed, curve, holdSeconds } = playbackSettings(settings)
  const currentSettings = useRef({ speed, curve, holdSeconds })
  useEffect(() => { currentSettings.current = { speed, curve, holdSeconds } }, [speed, curve, holdSeconds])
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let velocity = 0
    let position = { phase: 0, holdRemaining: 0 }
    let lastSource: TiltSource | undefined
    const stiffness = 140
    const damping = 2 * Math.sqrt(stiffness)

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      const s = useTilt.getState()
      let target = s.target
      if (s.source === 'wobble') {
        const { speed, curve, holdSeconds } = currentSettings.current
        position = lastSource === 'wobble'
          ? advancePlayback(position, dt, speed, holdSeconds)
          : { phase: 0, holdRemaining: 0 }
        const progress = position.phase <= 1 ? position.phase : 2 - position.phase
        target = Math.max(0, cycleDeg) * playbackEase(progress, curve)
        velocity = 0
        if (target !== s.angle || target !== s.target) useTilt.setState({ angle: target, target })
      } else {
        target = s.source === 'slider' ? clamp(target, 0, cycleDeg) : clamp(target, -TILT_LIMIT, TILT_LIMIT)
        velocity += ((target - s.angle) * stiffness - velocity * damping) * dt
        let angle = s.angle + velocity * dt
        if (Math.abs(target - angle) < 0.01 && Math.abs(velocity) < 0.01) {
          angle = target
          velocity = 0
        }
        if (angle !== s.angle) useTilt.setState({ angle })
      }
      lastSource = s.source
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cycleDeg])
}
