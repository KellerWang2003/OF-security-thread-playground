/**
 * The demo's artwork, drawn in code so it ships with the app and comes out the same every time: two printed faces in
 * the manner of a banknote (fine-line waves, a braided border, rosettes, numerals and microtext) and their backs, the
 * bird portrait its watermark is read from, the flapping bird the first thread plays, and the spinning star the second
 * plays. Everything is original, and nothing is random.
 */

/** Pixels per millimetre the faces are drawn at */
const FACE_PX = 12

interface Palette {
  /** The paper, from one end of the banknote to the other */
  paper: [string, string]
  /** The unprinted paper a watermark sits in, as r, g, b: almost white, with the paper's tint (Keller) */
  plain: string
  /** Fine lines a little darker and lighter than the paper */
  dark: string
  light: string
  /** Numerals: their fill and outline */
  ink: string
  edge: string
}

const GREENS: Palette = { paper: ['#8DB49C', '#729B84'], plain: '226, 239, 229', dark: 'rgba(28, 76, 56, 0.5)', light: 'rgba(232, 246, 237, 0.45)', ink: '#E6F3EA', edge: '#2A5A46' }
const VIOLETS: Palette = { paper: ['#A698D0', '#8676B9'], plain: '236, 232, 248', dark: 'rgba(50, 36, 102, 0.5)', light: 'rgba(242, 238, 252, 0.45)', ink: '#F1EDFB', edge: '#43347C' }

const MICROTEXT = 'SILLY BIRD DEMO · '

export function sheet(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Canvas is not available')
  return { canvas, g }
}

export const toBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the demo'))), type, quality))

/** Strokes the line `at` traces as t runs from 0 to 1, in `steps` straight pieces */
function trace(g: CanvasRenderingContext2D, at: (t: number) => [number, number], steps: number, close = false) {
  g.beginPath()
  for (let i = 0; i <= steps; i++) {
    const [x, y] = at(i / steps)
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  if (close) g.closePath()
  g.stroke()
}

/** Rows of fine waves over the whole face, two families a little out of step, so they shimmer as guilloche does */
function waves(g: CanvasRenderingContext2D, width: number, height: number, p: Palette) {
  g.lineWidth = 0.09
  for (const [color, shift] of [[p.light, 0], [p.dark, 0.45]] as const) {
    g.strokeStyle = color
    for (let y0 = 1 + shift; y0 < height; y0 += 0.9) {
      trace(g, (t) => {
        const x = t * width
        return [x, y0 + 0.55 * Math.sin((2 * Math.PI * x) / 9 + y0 * 0.37) + 0.3 * Math.sin((2 * Math.PI * x) / 23 - y0 * 0.21)]
      }, Math.ceil(width * 2))
    }
  }
}

/** Clears a soft-edged oval out of a layer: the plain paper a watermark sits in */
function clearOval(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  g.save()
  g.translate(cx, cy)
  g.scale(rx, ry)
  const fade = g.createRadialGradient(0, 0, 0, 0, 0, 1)
  fade.addColorStop(0, 'rgba(0, 0, 0, 1)')
  fade.addColorStop(0.8, 'rgba(0, 0, 0, 1)')
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)')
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = fade
  g.fillRect(-1, -1, 2, 2)
  g.restore()
}

/** A point on a rounded rectangle's outline, `u` mm clockwise from the top edge's start, and the way inwards */
function aroundFrame(x0: number, y0: number, x1: number, y1: number, r: number) {
  const across = x1 - x0 - 2 * r
  const down = y1 - y0 - 2 * r
  const arc = (Math.PI * r) / 2
  const length = 2 * (across + down) + 4 * arc
  const corner = (cx: number, cy: number, a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), nx: -Math.cos(a), ny: -Math.sin(a) })
  const at = (u: number) => {
    // The top edge, its right corner, the right edge, and so on round
    let d = ((u % length) + length) % length
    if (d < across) return { x: x0 + r + d, y: y0, nx: 0, ny: 1 }
    d -= across
    if (d < arc) return corner(x1 - r, y0 + r, -Math.PI / 2 + d / r)
    d -= arc
    if (d < down) return { x: x1, y: y0 + r + d, nx: -1, ny: 0 }
    d -= down
    if (d < arc) return corner(x1 - r, y1 - r, d / r)
    d -= arc
    if (d < across) return { x: x1 - r - d, y: y1, nx: 0, ny: -1 }
    d -= across
    if (d < arc) return corner(x0 + r, y1 - r, Math.PI / 2 + d / r)
    d -= arc
    if (d < down) return { x: x0, y: y1 - r - d, nx: 1, ny: 0 }
    d -= down
    return corner(x0 + r, y0 + r, Math.PI + d / r)
  }
  return { length, at }
}

