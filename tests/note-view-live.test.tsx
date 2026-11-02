// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoteView } from '../src/components/NoteView'
import { tiltReveal, watermarkOpacity } from '../src/lib/light'
import { createNote } from '../src/lib/notes'
import { setTilt } from '../src/tilt/tilt'

// The watermark's relief is worked out from its image on a canvas, which jsdom lacks
vi.mock('../src/lib/relief', () => ({
  useRelief: (watermark?: { imageId?: string; blend?: string; fill?: string }) =>
    watermark?.imageId ? `blob:relief-${watermark.imageId}${watermark.blend ? `-${watermark.blend}` : ''}${watermark.fill ? `-${watermark.fill}` : ''}` : undefined,
}))

afterEach(() => {
  cleanup()
  setTilt({ source: 'hold', angle: 0, angleX: 0, target: 0, targetX: 0, light: 0 })
})

const makeNote = () => createNote({ name: 'Live', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#112233' })

describe('a live NoteView', () => {
  it('turns with the shared tilt without re-rendering, and re-renders only when the frame changes', () => {
    const note = makeNote()
    let renders = 0
    function Counted() {
      renders++
      return <NoteView note={note} scale={1} live perspective sheen showFrameNumber />
    }
    const { container } = render(<Counted />)
    const root = container.firstElementChild as HTMLElement
    const number = () => container.querySelector('[data-frame-number]')?.textContent
    const startFrame = number()
    const before = renders

    // A degree or two stays within one frame: the note turns and the shading moves, with no render
    act(() => setTilt({ angle: 1, angleX: 0.5 }))
    expect(root.style.transform).toBe('rotateX(1deg) rotateY(0.5deg)')
    const shade = container.querySelector<HTMLElement>('[data-tilt="shade-down"]')!
    expect(Number(shade.style.opacity)).toBeGreaterThan(0)
    expect(container.querySelector<HTMLElement>('[data-tilt="sheen"]')!.style.transform).toBe(`translateY(${(1 / 60) * 120}%)`)
    expect(renders).toBe(before)
    expect(number()).toBe(startFrame)

    // Tilting a whole cycle's worth further shows another frame, which does render
    act(() => setTilt({ angle: -20 }))
    expect(number()).not.toBe(startFrame)
  })

  it('draws a still note from its props', () => {
    const { container } = render(<NoteView note={makeNote()} scale={1} angle={30} perspective />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.transform).toBe('rotateX(30deg)')
    expect(Number(container.querySelector<HTMLElement>('[data-tilt="shade-down"]')!.style.opacity)).toBeCloseTo(0.5 / 1.5)
  })
})

describe("a NoteView's watermark", () => {
  const withWatermark = () =>
    ({ ...makeNote(), watermark: { imageId: 'mark', xMm: 10, yMm: 10, widthMm: 30, heightMm: 30, depth: 0.6 } })
  const withoutImage = () => ({ ...makeNote(), watermark: { xMm: 10, yMm: 10, widthMm: 30, heightMm: 30, depth: 0.6 } })
  const mark = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-watermark]')!
  const opacity = (container: HTMLElement) => Number(mark(container).style.opacity)

  it("shows in the note's own colours under the thread, faint flat, and held to the light nothing else changes", () => {
    const { container } = render(<NoteView note={withWatermark()} scale={2} live perspective showFrameNumber />)
    const watermark = mark(container)
    expect(watermark.style.mixBlendMode).toBe('hard-light')
    expect(watermark.style.backgroundImage).toContain('blob:relief-mark')
    expect(watermark.style.left).toBe('20px')
    expect(watermark.style.width).toBe('60px')
    expect(watermark.compareDocumentPosition(container.querySelector('[data-thread]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(opacity(container)).toBeCloseTo(watermarkOpacity(0.6, 0))

    const elements = container.querySelectorAll('*').length
    act(() => setTilt({ light: 1 }))
    expect(opacity(container)).toBeCloseTo(0.6)
    expect(container.querySelectorAll('*').length).toBe(elements)
    expect(container.querySelector<HTMLElement>('[data-frame-number]')!.style.opacity).toBe('')
  })

  it('comes out as the note tilts either way, and with the light, which never re-renders it', () => {
    const note = withWatermark()
    let renders = 0
    function Counted() {
      renders++
      return <NoteView note={note} scale={1} live perspective />
    }
    const { container } = render(<Counted />)
    act(() => setTilt({ angle: 10 }))
    expect(opacity(container)).toBeCloseTo(watermarkOpacity(0.6, tiltReveal({ x: 0, y: 10 })))
    act(() => setTilt({ angle: 0, angleX: -30 }))
    expect(opacity(container)).toBeCloseTo(0.6)
    act(() => setTilt({ angleX: 0 }))
    const before = renders
    act(() => setTilt({ light: 0.5 }))
    expect(opacity(container)).toBeCloseTo(watermarkOpacity(0.6, 0.5))
    act(() => setTilt({ light: 1 }))
    expect(opacity(container)).toBeCloseTo(0.6)
    expect(renders).toBe(before)
  })

  it('takes a press on the canvas, faint or clear, but not in a thumbnail or with no depth', () => {
    const grabbable = (container: HTMLElement) =>
      !mark(container).classList.contains('pointer-events-none') && mark(container).style.pointerEvents === ''
    const { container, rerender } = render(<NoteView note={withWatermark()} scale={2} live />)
    expect(grabbable(container)).toBe(true)
    expect(mark(container).classList.contains('cursor-move')).toBe(true)
    act(() => setTilt({ angle: 20 }))
    expect(grabbable(container)).toBe(true)
    act(() => setTilt({ angle: 0, light: 1 }))
    expect(grabbable(container)).toBe(true)
    rerender(<NoteView note={withWatermark()} scale={2} />)
    expect(grabbable(container)).toBe(false)
    rerender(<NoteView note={{ ...withWatermark(), watermark: { ...withWatermark().watermark, depth: 0 } }} scale={2} live />)
    expect(grabbable(container)).toBe(false)
  })

  it('takes a fixed reveal from its props; a still note shows it as at its own tilt in reflected light', () => {
    const { container, rerender } = render(<NoteView note={withWatermark()} scale={1} live reveal={1} />)
    expect(opacity(container)).toBeCloseTo(0.6)
    // Editing windows shows it faint even with the lamp on
    act(() => setTilt({ light: 1 }))
    rerender(<NoteView note={withWatermark()} scale={1} live reveal={0} />)
    expect(opacity(container)).toBeCloseTo(watermarkOpacity(0.6, 0))
    // Thumbnails are flat, so faint, whatever the light
    rerender(<NoteView note={withWatermark()} scale={1} />)
    expect(opacity(container)).toBeCloseTo(watermarkOpacity(0.6, 0))
    rerender(<NoteView note={withWatermark()} scale={1} angle={30} />)
    expect(opacity(container)).toBeCloseTo(0.6)
  })

  it('blends in its own mode, its relief worked out for that mode and fill', () => {
    const { container, rerender } = render(<NoteView note={withWatermark()} scale={1} live />)
    expect(mark(container).style.mixBlendMode).toBe('hard-light')
    rerender(<NoteView note={{ ...withWatermark(), watermark: { ...withWatermark().watermark, blend: 'multiply', fill: '#ff0000' } }} scale={1} live />)
    expect(mark(container).style.mixBlendMode).toBe('multiply')
    expect(mark(container).style.backgroundImage).toContain('blob:relief-mark-multiply-#ff0000')
  })

  it('draws nothing until it has an image', () => {
    const { container } = render(<NoteView note={withoutImage()} scale={1} live />)
    act(() => setTilt({ light: 1 }))
    expect(container.querySelector('[data-watermark]')).toBeNull()
  })
})
