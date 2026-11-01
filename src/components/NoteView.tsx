import { useEffect, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { SHADE_DEG } from '../lib/frames'
import { lensMix } from '../lib/lens'
import { useImageUrl } from '../lib/images'
import { imageTiles, threadWindowMask, windowEdges } from '../lib/thread'
import type { Frame, Note } from '../lib/types'

// Height ÷ width of each image, once loaded
const aspects = new Map<string, number>()

function useImageAspect(url: string | undefined) {
  const [loaded, setLoaded] = useState<{ url: string; aspect: number }>()
  useEffect(() => {
    if (!url || aspects.has(url)) return
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth === 0) return
      const aspect = img.naturalHeight / img.naturalWidth
      aspects.set(url, aspect)
      setLoaded({ url, aspect })
    }
    img.src = url
  }, [url])
  if (!url) return undefined
  return aspects.get(url) ?? (loaded?.url === url ? loaded.aspect : undefined)
}

/** Complete, upright images fit the thread's thickness and repeat with optional spacing. */
export function FrameFill({
  frame,
  direction,
  thicknessPx,
  lengthPx,
  gapPx,
  opacity = 1,
}: {
  frame: Frame
  direction: Note['thread']['direction']
  thicknessPx: number
  lengthPx: number
  gapPx: number
  opacity?: number
}) {
  const url = useImageUrl(frame.imageId)
  const aspect = useImageAspect(url)
  if (frame.kind === 'color' || !url) {
    return <div className="absolute inset-0" style={{ opacity, backgroundColor: frame.kind === 'color' ? frame.color : undefined }} />
  }
  const vertical = direction === 'vertical'
  const image: CSSProperties = {
    backgroundImage: `url(${url})`,
    backgroundSize: vertical ? '100% auto' : 'auto 100%',
    backgroundPosition: 'left top',
  }
  const { naturalPx, starts } = imageTiles(thicknessPx, lengthPx, gapPx, aspect ?? 0, direction)

  if (!naturalPx || gapPx <= 0) {
    return <div className="absolute inset-0" style={{ ...image, opacity, backgroundRepeat: vertical ? 'repeat-y' : 'repeat-x' }} />
  }
  return (
    <div className={cn('absolute inset-0 flex overflow-hidden', vertical ? 'flex-col' : 'flex-row')} style={{ opacity, gap: gapPx }}>
      {starts.map((start) => (
        <div
          key={start}
          className="shrink-0"
          style={{ ...image, backgroundRepeat: 'no-repeat', ...(vertical ? { height: naturalPx, width: '100%' } : { width: naturalPx, height: '100%' }) }}
        />
      ))}
    </div>
  )
}

/** A frame as a thumbnail: the uploaded image whole, or its colour */
export function FrameThumb({ frame, backgroundColor }: { frame: Frame; backgroundColor?: string }) {
  const url = useImageUrl(frame.imageId)
  if (frame.kind === 'color' || !url) {
    return <div className="absolute inset-0" style={{ backgroundColor: frame.kind === 'color' ? frame.color : undefined }} />
  }
  return (
    <div className="absolute inset-0" style={{ backgroundColor }}>
      <img src={url} alt="" draggable={false} className="absolute inset-0 size-full object-contain p-1" />
    </div>
  )
}

/**
 * The note with its thread, drawn at `scale` px per mm. The frame shown comes from the tilt (up/down `angle`,
 * side `angleX`) through the note's lens; with `perspective` the note also turns in 3D, and `sheen` adds a
 * highlight that travels along the thread.
 */
