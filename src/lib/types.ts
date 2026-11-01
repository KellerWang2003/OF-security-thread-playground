export interface Frame {
  id: string
  kind: 'color' | 'image'
  color: string
  imageId?: string
  name: string
  /** This frame's length on the timeline, relative to the others; its share of the full cycle */
  length: number
}

export interface ThreadSettings {
  /** Optional colour behind the frame artwork; omitted for transparency */
  backgroundColor?: string
  widthMm: number
  /** Which way the thread runs across the note */
  direction: 'vertical' | 'horizontal'
  /** Thread centre: from the left edge for a vertical thread, from the top edge for a horizontal one */
  positionMm: number
  /** Space between complete image copies along the thread */
  imageGapMm: number
  windows: ThreadWindows
}

/** A visible section, measured along the thread from the banknote's top/left edge. */
export interface ThreadWindow {
  id: string
  startMm: number
  endMm: number
}

export interface ThreadWindows {
  enabled: boolean
  sections: ThreadWindow[]
}

export type PlaybackCurve = 'smooth' | 'linear' | 'ease-in' | 'ease-out'

export interface TiltSettings {
  /** Playback speed multiplier; 1 = one second in each direction */
  speed?: number
  curve?: PlaybackCurve
  /** Seconds spent at each end of the tilt motion */
  holdSeconds?: number
  /** Degrees of tilt for one full cycle of the frames; past it the frames loop */
  cycleDeg: number
  /** 0 = hard cut between frames, 1 = crossfade across the whole slice */
  transition: number
  /** What tilting does; absent on projects from before lenses, which are Up/down */
  effect?: 'updown' | 'side' | 'both' | 'reveal' | 'custom'
  /** Degrees of side tilt for one pass; null when side tilt does nothing (Custom) */
  cycleXDeg?: number | null
  /** Custom only: false when up/down tilt does nothing */
  yOn?: boolean
  /** Which way 1 → 5 plays on the up/down tilt; absent means up, as before lenses */
  runY?: 'up' | 'down'
  /** Which way 1 → 5 plays on the side tilt */
  runX?: 'right' | 'left'
  /** No longer edited or read (the viewing range is fixed at TILT_LIMIT); kept so older saves still type-check */
  viewDeg?: number
  /** Reveal only: the tilt that plays every frame */
  revealAxis?: 'x' | 'y'
  /** Which tilt playback sweeps: up/down, side to side, or one after the other. Superseded by `moves` */
  playTilt?: 'x' | 'y' | 'both'
  /** What playback does, in order; absent means what `playTilt` chose */
  moves?: PlaybackMove[]
}

/**
 * One step of playback. Preset moves go out from flat and back: up/down, side to side, both at once
 * (diagonal), or once round an ellipse (circle). `x`/`y` are the signed angles reached; absent means one full
 * cycle of that tilt. A gesture is a recording of the tilt pad.
 */
export interface PlaybackMove {
  id: string
  kind: 'y' | 'x' | 'diagonal' | 'circle' | 'gesture'
  x?: number
  y?: number
  /** Gesture only: seconds from the start, and the tilt then */
  points?: { t: number; x: number; y: number }[]
}

/** One banknote in a project, with its own size, thread and frames */
export interface Note {
  id: string
  name: string
  /** Top-left corner on the canvas, in mm */
  x: number
  y: number
  widthMm: number
  heightMm: number
  /** The note's background: a solid colour, or the uploaded design */
  background: 'solid' | 'image'
  color: string
  faceImageId?: string
  thread: ThreadSettings
  frames: Frame[]
  tilt: TiltSettings
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  notes: Note[]
}
