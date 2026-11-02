import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { SHADE_DEG, TILT_LIMIT } from '../lib/frames'
import { lensMix } from '../lib/lens'
import { BACKLIT, backlightAt } from '../lib/light'
import { useImageUrl } from '../lib/images'
import { imageTiles, threadWindowMask, windowEdges } from '../lib/thread'
import type { Frame, Note } from '../lib/types'
import { useRelief } from '../lib/relief'
import { useTilt } from '../tilt/tilt'

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

/** Light and shade reach full strength at SHADE_DEG; past it (up to TILT_LIMIT) they keep growing */
const SHADE_MAX = TILT_LIMIT / SHADE_DEG

type TiltPart = 'shade-up' | 'shade-down' | 'shade-left' | 'shade-right' | 'sheen' | 'blend' | 'backlit' | 'unlit' | 'watermark-hit'

/**
 * Everything about a tilt that changes continuously: the 3D turn, the light and shade overlays' opacity,
 * where the sheen sits, the fade between two frames and how much light comes through from behind (`glow`). All
 * of it is transform or opacity, which the GPU animates without repainting. Live notes write these straight onto
 * their elements every animation frame instead of re-rendering React.
 */
function tiltStyle(angle: number, angleX: number, blend: number, glow: number) {
  const t = angle / SHADE_DEG
  const tx = angleX / SHADE_DEG
  const share = (v: number) => Math.min(Math.max(v, 0) / SHADE_MAX, 1)
  const parts: Record<TiltPart, CSSProperties> = {
    'shade-up': { opacity: share(-t) },
    'shade-down': { opacity: share(t) },
    'shade-right': { opacity: share(tx) },
    'shade-left': { opacity: share(-tx) },
    sheen: { transform: `translateY(${t * 120}%)` },
    blend: { opacity: blend },
    backlit: { opacity: glow },
    unlit: { opacity: 1 - glow },
    // The watermark can be clicked only while it shows
    'watermark-hit': { pointerEvents: glow >= 0.5 ? 'auto' : 'none' },
  }
  return { rotate: angleX ? `rotateX(${angle}deg) rotateY(${angleX}deg)` : `rotateX(${angle}deg)`, parts }
}

/** Which frames show, and which one counts as current: the only parts of a tilt that need a re-render */
const shownKey = (note: Pick<Note, 'frames' | 'tilt'>, angle: number, angleX: number) => {
  const mix = lensMix(note, { x: angleX, y: angle })
  return `${mix.base}|${mix.blend > 0 ? mix.next : mix.base}|${mix.current}`
}

const SIDE_LIGHT = `rgba(255,255,255,${0.12 * SHADE_MAX})`
const SIDE_DARK = `rgba(0,0,0,${0.08 * SHADE_MAX})`

/** The tilt and light a live note follows */
type LiveState = { angle: number; angleX: number; light: number }

/**
 * The note with its thread, drawn at `scale` px per mm. The frame shown comes from the tilt (up/down `angle`,
 * side `angleX`) through the note's lens, or with `live` from the shared tilt as it moves; with `perspective`
 * the note also turns in 3D, and `sheen` adds a highlight that travels along the thread. Held to the light, the
 * paper glows, its watermark shows, the print turns into soft shadow and the thread into one dark stripe.
 */