/** A braided border: strands weaving in and out across a band just inside the banknote's edge, ruled on both sides */
function border(g: CanvasRenderingContext2D, width: number, height: number, p: Palette) {
  const inset = 2.5
  const band = 3.2
  const frame = aroundFrame(inset, inset, width - inset, height - inset, 3)
  const turns = Math.round(frame.length / 2.6)
  const strands = 8
  g.lineWidth = 0.1
  for (let k = 0; k < strands; k++) {
    g.strokeStyle = k % 2 ? p.light : p.dark
    trace(g, (t) => {
      const { x, y, nx, ny } = frame.at(t * frame.length)
      const depth = (band / 2) * (1 + 0.92 * Math.sin(2 * Math.PI * turns * t + (2 * Math.PI * k) / strands))
      return [x + nx * depth, y + ny * depth]
    }, turns * 24, true)
  }
  g.strokeStyle = p.dark
  g.lineWidth = 0.14
  for (const depth of [0, band]) {
    trace(g, (t) => {
      const { x, y, nx, ny } = frame.at(t * frame.length)
      return [x + nx * depth, y + ny * depth]
    }, 2400, true)
  }
}

/**
 * A guilloche rosette `size` mm across its outer ring: rings of waves, each woven from a few strands turned a
 * fraction of a wave apart, so they cross in a lattice
 */
function rosette(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, p: Palette) {
  const rings = [
    { r: 0.97, wave: 0.025, n: 60, strands: 2 },
    { r: 0.76, wave: 0.17, n: 16, strands: 8 },
    { r: 0.46, wave: 0.12, n: 10, strands: 6 },
    { r: 0.2, wave: 0.06, n: 6, strands: 4 },
  ]
  g.lineWidth = 0.09
  for (const { r, wave, n, strands } of rings) {
    for (let k = 0; k < strands; k++) {
      g.strokeStyle = k % 2 ? p.light : p.dark
      const turn = (2 * Math.PI * k) / (strands * n)
      trace(g, (t) => {
        const a = 2 * Math.PI * t
        const radius = size * (r + wave * Math.cos(n * (a + turn)))
        return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)]
      }, 1440, true)
    }
  }
}

/** Lays the unprinted paper a watermark sits in over an oval, its edge fading into the print round it */
function plainOval(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, p: Palette) {
  g.save()
  g.translate(cx, cy)
  g.scale(rx, ry)
  const fill = g.createRadialGradient(0, 0, 0, 0, 0, 1)
  fill.addColorStop(0, `rgba(${p.plain}, 1)`)
  fill.addColorStop(0.84, `rgba(${p.plain}, 1)`)
  fill.addColorStop(1, `rgba(${p.plain}, 0)`)
  g.fillStyle = fill
  g.beginPath()
  g.arc(0, 0, 1, 0, Math.PI * 2)
  g.fill()
  g.restore()
}

/** A fine scalloped ring round the plain paper a watermark sits in */
function ovalRing(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, p: Palette) {
  g.lineWidth = 0.08
  for (const [scale, color] of [[1, p.light], [1.04, p.dark]] as const) {
    g.strokeStyle = color
    trace(g, (t) => {
      const a = 2 * Math.PI * t
      const k = scale * (1 + 0.012 * Math.cos(72 * a))
      return [cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]
    }, 1440, true)
  }
}

/** Text in mm, drawn in pixels so small sizes stay crisp */
function lettering(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, edge?: string) {
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.font = `700 ${size * FACE_PX}px Georgia, 'Times New Roman', serif`
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  if (edge) {
    g.lineJoin = 'round'
    g.lineWidth = size * FACE_PX * 0.06
    g.strokeStyle = edge
    g.strokeText(text, x * FACE_PX, y * FACE_PX)
  }
  g.fillStyle = fill
  g.fillText(text, x * FACE_PX, y * FACE_PX)
  g.restore()
}

/** A line of microtext from x0 to x1 mm, the words repeated to fill it */
function microtext(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, color: string) {
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.font = `600 ${1.1 * FACE_PX}px Arial, Helvetica, sans-serif`
  g.textBaseline = 'alphabetic'
  g.fillStyle = color
  const step = g.measureText(MICROTEXT).width
  for (let x = x0 * FACE_PX; x + step <= x1 * FACE_PX; x += step) g.fillText(MICROTEXT, x, y * FACE_PX)
  g.restore()
}

