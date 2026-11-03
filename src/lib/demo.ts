import { BIRD_WORDS, drawDemoArt, type DemoArt } from './demoArt'
import { storeImageAs } from './images'
import { DEFAULT_TILT, createNote, createProject } from './notes'
import { defaultPattern } from './pattern'
import type { Frame, Note, PlaybackMove, Project, TiltSettings } from './types'

/**
 * The demo the project list's Demo button opens. It is built here, its artwork drawn in code (demoArt.ts), so it
 * ships with the app and changes only with it. Banknote 1 shows the watermark beside the flapping bird; Banknote 2
 * what Thread Studio does: images placed in the repeat, and colour and background fills. Mixed angles stays out of
 * it until it is known to be printable (Keller). Its playlist plays both.
 */

/** The artwork's ids, fixed so opening the demo again reuses what it stored instead of adding more */
export const DEMO_ART = {
  faces: ['306d5138-8f56-4236-9aef-20144ed61c67', '01c3aa06-ab18-4dcf-a69d-3131dfd819ab'],
  portrait: '0be755d9-bf5f-4c7d-92e2-0623a5a1a98e',
  star: '9c629dd6-1e6a-4cf6-8bb4-c8ee37dec1c5',
  birdHead: 'be5524a0-371e-40b1-bda4-eadd226125c4',
  birds: [
    '12b63eb3-8495-48be-b5b5-a58f132113a3',
    '91d377a4-4837-47e3-a8a1-aa4d35f4653d',
    '4bb077a9-e211-411b-9697-064bb184c82e',
    'f2ba82ca-ac1b-4f22-aa27-fd6fc015d587',
    'af7325fa-f077-4da1-82d6-a666479a4a0a',
  ],
} as const

const newId = () => crypto.randomUUID()

/** The demo, with fresh ids every time; its artwork is referred to by DEMO_ART's ids */
export function demoProject(): Project {
  // Playback for both: up and down far enough for the watermark to come out fully at either end; no light, which
  // only matters flat
  const moves: PlaybackMove[] = [{ id: newId(), kind: 'y', from: -30, y: 30 }]
  const tilt: TiltSettings = { ...DEFAULT_TILT, transition: 0.3, moves }
  const windowAt = (startMm: number, endMm: number) => ({ id: newId(), startMm, endMm })

  // Banknote 1: a bird portrait in the paper, only a hint flat and clear tilted or held to the light, beside the bird
  // Named for what to look at, in words that don't repeat a layer's or Thread Studio's own
  const first = createNote({ name: 'Bird watermark', x: 0, y: 0, widthMm: 150, heightMm: 75, color: '#86AD96' })
  const watermark: Note = {
    ...first,
    background: 'image',
    faceImageId: DEMO_ART.faces[0],
    thread: { ...first.thread, widthMm: 4, positionMm: 100, windows: { enabled: true, sections: [windowAt(6, 19), windowAt(26, 35), windowAt(44, 67)] } },
    frames: BIRD_WORDS.map((word, i): Frame => ({ id: newId(), kind: 'image', color: '#ffffff', imageId: DEMO_ART.birds[i], aspect: 1.5, name: `${i + 1} ${word}`, length: 10 })),
    tilt,
    // The bird is 6 mm long on a 4 mm thread, so they fly back to back
    pattern: defaultPattern(6),
    watermark: { imageId: DEMO_ART.portrait, xMm: 10, yMm: 18.5, widthMm: 30, heightMm: 37.5, depth: 0.8 },
  }

  // Banknote 2: a frame of each fill, and the star and the bird's head placed apart in the 16 mm repeat
  const second = createNote({ name: 'Star thread', x: 170, y: 0, widthMm: 75, heightMm: 150, color: '#9A8BC6' })
  const studio: Note = {
    ...second,
    background: 'image',
    faceImageId: DEMO_ART.faces[1],
    thread: { ...second.thread, widthMm: 6, direction: 'horizontal', positionMm: 40, backgroundColor: '#2B2766', windows: { enabled: false, sections: [] } },
    frames: [
      { id: newId(), kind: 'color', color: '#F26B5B', name: 'Coral', length: 10 },
      { id: newId(), kind: 'image', color: '#ffffff', imageId: DEMO_ART.star, aspect: 1, place: { alongMm: 2.5, across: 0.1, size: 0.8 }, name: 'Star', length: 10 },
      { id: newId(), kind: 'none', color: '#2B2766', name: 'Night', length: 10 },
      { id: newId(), kind: 'image', color: '#ffffff', imageId: DEMO_ART.birdHead, aspect: 1, place: { alongMm: 9, across: 0.08, size: 0.84 }, name: 'Bird', length: 10 },
    ],
    tilt,
    pattern: defaultPattern(16),
  }

  return { ...createProject('Silly bird demo'), notes: [watermark, studio] }
}

let drawn: Promise<DemoArt> | undefined

/** Stores the demo's artwork in the open workspace, drawing it once a session, and returns a fresh demo */
export async function createDemoProject(): Promise<Project> {
  drawn ??= drawDemoArt().catch((error: unknown) => {
    drawn = undefined
    throw error
  })
  const art = await drawn
  await Promise.all([
    storeImageAs(DEMO_ART.faces[0], art.faces[0]),
    storeImageAs(DEMO_ART.faces[1], art.faces[1]),
    storeImageAs(DEMO_ART.portrait, art.portrait),
    storeImageAs(DEMO_ART.star, art.star),
    storeImageAs(DEMO_ART.birdHead, art.birdHead),
    ...DEMO_ART.birds.map((id, i) => storeImageAs(id, art.birds[i])),
  ])
  return demoProject()
}
