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
  widthMm: number
  /** Which way the thread runs across the note */
  direction: 'vertical' | 'horizontal'
  /** Thread centre: from the left edge for a vertical thread, from the top edge for a horizontal one */
  positionMm: number
  /**
   * Length of the section of each frame image that repeats down the thread. Images are scaled to the
   * thread's width at their own aspect ratio and cropped to this length, the same for every frame.
   */
  tileMm: number
  windows: ThreadWindows
}

/** A windowed thread is woven into the paper: it shows in windows separated by covered bridges */
export interface ThreadWindows {
  enabled: boolean
  windowMm: number
  gapMm: number
  /** Shifts the windows along the thread, from the note's top edge */
  offsetMm: number
}

export interface TiltSettings {
  /** Degrees of tilt for one full cycle of the frames; past it the frames loop */
  cycleDeg: number
  /** 0 = hard cut between frames, 1 = crossfade across the whole slice */
  transition: number
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
