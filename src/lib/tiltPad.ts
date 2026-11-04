import { create } from 'zustand'

/**
 * Whether the tilt pad's card shows the pad itself, or folds it away to the ↕ and ↔ angles, as it does by default
 * (Keller found the pad intimidating). A way of looking, not part of a project: remembered per browser. Recording a move
 * opens it, since a move is recorded by dragging on it.
 */
const KEY = 'of-playground.tilt-pad'

function load() {
  try {
    return localStorage.getItem(KEY) === 'open'
  } catch { /* storage blocked: folded */ }
  return false
}

export const useTiltPad = create<{ open: boolean }>(() => ({ open: load() }))

export function setTiltPadOpen(open: boolean) {
  useTiltPad.setState({ open })
  try {
    localStorage.setItem(KEY, open ? 'open' : 'folded')
  } catch { /* storage blocked: it lasts until reload */ }
}
