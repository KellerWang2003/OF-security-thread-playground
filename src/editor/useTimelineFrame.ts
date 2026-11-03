import { tiltForPosition } from '../lib/lens'
import { sectionMix, timelineSection } from '../lib/pattern'
import type { Note } from '../lib/types'
import { setTilt, useTilt } from '../tilt/tilt'

/**
 * The frame the timeline is on, for the section it follows (`sectionId`, else the first), and a way to go to another
 * frame without the timeline. The canvas's Thread tab and Thread Studio's Frames tab show it (`FramePanel`), and Thread
 * Studio handles its image on the thread
 */
export function useTimelineFrame(note: Note, sectionId?: string) {
  const followed = timelineSection(note, sectionId)
  const current = useTilt((s) => sectionMix(note, followed, { x: s.angleX, y: s.angle }).current)
  const frame = note.frames.at(current) ?? note.frames[0]
  /** Tilts to the middle of a frame, as a click on its clip does: the first strip of the followed section that shows it */
  const show = (i: number) => {
    const lengths = note.frames.map((f) => f.length)
    const strip = Math.max(0, followed.slots.indexOf(i))
    const before = lengths.slice(0, strip).reduce((sum, l) => sum + l, 0)
    const total = lengths.reduce((sum, l) => sum + l, 0)
    const at = tiltForPosition(followed.lens, (before + (lengths.at(strip) ?? 0) / 2) / total)
    setTilt({ source: 'timeline', target: at.y, targetX: at.x })
  }
  return { frame, index: note.frames.indexOf(frame), show }
}
