import { updateProject } from '../lib/store'
import type { PlaybackMove } from '../lib/types'

/** Playback is project-wide: every banknote gets the same moves */
export function saveMoves(projectId: string, moves: PlaybackMove[]) {
  updateProject(projectId, (p) => ({ ...p, notes: p.notes.map((n) => ({ ...n, tilt: { ...n.tilt, moves } })) }))
}
