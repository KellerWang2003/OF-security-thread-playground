import { BIRD_WORDS, STAR_FRAME, STAR_NAMES, drawDemoArt, type DemoArt } from './demoArt'
import { storeImageAs } from './images'
import { DEFAULT_TILT, createNote, createProject } from './notes'
import { defaultPattern } from './pattern'
import type { Frame, Note, PlaybackMove, Project, TiltSettings } from './types'

/**
 * The demo the project list's Demo button opens. It is built here, its artwork drawn in code (demoArt.ts), so it
 * ships with the app and changes only with it. Banknote 1 shows the watermark beside the flapping bird; Banknote 2,
 * Partial reveal: a spinning star whose two outer frames only the up/down tilt shows. Both have backs to turn over to,
 * Banknote 1's showing the watermark through it. Mixed angles stays out of it until it is known to be printable
 * (Keller). Its playlist plays both.
 */

/** The artwork's ids, fixed so opening the demo again reuses what it stored instead of adding more */
export const DEMO_ART = {
  faces: ['306d5138-8f56-4236-9aef-20144ed61c67', '01c3aa06-ab18-4dcf-a69d-3131dfd819ab'],
  backs: ['68449dde-ad8b-47fc-bf88-6a192280119d', 'dd109ac2-83a6-4b61-abd1-5f1828a3181e'],
  portrait: '0be755d9-bf5f-4c7d-92e2-0623a5a1a98e',
  birds: [
    '12b63eb3-8495-48be-b5b5-a58f132113a3',
    '91d377a4-4837-47e3-a8a1-aa4d35f4653d',
    '4bb077a9-e211-411b-9697-064bb184c82e',
    'f2ba82ca-ac1b-4f22-aa27-fd6fc015d587',
    'af7325fa-f077-4da1-82d6-a666479a4a0a',
  ],
  stars: [
    'fd5689c2-f0d6-4ea6-90c8-4ba36fbd95e1',
    'b67cc883-54eb-4626-9a97-c95ca4698f20',
    '60fb810f-1a9a-4274-b5c9-4e69252f653b',
    'bfec7744-3ba5-4b3f-baa4-04af012d8714',
    'c1659135-1428-43a1-9e2a-cc73dff1d64e',
  ],
} as const

const newId = () => crypto.randomUUID()

/** The demo, with fresh ids every time; its artwork is referred to by DEMO_ART's ids */
export function demoProject(): Project {
  // Playback for both: up/down, then side to side, each far enough for the watermark to come out fully at either end.
  // No light, which only matters flat
  const moves: PlaybackMove[] = [
    { id: newId(), kind: 'y', from: -30, y: 30 },
    { id: newId(), kind: 'x', from: -30, x: 30 },
  ]
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
    // On Fit: the bird is 6 mm long on a 4 mm thread, so they fly back to back
    pattern: { ...defaultPattern(6), fit: true },
    watermark: { imageId: DEMO_ART.portrait, xMm: 10, yMm: 18.5, widthMm: 30, heightMm: 37.5, depth: 0.8 },
    // Turned over, the bird shows the other way round in the back's own plain oval, on the right
    back: { background: 'image', color: first.color, imageId: DEMO_ART.backs[0] },
  }

  // Banknote 2: Partial reveal, as Keller set it out: up/down plays all five frames, side to side only the middle
  // three. The star spins through them, and the two outer frames add a small star between the big ones, so the
  // frames only up/down shows stand out. Each frame is one 16 mm repeat long, so the big stars fall 16 mm apart
  const second = createNote({ name: 'Star thread', x: 170, y: 0, widthMm: 75, heightMm: 150, color: '#9A8BC6' })
  const stars: Note = {
    ...second,
    background: 'image',
    faceImageId: DEMO_ART.faces[1],
    thread: { ...second.thread, widthMm: 6, direction: 'horizontal', positionMm: 40, backgroundColor: '#2B2766', windows: { enabled: false, sections: [] } },
    frames: DEMO_ART.stars.map((imageId, i): Frame => ({
      id: newId(), kind: 'image', color: '#ffffff', imageId, aspect: STAR_FRAME.height / STAR_FRAME.width, name: STAR_NAMES[i], length: 10,
    })),
    tilt: { ...tilt, effect: 'reveal', revealAxis: 'y' },
    // On Fit, as the stars' frames are 16 mm long on the 6 mm thread
    pattern: { ...defaultPattern(16), fit: true },
    back: { background: 'image', color: second.color, imageId: DEMO_ART.backs[1] },
  }

  return { ...createProject('Silly bird demo'), notes: [watermark, stars] }
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
    storeImageAs(DEMO_ART.backs[0], art.backs[0]),
    storeImageAs(DEMO_ART.backs[1], art.backs[1]),
    storeImageAs(DEMO_ART.portrait, art.portrait),
    ...DEMO_ART.birds.map((id, i) => storeImageAs(id, art.birds[i])),
    ...DEMO_ART.stars.map((id, i) => storeImageAs(id, art.stars[i])),
  ])
  return demoProject()
}