/** A banknote-sized sheet in mm, its paper laid in a gradient from one end to the other */
function paper(width: number, height: number, p: Palette, vertical: boolean) {
  const { canvas, g } = sheet(width * FACE_PX, height * FACE_PX)
  g.scale(FACE_PX, FACE_PX)
  const fill = vertical ? g.createLinearGradient(0, 0, 0, height) : g.createLinearGradient(0, 0, width, 0)
  fill.addColorStop(0, p.paper[0])
  fill.addColorStop(1, p.paper[1])
  g.fillStyle = fill
  g.fillRect(0, 0, width, height)
  return { canvas, g }
}

/**
 * Banknote 1's face, 150 × 75 mm: almost white unprinted paper in an oval on the left for the watermark, a rosette,
 * the thread's place at 100 mm
 */
async function drawWatermarkFace() {
  const width = 150
  const height = 75
  const p = GREENS
  const { canvas, g } = paper(width, height, p, false)
  const layer = sheet(canvas.width, canvas.height)
  layer.g.scale(FACE_PX, FACE_PX)
  waves(layer.g, width, height, p)
  clearOval(layer.g, 25, 37.5, 18.5, 28)
  g.drawImage(layer.canvas, 0, 0, width, height)
  plainOval(g, 25, 37.5, 18.5, 28, p)
  ovalRing(g, 25, 37.5, 18.5, 28, p)
  rosette(g, 70, 37.5, 17, p)
  rosette(g, 124, 25, 10, p)
  border(g, width, height, p)
  microtext(g, 8, 96, 8.1, p.dark)
  microtext(g, 104, 143, 8.1, p.dark)
  lettering(g, '10', 124, 63, 20, p.ink, p.edge)
  lettering(g, '10', 15, 69, 5, p.ink, p.edge)
  return toBlob(canvas, 'image/jpeg', 0.92)
}

/** Banknote 2's face, 75 × 150 mm, its thread across at 40 mm: a small rosette and numeral above it, a large pair below */
async function drawStudioFace() {
  const width = 75
  const height = 150
  const p = VIOLETS
  const { canvas, g } = paper(width, height, p, true)
  waves(g, width, height, p)
  rosette(g, 20, 22, 10, p)
  rosette(g, 37.5, 92, 25, p)
  border(g, width, height, p)
  microtext(g, 8, 68, 54, p.dark)
  microtext(g, 8, 68, 125, p.dark)
  lettering(g, '20', 55, 30, 13, p.ink, p.edge)
  lettering(g, '20', 37.5, 141, 17, p.ink, p.edge)
  return toBlob(canvas, 'image/jpeg', 0.92)
}

/**
 * Banknote 1's back, 150 × 75 mm, as it shows turned over: its plain oval on the right, where the watermark shows
 * through the other way round, a large rosette on the left and the numeral between them
 */
async function drawWatermarkBack() {
  const width = 150
  const height = 75
  const p = GREENS
  const { canvas, g } = paper(width, height, p, false)
  const layer = sheet(canvas.width, canvas.height)
  layer.g.scale(FACE_PX, FACE_PX)
  waves(layer.g, width, height, p)
  clearOval(layer.g, 125, 37.5, 18.5, 28)
  g.drawImage(layer.canvas, 0, 0, width, height)
  plainOval(g, 125, 37.5, 18.5, 28, p)
  ovalRing(g, 125, 37.5, 18.5, 28, p)
  rosette(g, 32, 37.5, 20, p)
  rosette(g, 79, 22, 7, p)
  border(g, width, height, p)
  microtext(g, 8, 143, 8.1, p.dark)
  lettering(g, '10', 79, 54, 20, p.ink, p.edge)
  lettering(g, '10', 135, 69, 5, p.ink, p.edge)
  return toBlob(canvas, 'image/jpeg', 0.92)
}

/** Banknote 2's back, 75 × 150 mm: a large rosette above, the numeral below, as no thread crosses it there */
async function drawStudioBack() {
  const width = 75
  const height = 150
  const p = VIOLETS
  const { canvas, g } = paper(width, height, p, true)
  waves(g, width, height, p)
  rosette(g, 37.5, 50, 24, p)
  rosette(g, 57, 128, 8, p)
  border(g, width, height, p)
  microtext(g, 8, 68, 85, p.dark)
  microtext(g, 8, 68, 141, p.dark)
  lettering(g, '20', 30, 116, 22, p.ink, p.edge)
  return toBlob(canvas, 'image/jpeg', 0.92)
}

