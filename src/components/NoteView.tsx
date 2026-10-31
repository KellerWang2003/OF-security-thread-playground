import type { CSSProperties } from 'react'
import { frameMix } from '../lib/frames'
import { useImageUrl } from '../lib/images'
import type { Frame, FrameFit, Project } from '../lib/types'

/** One frame filling the thread: a flat colour, or the uploaded image stretched or tiled down its length */
export function FrameFill({
  frame,
  fit,
  tilePx,
  opacity = 1,
}: {
  frame: Frame
  fit: FrameFit
  tilePx: number
  opacity?: number
}) {
  const url = useImageUrl(frame.imageId)
  const style: CSSProperties = { opacity, backgroundColor: frame.kind === 'color' ? frame.color : 'transparent' }
  if (frame.kind === 'image' && url) {
    style.backgroundImage = `url(${url})`
    style.backgroundSize = fit === 'stretch' ? '100% 100%' : `100% ${tilePx}px`
    style.backgroundRepeat = fit === 'stretch' ? 'no-repeat' : 'repeat-y'
    style.backgroundPosition = 'center top'
  }
  return <div className="absolute inset-0" style={style} />
}

/**
 * The note with its thread, drawn at `scale` px per mm. The frame shown comes from the tilt angle; with
 * `perspective` the note also turns in 3D, and `sheen` adds a highlight that travels along the thread.
 */
export function NoteView({
  project,
  scale,
  angle = 0,
  perspective = false,
  sheen = false,
}: {
  project: Project
  scale: number
  angle?: number
  perspective?: boolean
  sheen?: boolean
}) {
  const { note, thread, frames, tilt } = project
  const mm = (value: number) => value * scale
  const face = useImageUrl(note.faceImageId)
  const mix = frameMix(angle, tilt.rangeDeg, frames.length, tilt.transition)
  const baseFrame = frames.at(mix.base)
  const nextFrame = frames.at(mix.next)
  const t = angle / tilt.rangeDeg
  const vertical = tilt.axis === 'vertical'
  const rotate = perspective ? (vertical ? `rotateX(${angle}deg)` : `rotateY(${angle}deg)`) : undefined
  const sheenAt = 50 + t * 70
  const direction = vertical ? '180deg' : '90deg'

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
        className="absolute inset-y-0 bg-white"
        style={{
          left: mm(thread.xMm - thread.widthMm / 2 - thread.surroundMm),
          width: mm(thread.widthMm + 2 * thread.surroundMm),
        }}
      />

      <div
        className="absolute inset-y-0 overflow-hidden bg-white"
        style={{ left: mm(thread.xMm - thread.widthMm / 2), width: mm(thread.widthMm) }}
      >
        {baseFrame && <FrameFill frame={baseFrame} fit={thread.fit} tilePx={mm(thread.tileMm)} />}
        {nextFrame && mix.blend > 0 && mix.next !== mix.base && (
          <FrameFill frame={nextFrame} fit={thread.fit} tilePx={mm(thread.tileMm)} opacity={mix.blend} />
        )}
        {sheen && (
          <div
            className="absolute inset-0 mix-blend-soft-light"
            style={{
              background: `linear-gradient(${direction}, transparent ${sheenAt - 18}%, rgba(255,255,255,0.7) ${sheenAt}%, transparent ${sheenAt + 18}%)`,
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
