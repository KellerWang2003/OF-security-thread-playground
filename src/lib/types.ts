/** vertical = tilting the note back and forth (horizontal lenses); horizontal = side to side (vertical lenses) */
export type TiltAxis = 'vertical' | 'horizontal'

/** stretch = one image runs the full thread length; repeat = a shorter tile repeats down the thread */
export type FrameFit = 'stretch' | 'repeat'

export interface Frame {
  id: string
  kind: 'color' | 'image'
  color: string
  imageId?: string
  name: string
}

export interface ThreadSettings {
  widthMm: number
  /** Thread centre, measured from the note's left edge */
  xMm: number
  fit: FrameFit
  tileMm: number
}

export interface TiltSettings {
  axis: TiltAxis
  /** The frames cycle once from -rangeDeg to +rangeDeg, a full cycle of 2 × rangeDeg */
  rangeDeg: number
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
