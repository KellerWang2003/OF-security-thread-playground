import { create } from 'zustand'

/**
 * Space held down is Figma's hand: while it is down, a press anywhere on the canvas pans, whatever it lands on. A tap of
 * Space still plays or pauses, so that waits for it to come up, and happens only if no pan started meanwhile
 */
export const useSpaceHand = create<{ held: boolean; panned: boolean }>()(() => ({ held: false, panned: false }))

/** Space goes down: the hand is out */
export function pressSpace() {
  useSpaceHand.setState({ held: true, panned: false })
}

/** A pan starts: with the hand out, letting Space go is no longer a tap */
export function spacePanned() {
  if (useSpaceHand.getState().held) useSpaceHand.setState({ panned: true })
}

/** Space comes up: whether that was a tap, to play or pause. `tap: false` when the release was lost (window blur). */
export function releaseSpace(tap = true) {
  const { held, panned } = useSpaceHand.getState()
  if (held) useSpaceHand.setState({ held: false, panned: false })
  return tap && held && !panned
}
