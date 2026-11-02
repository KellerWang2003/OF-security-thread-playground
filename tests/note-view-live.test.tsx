// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NoteView } from '../src/components/NoteView'
import { lightCone } from '../src/lib/light'
import { createNote } from '../src/lib/notes'
import { setTilt } from '../src/tilt/tilt'

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

describe('a NoteView held to the light', () => {
  const withWatermark = () => ({ ...makeNote(), watermark: { xMm: 10, yMm: 10, widthMm: 30, heightMm: 30, depth: 0.6 } })

  it('fades its backlit look in with the light, rendering only when the light first comes on or goes off', () => {
    const note = withWatermark()
    let renders = 0
    function Counted() {
      renders++
      return <NoteView note={note} scale={1} live perspective showFrameNumber />
    }
    const { container } = render(<Counted />)
    const backlit = () => container.querySelector<HTMLElement>('[data-backlit]')
    const opacity = (selector: string) => Number(container.querySelector<HTMLElement>(selector)!.style.opacity)
    expect(backlit()).toBeNull()

    act(() => setTilt({ light: 0.5 }))
    expect(opacity('[data-backlit]')).toBeCloseTo(0.5)
    // The frame number belongs to the reflected look, so it fades out as the light comes through
    expect(opacity('[data-frame-number]')).toBeCloseTo(0.5)
    const lit = renders
    act(() => setTilt({ light: 0.8 }))
    act(() => setTilt({ light: 1 }))
    expect(opacity('[data-backlit]')).toBe(1)
    expect(renders).toBe(lit)

    act(() => setTilt({ light: 0 }))
    expect(backlit()).toBeNull()
    expect(opacity('[data-frame-number]')).toBe(1)
  })

  it('lets less light through as it tilts away from the lamp, and none past the light cone', () => {
    const { container } = render(<NoteView note={withWatermark()} scale={1} live perspective />)
    const opacity = () => Number(container.querySelector<HTMLElement>('[data-backlit]')!.style.opacity)
    act(() => setTilt({ light: 1, angle: 20 }))
    expect(opacity()).toBeCloseTo(lightCone({ x: 0, y: 20 }))
    act(() => setTilt({ angle: 0, angleX: -30 }))
    expect(opacity()).toBeCloseTo(lightCone({ x: -30, y: 0 }))
    act(() => setTilt({ angleX: 0, angle: 50 }))
    expect(opacity()).toBe(0)
  })

  it('makes the watermark clickable only while it shows', () => {
    const { container } = render(<NoteView note={withWatermark()} scale={2} live />)
    act(() => setTilt({ light: 1 }))
    const hit = container.querySelector<HTMLElement>('[data-watermark]')!
    expect(hit.style.pointerEvents).toBe('auto')
    expect(hit.style.left).toBe('20px')
    expect(hit.style.width).toBe('60px')
    act(() => setTilt({ light: 0.3 }))
    expect(hit.style.pointerEvents).toBe('none')
  })

  it('takes a fixed backlight from its props, whatever the shared light', () => {
    const { container, rerender } = render(<NoteView note={withWatermark()} scale={1} live backlight={1} />)
    expect(container.querySelector<HTMLElement>('[data-backlit]')!.style.opacity).toBe('1')
    // Editing windows shows reflected light even with the lamp on
    act(() => setTilt({ light: 1 }))
    rerender(<NoteView note={withWatermark()} scale={1} live backlight={0} />)
    expect(container.querySelector('[data-backlit]')).toBeNull()
    // A still note (thumbnails) stays in reflected light
    rerender(<NoteView note={withWatermark()} scale={1} />)
    expect(container.querySelector('[data-backlit]')).toBeNull()
  })
})
