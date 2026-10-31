/** Built-in frame artwork for the lens lab: a bird that flaps across the frames, and an optional aircraft */

const HUES = [208, 158, 42, 14, 282]

export const frameHue = (index: number) => HUES[index % HUES.length]
export const frameFill = (index: number, light = 86) => `hsl(${frameHue(index)} 55% ${light}%)`
export const frameInk = (index: number) => `hsl(${frameHue(index)} 45% 28%)`

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  index: number,
  count: number,
  x: number,
  y: number,
  w: number,
  h: number,
  aircraft: boolean,
) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = frameFill(index)
  ctx.fillRect(x, y, w, h)

  const size = Math.min(w, h)
  const ink = frameInk(index)
  // Bird: wings sweep from up to down across the frames
  const t = count > 1 ? index / (count - 1) : 0
  const cx = x + w / 2
  const cy = y + h * (aircraft ? 0.66 : 0.55)
  const span = size * 0.36
  const lift = -Math.cos(Math.PI * t) * size * 0.22
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = Math.max(1, size * 0.05)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - span, cy - lift)
  ctx.quadraticCurveTo(cx - span * 0.45, cy - lift * 0.2, cx, cy)
  ctx.quadraticCurveTo(cx + span * 0.45, cy - lift * 0.2, cx + span, cy - lift)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(cx, cy + size * 0.02, size * 0.07, size * 0.045, 0, 0, Math.PI * 2)
  ctx.fill()

  if (aircraft) {
    // Small aircraft silhouette near the top
    const ax = x + w * 0.5
    const ay = y + h * 0.2
    const s = size * 0.2
    ctx.fillStyle = 'hsl(0 0% 12%)'
    ctx.beginPath()
    ctx.ellipse(ax, ay, s, s * 0.14, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(ax - s * 0.1, ay)
    ctx.lineTo(ax - s * 0.45, ay - s * 0.75)
    ctx.lineTo(ax - s * 0.25, ay - s * 0.75)
    ctx.lineTo(ax + s * 0.25, ay)
    ctx.lineTo(ax - s * 0.25, ay + s * 0.75)
    ctx.lineTo(ax - s * 0.45, ay + s * 0.75)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(ax - s * 0.8, ay)
    ctx.lineTo(ax - s * 1.0, ay - s * 0.35)
    ctx.lineTo(ax - s * 0.85, ay - s * 0.35)
    ctx.lineTo(ax - s * 0.6, ay)
    ctx.closePath()
    ctx.fill()
  }

  ctx.fillStyle = ink
  ctx.font = `600 ${Math.max(8, size * 0.14)}px system-ui, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillText(String(index + 1), x + size * 0.06, y + size * 0.05)
  ctx.restore()
}
