import { storeImage } from './images'
import { createNote, createProject } from './notes'
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

/** A ready-made project with a five-frame flapping bird on a windowed thread */
export async function createDemoProject(): Promise<Project> {
  const frames: Frame[] = await Promise.all(
    WORDS.map(async (word, i) => ({
      id: crypto.randomUUID(),
      kind: 'image' as const,
      color: '#ffffff',
      imageId: await storeImage(await drawBird(i)),
      name: `${i + 1} ${word}`,
      length: 10,
    })),
  )
  const note = createNote({ name: 'Flappy 25', x: 0, y: 0, widthMm: 68, heightMm: 134, color: '#8A4F9E' })
  return {
    ...createProject('Silly bird demo'),
    notes: [
      {
        ...note,
        frames,
        // A 6 mm thread repeats the 2:3 bird every 9 mm, so 9 mm windows show one bird each
        thread: { ...note.thread, widthMm: 6, imageGapMm: 0, windows: { enabled: true, windowMm: 9, gapMm: 9, offsetMm: 0 } },
        tilt: { cycleDeg: 30, transition: 0.3 },
      },
    ],
  }
}
