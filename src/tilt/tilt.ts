import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { advancePlayback, playbackEase, playbackSettings, type PlaybackSettings } from '../lib/playback'
import { TILT_LIMIT, clamp } from '../lib/frames'
import { FLAT, sweepTarget, type Axis, type LensState } from '../lib/lens'

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
  springBack: true,
  perspective: true,
  sheen: true,
}))

export const setTilt = (patch: Partial<TiltState>) => useTilt.setState(patch)

/** Shared by the keyboard shortcut and the playback button. Pause holds the rendered angle. */
export function togglePlayback() {
  const { source, angle, target, angleX, targetX } = useTilt.getState()
  const pausing = source === 'wobble'
  setTilt({ source: pausing ? 'slider' : 'wobble', target: pausing ? angle : target, targetX: pausing ? angleX : targetX })
}

/**
 * Manual tilt uses a critically damped spring. Playback eases from flat to the full cycle angle and back on
 * each axis in `axes`, one sweep after another, reaching both endpoints without spring attenuation.
 */
export function useTiltLoop(lens: LensState, axes: Axis[], settings: PlaybackSettings = {}, limit = TILT_LIMIT) {
  const { speed, curve, holdSeconds } = playbackSettings(settings)
  const current = useRef({ speed, curve, holdSeconds, lens, axes, limit })
  useEffect(() => { current.current = { speed, curve, holdSeconds, lens, axes, limit } })
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let velocity = 0
    let velocityX = 0
    let position = { phase: 0, holdRemaining: 0 }
    let sweep = 0
    let lastSource: TiltSource | undefined
    const stiffness = 140
    const damping = 2 * Math.sqrt(stiffness)

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      const s = useTilt.getState()
      const { speed, curve, holdSeconds, lens, axes, limit } = current.current
      if (s.source === 'wobble') {
        if (lastSource === 'wobble') {
          const before = position.phase
          position = advancePlayback(position, dt, speed, holdSeconds)
          // A finished sweep (back to flat) hands over to the next axis
          if (position.phase < before) sweep++
        } else {
          position = { phase: 0, holdRemaining: 0 }
          sweep = 0
        }
        const progress = position.phase <= 1 ? position.phase : 2 - position.phase
        const end = axes.length ? sweepTarget(lens, axes[sweep % axes.length]) : FLAT
        const k = playbackEase(progress, curve)
        const target = end.y * k
        const targetX = end.x * k
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
