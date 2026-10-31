import { useEffect } from 'react'
import { create } from 'zustand'
import { clamp } from '../lib/frames'

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

/** Moves the angle towards the target with a critically damped spring, so every source feels physical */
export function useTiltLoop(rangeDeg: number) {
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let velocity = 0
    let phase = 0
    const stiffness = 140
    const damping = 2 * Math.sqrt(stiffness)

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      const s = useTilt.getState()
      let target = s.target
      if (s.source === 'wobble') {
        // Speed 1 is one full back-and-forth every two seconds
        phase += dt * s.wobbleSpeed * Math.PI
        target = rangeDeg * Math.sin(phase)
      }
      target = clamp(target, -rangeDeg, rangeDeg)
      velocity += ((target - s.angle) * stiffness - velocity * damping) * dt
      let angle = s.angle + velocity * dt
      if (Math.abs(target - angle) < 0.01 && Math.abs(velocity) < 0.01) {
        angle = target
        velocity = 0
      }
      if (angle !== s.angle) useTilt.setState({ angle })
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [rangeDeg])
}