export function NoteView({
  note,
  scale,
  angle = 0,
  angleX = 0,
  live = false,
  perspective = false,
  sheen = false,
  backlight,
  showWindowCuts = false,
  showFrameNumber = false,
}: {
  note: Note
  scale: number
  angle?: number
  angleX?: number
  /** Follows the shared tilt (`useTilt`) itself, re-rendering only when the frame shown changes */
  live?: boolean
  perspective?: boolean
  sheen?: boolean
  /**
   * How backlit the note looks, 0 to 1, fixed (the light cone already applied). Without it a live note follows
   * the shared light through the light cone at its tilt, and a still note is in reflected light.
   */
  backlight?: number
  showWindowCuts?: boolean
  /** Labels the thread with the number of the frame it shows; exports draw it too when the toggle is on */
  showFrameNumber?: boolean
}) {
  const { thread, frames, watermark } = note
  const root = useRef<HTMLDivElement>(null)
  const mm = (value: number) => value * scale
  const face = useImageUrl(note.background === 'image' ? note.faceImageId : undefined)
  // Live notes re-render only when this changes, not on every animation frame
  const liveShown = useTilt((s) => (live ? shownKey(note, s.angle, s.angleX) : ''))
  const [base, next, current] = (live ? liveShown : shownKey(note, angle, angleX)).split('|').map(Number)
  const baseFrame = frames.at(base)
  const nextFrame = next !== base ? frames.at(next) : undefined
  // The backlit layers exist only while there is light; how much of it shows is opacity, like the shading
  const sharedLight = useTilt((s) => live && backlight === undefined && s.light > 0)
  const lit = backlight === undefined ? sharedLight : backlight > 0
  const relief = useRelief(live || lit ? watermark?.imageId : undefined)
  const glowOf = (state: LiveState) => backlight ?? backlightAt(state.light, { x: state.angleX, y: state.angle })

  // Live: write the continuous parts straight onto the elements, after every render and on every tilt change
  const apply = useRef((_state: LiveState) => {})
  useLayoutEffect(() => {
    apply.current = (state: LiveState) => {
      const element = root.current
      if (!live || !element) return
      const { angle, angleX } = state
      const style = tiltStyle(angle, angleX, lensMix(note, { x: angleX, y: angle }).blend, glowOf(state))
      element.style.transform = perspective ? style.rotate : ''
      for (const part of element.querySelectorAll<HTMLElement>('[data-tilt]')) {
        Object.assign(part.style, style.parts[part.dataset.tilt as TiltPart])
      }
    }
    apply.current(useTilt.getState())
  })
  useLayoutEffect(() => {
    if (!live) return
    return useTilt.subscribe((state, previous) => {
      if (state.angle !== previous.angle || state.angleX !== previous.angleX || state.light !== previous.light) apply.current(state)
    })
  }, [live])

  const horizontal = thread.direction === 'horizontal'
  const lengthMm = horizontal ? note.widthMm : note.heightMm
  const strip: CSSProperties = horizontal
    ? { left: 0, top: mm(thread.positionMm - thread.widthMm / 2), width: mm(lengthMm), height: mm(thread.widthMm) }
    : { left: mm(thread.positionMm - thread.widthMm / 2), top: 0, width: mm(thread.widthMm), height: mm(lengthMm) }

  const fill = { direction: thread.direction, thicknessPx: mm(thread.widthMm), lengthPx: mm(lengthMm), gapPx: mm(thread.imageGapMm ?? 0) }

  const windowMask = threadWindowMask(thread, scale)
  // Static notes (thumbnails, tests) are drawn from props; live ones leave these to apply()
  const still = live ? undefined : tiltStyle(angle, angleX, lensMix(note, { x: angleX, y: angle }).blend, backlight ?? 0)
  const part = (name: TiltPart, style: CSSProperties = {}) => ({ 'data-tilt': name, style: { ...style, ...still?.parts[name] } })
  const watermarkBox: CSSProperties | undefined = watermark && { left: mm(watermark.xMm), top: mm(watermark.yMm), width: mm(watermark.widthMm), height: mm(watermark.heightMm) }
  // Print seen through lit paper is soft; the ink layer reaches past the edges so its blur never leaves a light rim
  const inkBlur = mm(BACKLIT.inkBlurMm) >= 0.3 ? mm(BACKLIT.inkBlurMm) : 0
  const inkPad = Math.ceil(inkBlur * 2)

  return (
    <div
      ref={root}
      className="relative overflow-hidden shadow-note"
      style={{
        width: mm(note.widthMm),
        height: mm(note.heightMm),
        backgroundColor: note.color,
        borderRadius: mm(1.5),
        transform: perspective && still ? still.rotate : undefined,
        willChange: live && perspective ? 'transform' : undefined,
      }}
    >
      {face && <img src={face} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}

      {showWindowCuts && thread.windows.enabled && (
        <div aria-hidden="true" data-window-ghost className="pointer-events-none absolute overflow-hidden" style={{ ...strip, opacity: 0.2, backgroundColor: thread.backgroundColor }}>
          {baseFrame && <FrameFill frame={baseFrame} {...fill} />}
          {nextFrame && <div className="absolute inset-0" {...part('blend')}><FrameFill frame={nextFrame} {...fill} /></div>}
        </div>
      )}

      <div
        data-thread=""
        className={cn('absolute overflow-hidden', horizontal ? 'cursor-ns-resize' : 'cursor-ew-resize')}
        style={{ ...strip, ...windowMask, backgroundColor: thread.backgroundColor }}
      >
        {baseFrame && <FrameFill frame={baseFrame} {...fill} />}
        {nextFrame && <div className="absolute inset-0" {...part('blend')}><FrameFill frame={nextFrame} {...fill} /></div>}
        {sheen && (
          // The highlight sits halfway along the thread when flat and slides along it as the note tilts
          <div
            className="absolute inset-0 mix-blend-soft-light"
            {...part('sheen', {
              background: 'linear-gradient(180deg, transparent 32%, rgba(255,255,255,0.7) 50%, transparent 68%)',
              willChange: live ? 'transform' : undefined,
            })}
          />
        )}
      </div>

      {lit && (
        // Held to the light: lit paper, the watermark's thinner and thicker paper hard-light blended on it, the print
        // as a soft shadow over both, and the thread blocking the light along its whole length. Isolated, so the
        // blends stay inside and the whole picture fades over the note in reflected light.
        <div aria-hidden="true" data-backlit="" className="pointer-events-none absolute inset-0"
          {...part('backlit', { isolation: 'isolate', willChange: live ? 'opacity' : undefined })}>
          <div className="absolute inset-0" style={{ backgroundColor: BACKLIT.paper }} />
          {watermarkBox && relief && (
            <div data-watermark-relief="" className="absolute"
              style={{ ...watermarkBox, backgroundImage: `url(${relief})`, backgroundSize: '100% 100%', mixBlendMode: 'hard-light', opacity: watermark!.depth }} />
          )}
          <div className="absolute"
            style={{ inset: -inkPad, backgroundColor: note.color, mixBlendMode: 'multiply', opacity: BACKLIT.ink, filter: inkBlur ? `blur(${inkBlur}px)` : undefined }}>
            {face && <img src={face} alt="" draggable={false} className="absolute object-cover" style={{ left: inkPad, top: inkPad, width: mm(note.widthMm), height: mm(note.heightMm) }} />}
          </div>
          <div className="absolute" style={{ ...strip, backgroundColor: BACKLIT.thread }} />
          {watermarkBox && <div data-watermark={note.id} className="absolute" {...part('watermark-hit', watermarkBox)} />}
        </div>
      )}

      {showWindowCuts && thread.windows.enabled && (
        <div aria-hidden="true" data-window-cuts className="pointer-events-none absolute" style={strip}>
          {windowEdges(thread, lengthMm).map((edge) => (
            <div key={edge} className="absolute border-dashed border-fuchsia-500" style={horizontal
              ? { left: mm(edge), top: -4, bottom: -4, borderLeftWidth: 1 }
              : { top: mm(edge), left: -4, right: -4, borderTopWidth: 1 }} />
          ))}
        </div>
      )}

      {showFrameNumber && frames.length > 0 && (
        <div aria-hidden="true" data-frame-number className="pointer-events-none absolute flex items-center justify-center" {...part('unlit', strip)}>
          <span
            className="rounded-full bg-foreground/85 px-1.5 font-semibold leading-none text-background tabular-nums shadow-sm"
            style={{ fontSize: Math.max(10, Math.min(mm(thread.widthMm) * 0.6, 18)), paddingBlock: 3 }}
          >
            {current + 1}
          </span>
        </div>
      )}

      {perspective && (
        // Light and shade as the note turns: they fade in with opacity rather than redrawing a gradient each frame
        <>
          {/* Turning sideways, the edge turning away darkens a little and the near edge catches the light */}
          <div className="pointer-events-none absolute inset-0" {...part('shade-right', { background: `linear-gradient(90deg, ${SIDE_LIGHT}, ${SIDE_DARK})` })} />
          <div className="pointer-events-none absolute inset-0" {...part('shade-left', { background: `linear-gradient(90deg, ${SIDE_DARK}, ${SIDE_LIGHT})` })} />
          {/* Turning up or down, the note catches a little light or shade */}
          <div className="pointer-events-none absolute inset-0" {...part('shade-up', { background: `linear-gradient(180deg, ${SIDE_LIGHT}, ${SIDE_DARK})` })} />
          <div className="pointer-events-none absolute inset-0" {...part('shade-down', { background: `linear-gradient(180deg, ${SIDE_DARK}, ${SIDE_LIGHT})` })} />
        </>
      )}
    </div>
  )
}
