import { updateProject } from '../lib/store'
import type { PlaybackMove, TiltSettings } from '../lib/types'

/** Playback is project-wide: every banknote gets the same settings */
export function saveTilt(projectId: string, patch: Partial<TiltSettings>) {
  updateProject(projectId, (p) => ({ ...p, notes: p.notes.map((n) => ({ ...n, tilt: { ...n.tilt, ...patch } })) }))
}

export const saveMoves = (projectId: string, moves: PlaybackMove[]) => saveTilt(projectId, { moves })
