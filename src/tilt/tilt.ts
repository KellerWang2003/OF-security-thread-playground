import { useEffect } from 'react'
import { create } from 'zustand'
import { TILT_LIMIT, clamp } from '../lib/frames'

export type TiltSource = 'drag' | 'wobble' | 'slider'

interface TiltState {
  source: TiltSource
  /** The smoothed angle everything renders from */
  angle: number
  /** Where the current source wants the angle to be */
  target: number
  wobbleSpeed: number
  springBack: boolean
  perspective: boolean
  sheen: boolean
}

// Preview state only: it is not part of a project and is not saved
export const useTilt = create<TiltState>()(() => ({
  source: 'drag',
  angle: 0,
  target: 0,
  wobbleSpeed: 1,
  springBack: true,
  perspective: true,
  sheen: true,
}))

export const setTilt = (patch: Partial<TiltState>) => useTilt.setState(patch)

/**
 * Manual tilt uses a critically damped spring. Playback eases from flat to the full
 * cycle angle and back, reaching both endpoints without spring attenuation.
 */
export function useTiltLoop(cycleDeg: number) {
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let velocity = 0
    let phase = 0
    let lastSource: TiltSource | undefined
    const stiffness = 140
    const damping = 2 * Math.sqrt(stiffness)

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      const s = useTilt.getState()
      let target = s.target
      if (s.source === 'wobble') {
        // Speed 1: flat → full upward tilt → flat in two seconds. Start each run flat.
        phase = lastSource === 'wobble' ? (phase + dt * s.wobbleSpeed * Math.PI) % (2 * Math.PI) : 0
        target = Math.max(0, cycleDeg) * (1 - Math.cos(phase)) / 2
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
