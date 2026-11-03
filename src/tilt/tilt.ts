import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { TILT_LIMIT, clamp } from '../lib/frames'
import { LIGHT_RAMP_SECONDS } from '../lib/light'
import { lightAt, tiltAt, type PlaybackPlan } from '../lib/moves'

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
  /** Armed by Record movement: the next drag on the tilt pad becomes a playback move */
  recording: boolean
  perspective: boolean
  sheen: boolean
  /** Shows the visible frame's number on each banknote's thread, as a teaching and debugging aid */
  frameNumbers: boolean
  /** The lamp switch: every banknote held up to the light, until switched off */
  backlit: boolean
  /** Holding L: the switch's opposite for as long as the key is down */
  peek: boolean
  /**
   * How far the banknotes are held to the light, 0 to 1, as everything renders it: the switch, faded in and out
   * over LIGHT_RAMP_SECONDS, or what playback's moves say while playing (whichever is more)
   */
  light: number
  /**
   * Where each banknote's timeline was scrubbed to, by banknote id, as the tilt that would show it: that banknote's
   * frames show what it would while every banknote keeps the tilt, as scrubbing picks a frame and never tilts, and only
   * on that banknote (Keller: each banknote's timeline is its own, and it follows manual tilt, not the other way round).
   * Any change of tilt syncs every banknote back to it (`setTilt`)
   */
  frameTilts: Record<string, { x: number; y: number }>
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
  recording: false,
  frameNumbers: false,
  backlit: false,
  peek: false,
  light: 0,
  frameTilts: {},
}))

/** What moves the tilt; a change to any of these syncs every banknote's frames back to it */
const TILT_KEYS = ['source', 'target', 'targetX', 'angle', 'angleX'] as const
const IN_SYNC: TiltState['frameTilts'] = {}

export const setTilt = (patch: Partial<TiltState>) =>
  useTilt.setState(!('frameTilts' in patch) && TILT_KEYS.some((key) => key in patch) ? { ...patch, frameTilts: IN_SYNC } : patch)

/** The tilt a banknote's frames are shown at: where its timeline was scrubbed to, else the tilt itself */
export const framesTiltOf = (s: Pick<TiltState, 'angle' | 'angleX' | 'frameTilts'>, noteId: string) =>
  s.frameTilts[noteId] ?? { x: s.angleX, y: s.angle }

/**
 * Shows a banknote's frames as at `at` without tilting it or touching the others, as scrubbing its timeline, a click on
 * one of its clips or a frame number does (Keller); playing stops, the banknotes staying where they were
 */
export function scrubFrames(noteId: string, at: { x: number; y: number }) {
  const { source, angle, angleX, frameTilts } = useTilt.getState()
  setTilt({ ...(source === 'wobble' ? { source: 'slider' as const, target: angle, targetX: angleX } : {}), frameTilts: { ...frameTilts, [noteId]: at } })
}

/** Returns to flat, except on a locked axis, which stays where it was set */
export function springToFlat() {
  const { lockX, lockY, target, targetX } = useTilt.getState()
  setTilt({ target: lockY ? target : 0, targetX: lockX ? targetX : 0 })
}

/** Arms or cancels recording; arming pauses playback where it is so the next drag starts from there */
export function setRecording(on: boolean) {
  const { angle, angleX } = useTilt.getState()
  setTilt(on ? { recording: true, source: 'hold', target: angle, targetX: angleX } : { recording: false })
}

/** Where the switch wants the light: on while it is on, the opposite while L is held */
export const lightTarget = (s: Pick<TiltState, 'backlit' | 'peek'>) => (s.backlit !== s.peek ? 1 : 0)

/** A press of L shorter than this flips the switch; held longer, it only peeks */
export const LIGHT_TAP_MS = 250
let pressedAt: number | undefined

/** L goes down: peek at the other light straight away */
export function pressLight(now = performance.now()) {
  if (pressedAt !== undefined) return
  pressedAt = now
  setTilt({ peek: true })
}

/** L comes up: a tap flips the switch, a hold just ends the peek. `tap: false` when the release was lost (window blur). */
export function releaseLight(now = performance.now(), tap = true) {
  if (pressedAt === undefined) return
  const flip = tap && now - pressedAt < LIGHT_TAP_MS
  pressedAt = undefined
  const { backlit } = useTilt.getState()
  setTilt({ peek: false, backlit: flip ? !backlit : backlit })
}

/** Shared by the keyboard shortcut and the playback button. Pause holds the rendered angle. */
export function togglePlayback() {
  const { source, angle, target, angleX, targetX } = useTilt.getState()
  const pausing = source === 'wobble'
  setTilt({ source: pausing ? 'slider' : 'wobble', target: pausing ? angle : target, targetX: pausing ? angleX : targetX })
}

/** `value` moved towards `target` by at most `step` */
const approach = (value: number, target: number, step: number) => (value < target ? Math.min(target, value + step) : Math.max(target, value - step))

/**
 * Manual tilt uses a critically damped spring. Playback follows the project's moves exactly (no spring), from
 * the start each time it begins; a change to the plan while playing keeps the same share of the way through.
 * The light fades towards the switch at a steady rate; while playing it is also at least what the moves say, and
 * on pausing it fades from there back to the switch.
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
    // The switch's light, faded; while playing, the moves can only add to it
    let ramp = useTilt.getState().light
    let lastSource: TiltSource | undefined
    const stiffness = 140
    const damping = 2 * Math.sqrt(stiffness)

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      const s = useTilt.getState()
      const { plan, limit } = current.current
      const fade = dt / LIGHT_RAMP_SECONDS
      if (s.source === 'wobble') {
        if (lastSource === 'wobble' && plan.seconds > 0) share = (share + dt / plan.seconds) % 1
        else share = 0
        const { x: targetX, y: target } = tiltAt(plan, share * plan.seconds)
        ramp = approach(ramp, lightTarget(s), fade)
        const light = Math.max(ramp, lightAt(plan, share * plan.seconds))
        velocity = 0
        velocityX = 0
        if (target !== s.angle || targetX !== s.angleX || target !== s.target || targetX !== s.targetX || light !== s.light) {
          useTilt.setState({ angle: target, target, angleX: targetX, targetX, light })
        }
      } else {
        const light = approach(s.light, lightTarget(s), fade)
        ramp = light
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
        if (angle !== s.angle || angleX !== s.angleX || light !== s.light) useTilt.setState({ angle, angleX, light })
      }
      lastSource = s.source
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
}
