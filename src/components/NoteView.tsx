import type { CSSProperties } from 'react'
import { frameMix } from '../lib/frames'
import { useImageUrl } from '../lib/images'
import type { Frame, Note } from '../lib/types'

const MAX_TILES = 400

/**
 * One frame filling the thread: a flat colour, or the uploaded image repeated down the thread. Each
 * repeat is the image at the thread's width, at its own aspect ratio, cropped to `tilePx` from its top.
 */
export function FrameFill({
  frame,
  heightPx,
  tilePx,
  opacity = 1,
}: {
  frame: Frame
  heightPx: number
  tilePx: number
  opacity?: number
}) {
  const url = useImageUrl(frame.imageId)
  if (frame.kind === 'color' || !url) {
    return <div className="absolute inset-0" style={{ opacity, backgroundColor: frame.kind === 'color' ? frame.color : undefined }} />
  }
  const tiles = Math.min(MAX_TILES, Math.ceil(heightPx / Math.max(tilePx, 0.5)))
  const tile: CSSProperties = {
    height: tilePx,
    backgroundImage: `url(${url})`,
    backgroundSize: '100% auto',
    backgroundPosition: 'center top',
    backgroundRepeat: 'no-repeat',
  }
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ opacity }}>
      {Array.from({ length: tiles }, (_, i) => (
        <div key={i} className="w-full shrink-0" style={tile} />
      ))}
    </div>
  )
}

/** A frame as a thumbnail: the uploaded image whole, or its colour */
export function FrameThumb({ frame }: { frame: Frame }) {
  const url = useImageUrl(frame.imageId)
  if (frame.kind === 'color' || !url) {
    return <div className="absolute inset-0" style={{ backgroundColor: frame.kind === 'color' ? frame.color : undefined }} />
  }
  return <img src={url} alt="" draggable={false} className="absolute inset-0 size-full object-contain p-1" />
}

/**
 * The note with its thread, drawn at `scale` px per mm. The frame shown comes from the tilt angle; with
 * `perspective` the note also turns in 3D, and `sheen` adds a highlight that travels along the thread.
 */
export function NoteView({
  note,
  scale,
  angle = 0,
  perspective = false,
  sheen = false,
}: {
  note: Note
  scale: number
  angle?: number
  perspective?: boolean
  sheen?: boolean
}) {
  const { thread, frames, tilt } = note
  const mm = (value: number) => value * scale
  const face = useImageUrl(note.background === 'image' ? note.faceImageId : undefined)
  const mix = frameMix(angle, tilt.rangeDeg, frames.length, tilt.transition)
  const baseFrame = frames.at(mix.base)
  const nextFrame = frames.at(mix.next)
  const t = angle / tilt.rangeDeg
  const rotate = perspective ? `rotateX(${angle}deg)` : undefined
  const sheenAt = 50 + t * 70
  const direction = '180deg'
  const horizontal = thread.direction === 'horizontal'
  // The thread is drawn as a vertical strip, then turned for a horizontal thread, so its artwork, repeats
  // and windows always run along its length
  const lengthMm = horizontal ? note.widthMm : note.heightMm
  const strip: CSSProperties = horizontal
    ? {
        left: 0,
        top: mm(thread.positionMm - thread.widthMm / 2),
        width: mm(thread.widthMm),
        height: mm(lengthMm),
        transformOrigin: 'top left',
        transform: `translateY(${mm(thread.widthMm)}px) rotate(-90deg)`,
      }
    : { left: mm(thread.positionMm - thread.widthMm / 2), top: 0, width: mm(thread.widthMm), height: mm(lengthMm) }

  // Between windows the paper covers the thread, so the thread only shows through the windows
  const { windows } = thread
  const windowMask: CSSProperties = {}
  if (windows.enabled && windows.gapMm > 0) {
    const open = mm(windows.windowMm)
    const period = mm(windows.windowMm + windows.gapMm)
    const mask = `repeating-linear-gradient(to bottom, #000 0, #000 ${open}px, transparent ${open}px, transparent ${period}px)`
    windowMask.maskImage = mask
    windowMask.WebkitMaskImage = mask
    windowMask.maskPosition = `0 ${mm(windows.offsetMm)}px`
    windowMask.WebkitMaskPosition = `0 ${mm(windows.offsetMm)}px`
  }

  return (
    <div
      className="relative overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.12)]"
      style={{
        width: mm(note.widthMm),
        height: mm(note.heightMm),
        backgroundColor: note.color,
        borderRadius: mm(1.5),
        transform: rotate,
      }}
    >
      {face && <img src={face} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}

      <div
        className="absolute overflow-hidden bg-white"
        style={{ ...strip, ...windowMask }}
      >
        {baseFrame && <FrameFill frame={baseFrame} heightPx={mm(lengthMm)} tilePx={mm(thread.tileMm)} />}
        {nextFrame && mix.blend > 0 && mix.next !== mix.base && (
          <FrameFill frame={nextFrame} heightPx={mm(lengthMm)} tilePx={mm(thread.tileMm)} opacity={mix.blend} />
        )}
        {sheen && (
          <div
            className="absolute inset-0 mix-blend-soft-light"
            style={{
              // Inside a turned strip, the note's top-to-bottom runs across the strip
              background: `linear-gradient(${horizontal ? '270deg' : '180deg'}, transparent ${sheenAt - 18}%, rgba(255,255,255,0.7) ${sheenAt}%, transparent ${sheenAt + 18}%)`,
            }}
          />
        )}
      </div>

      {perspective && (
        // The note catches a little light or shade as it turns away from flat
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              t < 0
                ? `linear-gradient(${direction}, rgba(255,255,255,${-t * 0.12}), rgba(0,0,0,${-t * 0.08}))`
                : `linear-gradient(${direction}, rgba(0,0,0,${t * 0.08}), rgba(255,255,255,${t * 0.12}))`,
          }}
        />
      )}
    </div>
  )
}
