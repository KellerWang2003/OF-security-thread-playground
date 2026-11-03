import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { SHADE_DEG, TILT_LIMIT } from '../lib/frames'
import { lensMix } from '../lib/lens'
import { watermarkOpacity, watermarkReveal } from '../lib/light'
import { useImageUrl } from '../lib/images'
import { patternMix, preparePattern, sectionClip, shownLabel } from '../lib/pattern'
import { imageTiles, threadWindowMask, windowEdges } from '../lib/thread'
import type { Frame, Note } from '../lib/types'
import { paintRelief, reliefPixels, useRelief } from '../lib/relief'
import { useTilt } from '../tilt/tilt'

// Height ÷ width of each image, once loaded
const aspects = new Map<string, number>()

function useImageAspect(url: string | undefined) {
  const [loaded, setLoaded] = useState<{ url: string; aspect: number }>()
  const aspect = url ? aspects.get(url) ?? (loaded?.url === url ? loaded.aspect : undefined) : undefined
  // Rendered without it: measure it, even if another view did since this one rendered (the browser has it by then)
  useEffect(() => {
    if (!url || aspect !== undefined) return
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth === 0) return
      const aspect = img.naturalHeight / img.naturalWidth
      aspects.set(url, aspect)
      setLoaded({ url, aspect })
    }
    img.src = url
  }, [url, aspect])
  return aspect
}

/** Complete, upright images fit the thread's thickness and repeat with optional spacing. */
export interface FillLayout {
  direction: Note['thread']['direction']
  thicknessPx: number
  lengthPx: number
  gapPx: number
}

