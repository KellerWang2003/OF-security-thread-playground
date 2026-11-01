// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NoteView } from '../src/components/NoteView'
import { createNote } from '../src/lib/notes'
import { setTilt } from '../src/tilt/tilt'

afterEach(() => {
  cleanup()
  setTilt({ source: 'hold', angle: 0, angleX: 0, target: 0, targetX: 0 })
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
