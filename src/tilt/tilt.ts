import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { TILT_LIMIT, clamp } from '../lib/frames'
import { tiltAt, type PlaybackPlan } from '../lib/moves'

/** drag springs back on release, slider scrubs within one cycle, hold stays at a set angle */
export type TiltSource = 'drag' | 'wobble' | 'slider' | 'hold'

interface TiltState {
  source: TiltSource
  /** The smoothed up/down angle everything renders from; positive tilts up */
  angle: number
  /** Where the current source wants the up/down angle to be */
  target: number
  /** The smoothed side angle; positive tilts right */
  angleX: number
  targetX: number
  /** Keeps manual tilt off one axis: the pad and canvas drag leave it where it is */
  lockX: boolean
  lockY: boolean
  springBack: boolean
  perspective: boolean
  sheen: boolean
}

// Preview state only: it is not part of a project and is not saved
export const useTilt = create<TiltState>()(() => ({
  source: 'drag',
  angle: 0,
  target: 0,
  angleX: 0,
  targetX: 0,
  lockX: false,
  lockY: false,
  springBack: true,
  perspective: true,
  sheen: true,
}))

export const setTilt = (patch: Partial<TiltState>) => useTilt.setState(patch)

/** Returns to flat, except on a locked axis, which stays where it was set */
export function springToFlat() {
  const { lockX, lockY, target, targetX } = useTilt.getState()
  setTilt({ target: lockY ? target : 0, targetX: lockX ? targetX : 0 })
}

/** Shared by the keyboard shortcut and the playback button. Pause holds the rendered angle. */
export function togglePlayback() {
  const { source, angle, target, angleX, targetX } = useTilt.getState()
  const pausing = source === 'wobble'
  setTilt({ source: pausing ? 'slider' : 'wobble', target: pausing ? angle : target, targetX: pausing ? angleX : targetX })
}

/**
 * Manual tilt uses a critically damped spring. Playback follows the project's moves exactly (no spring), from
 * the start each time it begins; a change to the plan while playing keeps the same share of the way through.
 */
export function useTiltLoop(plan: PlaybackPlan, limit = TILT_LIMIT) {
  const current = useRef({ plan, limit })
  useEffect(() => { current.current = { plan, limit } })
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let velocity = 0
    let velocityX = 0
    let share = 0
    let lastSource: TiltSource | undefined
    const stiffness = 140
    const damping = 2 * Math.sqrt(stiffness)

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      const s = useTilt.getState()
      const { plan, limit } = current.current
      if (s.source === 'wobble') {
        if (lastSource === 'wobble' && plan.seconds > 0) share = (share + dt / plan.seconds) % 1
        else share = 0
        const { x: targetX, y: target } = tiltAt(plan, share * plan.seconds)
        velocity = 0
        velocityX = 0
        if (target !== s.angle || targetX !== s.angleX || target !== s.target || targetX !== s.targetX) {
          useTilt.setState({ angle: target, target, angleX: targetX, targetX })
        }
      } else {
        const range = s.source === 'slider' ? Math.max(limit, Math.abs(s.target), Math.abs(s.targetX)) : limit
        const target = clamp(s.target, -range, range)
        const targetX = clamp(s.targetX, -range, range)
        velocity += ((target - s.angle) * stiffness - velocity * damping) * dt
        velocityX += ((targetX - s.angleX) * stiffness - velocityX * damping) * dt
        let angle = s.angle + velocity * dt
        let angleX = s.angleX + velocityX * dt
        if (Math.abs(target - angle) < 0.01 && Math.abs(velocity) < 0.01) {
          angle = target
          velocity = 0
        }
        if (Math.abs(targetX - angleX) < 0.01 && Math.abs(velocityX) < 0.01) {
          angleX = targetX
          velocityX = 0
        }
        if (angle !== s.angle || angleX !== s.angleX) useTilt.setState({ angle, angleX })
      }
      lastSource = s.source
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
}