export function FrameFill({
  frame,
  direction,
  thicknessPx,
  lengthPx,
  gapPx,
  opacity = 1,
}: FillLayout & {
  frame: Frame
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

type TiltPart = 'shade-up' | 'shade-down' | 'shade-left' | 'shade-right' | 'sheen' | 'blend' | 'watermark'

/**
 * Everything about a tilt that changes continuously: the 3D turn, the light and shade overlays' opacity,
 * where the sheen sits, the fade between two frames and how clearly the watermark shows (its `depth` at `reveal`).
 * All of it is transform or opacity, which the GPU animates without repainting. Live notes write these straight
 * onto their elements every animation frame instead of re-rendering React.
 */
function tiltStyle(angle: number, angleX: number, blend: number, depth: number, reveal: number) {
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
    watermark: { opacity: watermarkOpacity(depth, reveal) },
  }
  return { rotate: angleX ? `rotateX(${angle}deg) rotateY(${angleX}deg)` : `rotateX(${angle}deg)`, parts }
}

/**
 * Which frames show, and which one counts as current: the only parts of a tilt that need a re-render. One entry
 * per section of the thread's pattern; a thread from before patterns has the one.
 */
const shownKey = (note: Note, angle: number, angleX: number) => {
  if (preparePattern(note).plain) {
    const mix = lensMix(note, { x: angleX, y: angle })
    return `${mix.base}|${mix.blend > 0 ? mix.next : mix.base}|${mix.current}`
  }
  return patternMix(note, { x: angleX, y: angle }).map((mix) => `${mix.base}|${mix.blend > 0 ? mix.next : mix.base}|${mix.current}`).join(';')
}
const parseShown = (key: string) => key.split(';').map((entry) => entry.split('|').map(Number))
/** How much the next frame shows over the base one, per section */
const blendsAt = (note: Note, angle: number, angleX: number) =>
  preparePattern(note).plain ? [lensMix(note, { x: angleX, y: angle }).blend] : patternMix(note, { x: angleX, y: angle }).map((mix) => mix.blend)

/**
 * What a stretch of thread `lengthMm` long shows: the frames each section of the pattern shows (`shown`, base and
 * next per section), through that section's areas repeated along it from `offsetMm`. Fading frames take their
 * opacity from `blends`, or live views write it onto `[data-tilt="blend"]` themselves (`data-section` says whose).
 * A thread from before patterns is drawn exactly as it always was.
 */
export function ThreadArt({ note, shown, blends, fill, lengthMm, scale, offsetMm = 0 }: {
  note: Note
  shown: number[][]
  blends?: number[]
  fill: FillLayout
  lengthMm: number
  scale: number
  offsetMm?: number
}) {
  const { frames } = note
  const prepared = preparePattern(note)
  if (prepared.plain) {
    const [base, next] = shown[0] ?? []
    const baseFrame = frames.at(base)
    const nextFrame = next !== base ? frames.at(next) : undefined
    return (
      <>
        {baseFrame && <FrameFill frame={baseFrame} {...fill} />}
        {nextFrame && <div className="absolute inset-0" data-tilt="blend" style={blends ? { opacity: blends[0] } : {}}><FrameFill frame={nextFrame} {...fill} /></div>}
      </>
    )
  }
  return prepared.sections.map((p, i) => {
    const entry = shown[i]
    if (!entry) return null
    const [base, next] = entry
    const baseFrame = frames.at(base)
    const nextFrame = next !== base ? frames.at(next) : undefined
    return (
      <div key={p.section.id} data-section={i} className="absolute inset-0" style={sectionClip(p.section, prepared.pattern.repeatMm, offsetMm, lengthMm, scale, fill.direction)}>
        {baseFrame && <FrameFill frame={baseFrame} {...fill} />}
        {nextFrame && <div className="absolute inset-0" data-tilt="blend" data-section={i} style={blends ? { opacity: blends[i] } : {}}><FrameFill frame={nextFrame} {...fill} /></div>}
      </div>
    )
  })
}

const SIDE_LIGHT = `rgba(255,255,255,${0.12 * SHADE_MAX})`
const SIDE_DARK = `rgba(0,0,0,${0.08 * SHADE_MAX})`

/** The tilt and light a live note follows */
type LiveState = { angle: number; angleX: number; light: number }

/**
 * The note with its thread, drawn at `scale` px per mm. The frame shown comes from the tilt (up/down `angle`,
 * side `angleX`) through the note's lens, or with `live` from the shared tilt as it moves; with `perspective`
 * the note also turns in 3D, and `sheen` adds a highlight that travels along the thread. Its watermark, in the
 * note's own colours under the thread, is only a hint flat, comes out clearly as the note tilts, and shows flat
 * held to the light.
 */
export function NoteView({
  note,
  scale,
  angle = 0,
  angleX = 0,
  live = false,
  perspective = false,
  sheen = false,
  reveal,
  showWindowCuts = false,
  showFrameNumber = false,
  offsetMm = 0,
  selected,
  hovered,
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
   * How clearly the watermark shows, 0 (faint) to 1 (clear), fixed. Without it a live note follows the shared light
   * and tilt, and a still note shows it as at its tilt in reflected light.
   */
  reveal?: number
  showWindowCuts?: boolean
  /** Labels the thread with the number of the frame it shows; exports draw it too when the toggle is on */
  showFrameNumber?: boolean
  /** Where along the thread the pattern's repeat starts, mm: a preview of where the print may land */
  offsetMm?: number
  /** On the canvas, the part picked, outlined firmly */
  selected?: 'thread' | 'watermark'
  /** On the canvas, the part a click would pick, outlined lightly */
  hovered?: 'thread' | 'watermark'
}) {
  const { thread, frames, watermark } = note
  const root = useRef<HTMLDivElement>(null)
  const mm = (value: number) => value * scale
  const face = useImageUrl(note.background === 'image' ? note.faceImageId : undefined)
  // Live notes re-render only when this changes, not on every animation frame
  const liveShown = useTilt((s) => (live ? shownKey(note, s.angle, s.angleX) : ''))
  const shown = parseShown(live ? liveShown : shownKey(note, angle, angleX))
  const relief = useRelief(watermark)
  const light = useRef<HTMLCanvasElement>(null)
  // As many pixels as the watermark shows at on this screen, up to the light layer's own
  const lightSize = relief && watermark ? reliefPixels(relief, watermark.widthMm * scale * (globalThis.devicePixelRatio || 1)) : undefined
  const lightWidth = lightSize?.width ?? 1
  const lightHeight = lightSize?.height ?? 1
  useLayoutEffect(() => {
    // Again whenever its size changes too, as that clears it
    if (light.current && relief && lightWidth * lightHeight > 0) paintRelief(light.current, relief)
  }, [relief, lightWidth, lightHeight])
  const depth = watermark?.depth ?? 0
  const revealOf = (state: LiveState) => reveal ?? watermarkReveal(state.light, { x: state.angleX, y: state.angle })

  // Live: write the continuous parts straight onto the elements, after every render and on every tilt change
  const apply = useRef((_state: LiveState) => {})
  useLayoutEffect(() => {
    apply.current = (state: LiveState) => {
      const element = root.current
      if (!live || !element) return
      const { angle, angleX } = state
      const blends = blendsAt(note, angle, angleX)
      const style = tiltStyle(angle, angleX, blends[0] ?? 0, depth, revealOf(state))
      element.style.transform = perspective ? style.rotate : ''
      for (const part of element.querySelectorAll<HTMLElement>('[data-tilt]')) {
        const section = part.dataset.section
        Object.assign(part.style, section === undefined ? style.parts[part.dataset.tilt as TiltPart] : { opacity: blends[Number(section)] ?? 0 })
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
  const blends = live ? undefined : blendsAt(note, angle, angleX)
  const still = blends && tiltStyle(angle, angleX, blends[0] ?? 0, depth, revealOf({ angle, angleX, light: 0 }))
  const part = (name: TiltPart, style: CSSProperties = {}) => ({ 'data-tilt': name, style: { ...style, ...still?.parts[name] } })
  const watermarkBox: CSSProperties | undefined = watermark && { left: mm(watermark.xMm), top: mm(watermark.yMm), width: mm(watermark.widthMm), height: mm(watermark.heightMm) }
  const boxOf = (target: 'thread' | 'watermark' | undefined) => (target === 'thread' ? strip : target === 'watermark' ? watermarkBox : undefined)
  const art =<ThreadArt note={note} shown={shown} blends={blends} fill={fill} lengthMm={lengthMm} scale={scale} offsetMm={offsetMm} />

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

      {watermarkBox && watermark?.imageId && (
        // Light through thinner paper (relief.ts, through its levels), colour-dodged over the design: it only ever
        // brightens it, in proportion, so it keeps the note's own colours and dark print stays dark. Its opacity is how
        // much of that light comes through. The thread lies over it, unchanged. On the canvas it takes a press, faint or
        // clear, so it drags as the thread does; not with no depth to show.
        <canvas ref={light} data-watermark={note.id} width={lightWidth} height={lightHeight}
          className={cn('absolute', live && depth > 0 ? 'cursor-move' : 'pointer-events-none')}
          {...part('watermark', { ...watermarkBox, mixBlendMode: 'color-dodge' })} />
      )}

      {showWindowCuts && thread.windows.enabled && (
        <div aria-hidden="true" data-window-ghost className="pointer-events-none absolute overflow-hidden" style={{ ...strip, opacity: 0.2, backgroundColor: thread.backgroundColor }}>
          {art}
        </div>
      )}

      <div
        data-thread=""
        className={cn('absolute overflow-hidden', horizontal ? 'cursor-ns-resize' : 'cursor-ew-resize')}
        style={{ ...strip, ...windowMask, backgroundColor: thread.backgroundColor }}
      >
        {art}
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
        <div aria-hidden="true" data-frame-number className="pointer-events-none absolute flex items-center justify-center" style={strip}>
          <span
            className="rounded-full bg-foreground/85 px-1.5 font-semibold leading-none text-background tabular-nums shadow-sm"
            style={{ fontSize: Math.max(10, Math.min(mm(thread.widthMm) * 0.6, 18)), paddingBlock: 3 }}
          >
            {shownLabel(shown.map((entry) => entry[2]))}
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

      {/* Canvas only, never exported. Outside the part, so a thin thread keeps its artwork in view, edged in the background
          colour so the line shows on any design, and over everything, so the watermark's crosses the thread */}
      {boxOf(selected) && <div aria-hidden="true" data-outline="selected" className="pointer-events-none absolute ring-2 ring-primary shadow-[0_0_0_3px_var(--background)]" style={boxOf(selected)} />}
      {boxOf(hovered) && <div aria-hidden="true" data-outline="hover" className="pointer-events-none absolute ring-1 ring-primary shadow-[0_0_0_2px_var(--background)]" style={boxOf(hovered)} />}
    </div>
  )
}