export function NoteView({
  note,
  scale,
  angle = 0,
  angleX = 0,
  perspective = false,
  sheen = false,
  showWindowCuts = false,
}: {
  note: Note
  scale: number
  angle?: number
  angleX?: number
  perspective?: boolean
  sheen?: boolean
  showWindowCuts?: boolean
}) {
  const { thread, frames } = note
  const mm = (value: number) => value * scale
  const face = useImageUrl(note.background === 'image' ? note.faceImageId : undefined)
  const mix = lensMix(note, { x: angleX, y: angle })
  const baseFrame = frames.at(mix.base)
  const nextFrame = frames.at(mix.next)
  const t = angle / SHADE_DEG
  const tx = angleX / SHADE_DEG
  const rotate = perspective ? (angleX ? `rotateX(${angle}deg) rotateY(${angleX}deg)` : `rotateX(${angle}deg)`) : undefined
  const sheenAt = 50 + t * 120
  const direction = '180deg'
  const horizontal = thread.direction === 'horizontal'
  const lengthMm = horizontal ? note.widthMm : note.heightMm
  const strip: CSSProperties = horizontal
    ? { left: 0, top: mm(thread.positionMm - thread.widthMm / 2), width: mm(lengthMm), height: mm(thread.widthMm) }
    : { left: mm(thread.positionMm - thread.widthMm / 2), top: 0, width: mm(thread.widthMm), height: mm(lengthMm) }

  const fill = { direction: thread.direction, thicknessPx: mm(thread.widthMm), lengthPx: mm(lengthMm), gapPx: mm(thread.imageGapMm ?? 0) }

  const windowMask = threadWindowMask(thread, scale)

  return (
    <div
      className="relative overflow-hidden shadow-note"
      style={{
        width: mm(note.widthMm),
        height: mm(note.heightMm),
        backgroundColor: note.color,
        borderRadius: mm(1.5),
        transform: rotate,
      }}
    >
      {face && <img src={face} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}

      {showWindowCuts && thread.windows.enabled && (
        <div aria-hidden="true" data-window-ghost className="pointer-events-none absolute overflow-hidden" style={{ ...strip, opacity: 0.2, backgroundColor: thread.backgroundColor }}>
          {baseFrame && <FrameFill frame={baseFrame} {...fill} />}
          {nextFrame && mix.blend > 0 && mix.next !== mix.base && <FrameFill frame={nextFrame} {...fill} opacity={mix.blend} />}
        </div>
      )}

      <div
        data-thread=""
        className={cn('absolute overflow-hidden', horizontal ? 'cursor-ns-resize' : 'cursor-ew-resize')}
        style={{ ...strip, ...windowMask, backgroundColor: thread.backgroundColor }}
      >
        {baseFrame && <FrameFill frame={baseFrame} {...fill} />}
        {nextFrame && mix.blend > 0 && mix.next !== mix.base && <FrameFill frame={nextFrame} {...fill} opacity={mix.blend} />}
        {sheen && (
          <div
            className="absolute inset-0 mix-blend-soft-light"
            style={{
              background: `linear-gradient(180deg, transparent ${sheenAt - 18}%, rgba(255,255,255,0.7) ${sheenAt}%, transparent ${sheenAt + 18}%)`,
            }}
          />
        )}
      </div>

      {showWindowCuts && thread.windows.enabled && (
        <div aria-hidden="true" data-window-cuts className="pointer-events-none absolute" style={strip}>
          {windowEdges(thread, lengthMm).map((edge) => (
            <div key={edge} className="absolute border-dashed border-fuchsia-500" style={horizontal
              ? { left: mm(edge), top: -4, bottom: -4, borderLeftWidth: 1 }
              : { top: mm(edge), left: -4, right: -4, borderTopWidth: 1 }} />
          ))}
        </div>
      )}

      {perspective && tx !== 0 && (
        // Turning sideways, the edge turning away darkens a little and the near edge catches the light
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              tx > 0
                ? `linear-gradient(90deg, rgba(255,255,255,${tx * 0.12}), rgba(0,0,0,${tx * 0.08}))`
                : `linear-gradient(90deg, rgba(0,0,0,${-tx * 0.08}), rgba(255,255,255,${-tx * 0.12}))`,
          }}
        />
      )}

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