/**
 * The watermark's bird, as a photo of a watermark held to the light shows one: brightest where the paper is thinnest,
 * on black, so the black reads as plain paper. It fades out towards the bottom, as portrait watermarks do. A new
 * watermark starts with it too (standIns.ts).
 */
export async function drawPortrait() {
  const W = 800
  const H = 1000
  const { canvas, g } = sheet(W, H)
  g.fillStyle = '#000000'
  g.fillRect(0, 0, W, H)
  const glow = (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, stops: [number, number][]) => {
    const gradient = g.createRadialGradient(x0, y0, r0, x1, y1, r1)
    for (const [at, alpha] of stops) gradient.addColorStop(at, `rgba(255, 255, 255, ${alpha})`)
    return gradient
  }
  const oval = (x: number, y: number, rx: number, ry: number, rotation = 0) => {
    g.beginPath()
    g.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2)
  }

  // Body
  g.fillStyle = glow(350, 620, 0, 400, 760, 330, [[0, 0.62], [0.6, 0.4], [1, 0]])
  oval(400, 770, 265, 305)
  g.fill()
  // Chest feathers: rows of scallops, their rims a little brighter
  g.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  g.lineWidth = 6
  for (let row = 0; row < 5; row++) {
    for (let x = 250 + (row % 2) * 32; x <= 590; x += 64) {
      g.beginPath()
      g.arc(x, 585 + row * 52, 30, 0.1 * Math.PI, 0.9 * Math.PI)
      g.stroke()
    }
  }
  // The folded wing, with its long feathers
  g.save()
  g.translate(285, 705)
  g.rotate(-0.38)
  g.fillStyle = glow(-30, -120, 0, 0, 0, 250, [[0, 0.5], [0.75, 0.28], [1, 0]])
  oval(0, 0, 135, 245)
  g.fill()
  g.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  g.lineWidth = 7
  for (let i = 0; i < 5; i++) {
    oval(0, -130 + i * 62, 112 - i * 10, 46, 0)
    g.stroke()
  }
  g.restore()
  // Crest
  for (const [x, y, turn] of [[372, 205, -0.55], [430, 182, -0.12], [492, 200, 0.32]]) {
    g.save()
    g.translate(x, y)
    g.rotate(turn)
    g.fillStyle = glow(0, -20, 0, 0, 0, 70, [[0, 0.8], [1, 0.15]])
    oval(0, -10, 26, 66)
    g.fill()
    g.restore()
  }
  // Head
  g.fillStyle = glow(380, 290, 10, 430, 360, 192, [[0, 0.95], [0.65, 0.66], [0.9, 0.42], [1, 0]])
  oval(430, 360, 188, 188)
  g.fill()
  // Beak, a little less bright than the head, split along its middle
  const beak = g.createLinearGradient(590, 0, 705, 0)
  beak.addColorStop(0, 'rgba(255, 255, 255, 0.72)')
  beak.addColorStop(1, 'rgba(255, 255, 255, 0.4)')
  g.fillStyle = beak
  g.beginPath()
  g.moveTo(585, 322)
  g.quadraticCurveTo(660, 340, 708, 374)
  g.quadraticCurveTo(655, 400, 588, 420)
  g.closePath()
  g.fill()
  g.strokeStyle = '#000000'
  g.lineWidth = 5
  g.beginPath()
  g.moveTo(598, 374)
  g.lineTo(690, 374)
  g.stroke()
  // Eye: plain paper, with a glint
  g.fillStyle = '#000000'
  oval(502, 334, 31, 31)
  g.fill()
  g.fillStyle = 'rgba(255, 255, 255, 0.92)'
  oval(512, 323, 9, 9)
  g.fill()
  // Fade out at the bottom
  const fade = g.createLinearGradient(0, 760, 0, H)
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)')
  fade.addColorStop(1, 'rgba(0, 0, 0, 1)')
  g.fillStyle = fade
  g.fillRect(0, 760, W, H - 760)
  return toBlob(canvas)
}

/** Traces a five-pointed star `turn` radians from upright */
export function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, turn: number) {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + turn + (i * Math.PI) / 5
    const r = i % 2 ? inner : outer
    if (i === 0) g.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
    else g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  g.closePath()
}

