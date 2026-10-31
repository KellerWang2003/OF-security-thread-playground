export type NotePresetId = '0.2' | '25' | '10000' | 'custom'

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

export interface NoteSettings {
  preset: NotePresetId
  widthMm: number
  heightMm: number
  color: string
  faceImageId?: string
}

export interface ThreadSettings {
  widthMm: number
  /** Thread centre, measured from the note's left edge */
  xMm: number
  /** White band either side of the thread */
  surroundMm: number
  fit: FrameFit
  tileMm: number
}

export interface TiltSettings {
  axis: TiltAxis
  /** The tilt range runs from -rangeDeg to +rangeDeg */
  rangeDeg: number
  /** 0 = hard cut between frames, 1 = crossfade across the whole slice */
  transition: number
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  note: NoteSettings
  thread: ThreadSettings
  frames: Frame[]
  tilt: TiltSettings
}
