import { drawPortrait, sheet, starPath, toBlob } from './demoArt'
import type { PlacedLayer } from './layers'

/**
 * What a new watermark or magnetic ink starts with, so it shows what it does before anything is uploaded (Keller,
 * 3 November: it had started as an empty box): the demo's bird portrait for a watermark, a star for magnetic ink. Each
 * is drawn once a session, and each new layer stores its own copy, as an upload is stored, so Replace, Remove and
 * Duplicate treat it as any image.
 */
const drawn = new Map<PlacedLayer, Promise<Blob>>()

/** Magnetic ink's star: solid on transparency, so all of it takes ink */
async function drawInkStar() {
  const size = 600
  const { canvas, g } = sheet(size, size)
  starPath(g, size / 2, size * 0.53, size * 0.48, size * 0.48 * 0.41, 0)
  g.fillStyle = '#000000'
  g.fill()
  return toBlob(canvas)
}

/** The stand-in image for a new layer, as a file to store */
export async function standIn(layer: PlacedLayer): Promise<File> {
  let blob = drawn.get(layer)
  if (!blob) {
    const drawing = layer === 'watermark' ? drawPortrait() : drawInkStar()
    // A drawing that failed is tried again next time
    drawing.catch(() => drawn.delete(layer))
    drawn.set(layer, drawing)
    blob = drawing
  }
  return new File([await blob], `${layer}.png`, { type: 'image/png' })
}
