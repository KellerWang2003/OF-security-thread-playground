import { storeImage } from './images'
import { DEFAULT_TILT, createNote, createProject } from './notes'
import type { Frame, Project } from './types'

const SKIES = ['#FFD166', '#F4A261', '#EF6F8C', '#B07BE0', '#6FB7FF']
const WINGS = [-60, -30, 0, 30, 55]
const WORDS = ['wee', 'flap', 'FLAP', 'flap', 'wee!']

/** One frame of a little bird flapping across a shifting sky, drawn on a canvas */
async function drawBird(i: number): Promise<Blob> {
  const W = 120
  const H = 180
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Canvas is not available')

  g.fillStyle = SKIES[i]
  g.fillRect(0, 0, W, H)
  g.fillStyle = 'rgba(255,255,255,0.7)'
  for (let s = 0; s < 6; s++) {
    g.beginPath()
    g.arc((s * 37 + i * 13) % W, (s * 53 + 20) % H, 2, 0, Math.PI * 2)
    g.fill()
  }

  const cx = 60
  const cy = 95 - Math.sin((i / 4) * Math.PI) * 12
  g.strokeStyle = '#2b2d42'
  g.lineWidth = 3
  const wing = (side: 1 | -1) => {
    g.save()
    g.translate(cx + side * 6, cy - 4)
    g.rotate((side * WINGS[i] * Math.PI) / 180)
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.ellipse(side * 26, 0, 28, 10, 0, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    g.restore()
  }

  wing(-1)
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.ellipse(cx, cy + 6, 20, 24, 0, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  wing(1)
  g.beginPath()
  g.arc(cx, cy - 22, 14, 0, Math.PI * 2)
  g.fill()
  g.stroke()

  g.fillStyle = '#FF9F1C'
  g.beginPath()
  g.moveTo(cx - 4, cy - 20)
  g.lineTo(cx + 4, cy - 20)
  g.lineTo(cx, cy - 10 + (i % 2) * 4)
  g.closePath()
  g.fill()
  g.stroke()

  const look = [-3, -1, 0, 1, 3][i]
  g.fillStyle = '#2b2d42'
  g.beginPath()
  g.arc(cx - 5 + look, cy - 25, 2.6, 0, Math.PI * 2)
  g.arc(cx + 5 + look, cy - 25, 2.6, 0, Math.PI * 2)
  g.fill()

  g.font = 'bold 16px sans-serif'
  g.textAlign = 'center'
  g.fillText(WORDS[i], cx, H - 14)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw'))), 'image/png'))
}

/**
 * The demo used when the shared template can't be loaded. It matches the published template
 * (supabase/demo/demo-template.json): Demo 1 is a landscape note with the bird on a windowed vertical
 * thread, Demo 2 a portrait note with three colour frames on a continuous horizontal thread.
 */
export async function createDemoProject(): Promise<Project> {
  const tilt = { ...DEFAULT_TILT, cycleDeg: 25, transition: 0.3 }
  const birdFrames: Frame[] = await Promise.all(
    WORDS.map(async (word, i) => ({
      id: crypto.randomUUID(),
      kind: 'image' as const,
      color: '#ffffff',
      imageId: await storeImage(await drawBird(i)),
      name: `${i + 1} ${word}`,
      length: 10,
    })),
  )
  const demo1 = createNote({ name: 'Demo 1', x: 0, y: 0, widthMm: 134, heightMm: 68, color: '#DBECC6' })
  const demo2 = createNote({ name: 'Demo 2', x: 154, y: 0, widthMm: 68, heightMm: 134, color: '#CDBBE6' })
  const window = (startMm: number, endMm: number) => ({ id: crypto.randomUUID(), startMm, endMm })
  const colorFrames: Frame[] = [
    ['Coral', '#F26B5B'],
    ['Sun', '#F7C948'],
    ['Teal', '#1F9E89'],
  ].map(([name, color]) => ({ id: crypto.randomUUID(), kind: 'color' as const, color, name, length: 10 }))

  return {
    ...createProject('Silly bird demo'),
    notes: [
      {
        ...demo1,
        frames: birdFrames,
        // Three windows of different lengths on a thread right of centre
        thread: {
          ...demo1.thread,
          widthMm: 4,
          positionMm: 101,
          windows: { enabled: true, sections: [window(5, 17), window(24, 32), window(40, 62)] },
        },
        tilt,
      },
      {
        ...demo2,
        frames: colorFrames,
        thread: { ...demo2.thread, widthMm: 5, direction: 'horizontal', positionMm: 34, windows: { enabled: false, sections: [] } },
        tilt,
      },
    ],
  }
}
