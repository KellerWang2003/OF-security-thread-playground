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
  /** No longer read: Reveal always hides the fewest frames it can, the outer ones */
  revealHide?: number
  /** Partial reveal: degrees of fast tilt a viewer may drift by while sweeping the slow tilt (default 5) */
  revealWobble?: number
  /**
   * Where flat sits, in half-frame steps from the start of frame 1 (1 = middle of frame 1, 2 = between frames 1
   * and 2, …). Absent or 'center' = the middle of the middle frame; 'start' (older saves) = 0
   */
  flatAt?: 'start' | 'center' | number
  /** Partial reveal: how far the slow tilt reaches, as a step from the widest (0, fewest frames hidden) inwards */
  revealLevel?: number
  /** Which tilt playback sweeps: up/down, side to side, or one after the other. Superseded by `moves` */
  playTilt?: 'x' | 'y' | 'both'
  /** What playback does, in order; absent means what `playTilt` chose */
  moves?: PlaybackMove[]
  /** Movements recorded on the tilt pad, kept to add to playback again */
  recordings?: Recording[]
}

/** A moment of a recording: seconds from the start, the tilt then, and how far it was held to the light (0 to 1, absent = 0) */
export interface RecordedPoint {
  t: number
  x: number
  y: number
  light?: number
}

export interface Recording {
  id: string
  name: string
  points: RecordedPoint[]
}

/**
 * One step of playback. Preset moves go out from flat and back: up/down, side to side, both at once
 * (diagonal), or once round an ellipse (circle). `x`/`y` are the signed angles reached; absent means one full
 * cycle of that tilt. Hold to light (`light`) stays flat, fades the light behind the banknote in, holds and fades
 * it out. A gesture is a recording of the tilt pad.
 */
export interface PlaybackMove {
  id: string
  kind: 'y' | 'x' | 'diagonal' | 'circle' | 'light' | 'gesture'
  x?: number
  y?: number
  /** Up/down and side only: the signed angle the move starts and returns to (flat when absent), so it can swing −12° to +12° */
  from?: number
  /** Hold to light only: seconds held up to the light at 1× (default LIGHT_HOLD_SECONDS) */
  seconds?: number
  /** Gesture only: seconds from the start, the tilt then and the light (a copy of the recording's) */
  points?: RecordedPoint[]
  /** Gesture only: the recording it came from; deleting that recording removes the move */
  recordingId?: string
}

/**
 * A watermark made in the paper: an image that is faint flat and shows clearly tilted or held to the light. Light
 * parts of the image are thinner paper (brighter), dark parts thicker (darker); its background counts as plain paper.
 * Placed by its top-left corner in mm from the banknote's top-left; its height follows the image's proportions.
 */
export interface Watermark {
  /** Absent until an image is uploaded */
  imageId?: string
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
  /** How strongly the paper's thickness shows at its clearest (tilted or held to the light), 0 to 1 */
  depth: number
  /** How it mixes with the design under it; absent is Hard light */
  blend?: WatermarkBlend
  /** SVG only: one colour (#rrggbb) every shape takes before it is read as paper; absent keeps the SVG's own */
  fill?: string
}

/**
 * Hard light shows thinner and thicker paper; Soft light the same, gentler; Multiply only the thicker (darker) parts;
 * Screen only the thinner (lighter) parts
 */
export type WatermarkBlend = 'hard-light' | 'soft-light' | 'multiply' | 'screen'

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
  /** A sibling of the thread; absent until one is added */
  watermark?: Watermark
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  notes: Note[]
}