/** A gold star with its facets, from the middle to every point and corner */
function goldStar(g: CanvasRenderingContext2D, cx: number, cy: number, outer: number, turn: number, light = false) {
  const inner = outer * 0.41
  starPath(g, cx, cy, outer, inner, turn)
  const fill = g.createRadialGradient(cx - outer * 0.2, cy - outer * 0.35, outer * 0.05, cx, cy, outer)
  fill.addColorStop(0, light ? '#FFFDF0' : '#FFF1B8')
  fill.addColorStop(0.45, light ? '#FFF0A8' : '#F7C948')
  fill.addColorStop(1, light ? '#F2C94C' : '#D98B1C')
  g.fillStyle = fill
  g.fill()
  g.lineJoin = 'round'
  g.lineWidth = outer * 0.055
  g.strokeStyle = '#7A4A06'
  g.stroke()
  g.lineWidth = outer * 0.018
  g.strokeStyle = 'rgba(122, 74, 6, 0.45)'
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + turn + (i * Math.PI) / 5
    const r = i % 2 ? inner : outer
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
    g.stroke()
  }
}

/**
 * How far the star thread's big star is turned in each frame, degrees: a fifth of a turn in all, which brings its
 * points round to where they started, so the frames loop on without a jump
 */
const STAR_TURNS = [-28.8, -14.4, 0, 14.4, 28.8]
/** The outer frames, the two Partial reveal hides from the side tilt, add a small star between the big ones */
const SPARKLE_FRAMES = new Set([0, STAR_TURNS.length - 1])
export const STAR_NAMES = STAR_TURNS.map((_, i) => `${i + 1} ${SPARKLE_FRAMES.has(i) ? 'sparkle' : 'star'}`)
/** A star frame's size, px: one 16 mm repeat by the 6 mm thread, at 100 px a mm */
export const STAR_FRAME = { width: 1600, height: 600 }

/** One frame of the star thread, on transparency so the thread's background shows round its stars */
async function drawStarFrame(i: number) {
  const { canvas, g } = sheet(STAR_FRAME.width, STAR_FRAME.height)
  const turn = (STAR_TURNS[i] * Math.PI) / 180
  goldStar(g, 400, 300, 235, turn)
  if (SPARKLE_FRAMES.has(i)) {
    // Halfway to the next big star, with a soft glow round it
    const glow = g.createRadialGradient(1200, 300, 0, 1200, 300, 230)
    glow.addColorStop(0, 'rgba(255, 244, 200, 0.6)')
    glow.addColorStop(1, 'rgba(255, 244, 200, 0)')
    g.fillStyle = glow
    g.fillRect(970, 70, 460, 460)
    goldStar(g, 1200, 300, 120, -turn, true)
  }
  return toBlob(canvas)
}

const BIRD_INK = '#2b2d42'

const SKIES = ['#FFD166', '#F4A261', '#EF6F8C', '#B07BE0', '#6FB7FF']
const WINGS = [-60, -30, 0, 30, 55]
export const BIRD_WORDS = ['wee', 'flap', 'FLAP', 'flap', 'wee!']
/** How many times larger than its 120 × 180 drawing the flapping bird is drawn, so it stays sharp in Thread Studio */
const BIRD_SCALE = 4

/** One frame of a little bird flapping across a shifting sky */
async function drawBird(i: number): Promise<Blob> {
  const W = 120
  const H = 180
  const { canvas, g } = sheet(W * BIRD_SCALE, H * BIRD_SCALE)
  g.scale(BIRD_SCALE, BIRD_SCALE)

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
  g.strokeStyle = BIRD_INK
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
  g.fillStyle = BIRD_INK
  g.beginPath()
  g.arc(cx - 5 + look, cy - 25, 2.6, 0, Math.PI * 2)
  g.arc(cx + 5 + look, cy - 25, 2.6, 0, Math.PI * 2)
  g.fill()

  g.font = 'bold 16px sans-serif'
  g.textAlign = 'center'
  g.fillText(BIRD_WORDS[i], cx, H - 14)

  return toBlob(canvas)
}

export interface DemoArt {
  faces: [watermark: Blob, studio: Blob]
  backs: [watermark: Blob, studio: Blob]
  portrait: Blob
  birds: Blob[]
  stars: Blob[]
}

/** Every piece of the demo's artwork */
export async function drawDemoArt(): Promise<DemoArt> {
  const [watermarkFace, studioFace, watermarkBack, studioBack, portrait, birds, stars] = await Promise.all([
    drawWatermarkFace(),
    drawStudioFace(),
    drawWatermarkBack(),
    drawStudioBack(),
    drawPortrait(),
    Promise.all(BIRD_WORDS.map((_, i) => drawBird(i))),
    Promise.all(STAR_TURNS.map((_, i) => drawStarFrame(i))),
  ])
  return { faces: [watermarkFace, studioFace], backs: [watermarkBack, studioBack], portrait, birds, stars }
}
