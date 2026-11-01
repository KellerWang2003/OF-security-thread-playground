// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '../src/components/ui/tooltip'
import { TiltRail } from '../src/editor/TiltRail'
import { setTilt, springToFlat, useTilt } from '../src/tilt/tilt'

// jsdom lays the pad out at 0,0: its 136 px square is centred on 68,68 and ±90° spans 62 px each way
const C = 68
const PX_PER_DEG = 62 / 90

beforeEach(() => {
  setTilt({ source: 'drag', angle: 0, target: 0, angleX: 0, targetX: 0, lockX: false, lockY: false })
  Element.prototype.setPointerCapture = () => {}
})
afterEach(cleanup)

const renderPad = () => {
  render(<TooltipProvider><TiltRail /></TooltipProvider>)
  return screen.getByRole('group', { name: 'Tilt' })
}
const at = (x: number, y: number) => ({ clientX: C + x * PX_PER_DEG, clientY: C - y * PX_PER_DEG, pointerId: 1 })

describe('tilt pad', () => {
  it('tilts both ways from one drag and holds where you let go', () => {
    const pad = renderPad()
    fireEvent.pointerDown(pad, { button: 0, buttons: 1, ...at(0, 0) })
    fireEvent.pointerMove(pad, { buttons: 1, ...at(-20, 30) })
    expect(useTilt.getState().target).toBeCloseTo(30)
    expect(useTilt.getState().targetX).toBeCloseTo(-20)
    fireEvent.pointerUp(pad, at(-20, 30))
    fireEvent.pointerMove(pad, { buttons: 0, ...at(0, 0) })
    expect(useTilt.getState().source).toBe('hold')
    expect(useTilt.getState().target).toBeCloseTo(30)
  })

  it('keeps a locked axis where it is, through drags and the spring back to flat', () => {
    const pad = renderPad()
    setTilt({ source: 'hold', target: 10, lockY: true })
    fireEvent.pointerDown(pad, { button: 0, buttons: 1, ...at(25, 50) })
    expect(useTilt.getState().target).toBe(10)
    expect(useTilt.getState().targetX).toBeCloseTo(25)
    springToFlat()
    expect(useTilt.getState()).toMatchObject({ target: 10, targetX: 0 })
  })

  it('stops following when the release is missed, the capture is lost, or the gesture is cancelled', () => {
    const pad = renderPad()
    fireEvent.pointerDown(pad, { button: 0, buttons: 1, ...at(0, 0) })
    // Moving with no button pressed means the release happened somewhere we never heard about
    fireEvent.pointerMove(pad, { buttons: 0, ...at(0, 30) })
    fireEvent.pointerMove(pad, { buttons: 1, ...at(0, 30) })
    expect(useTilt.getState().target).toBeCloseTo(0)

    for (const end of ['lostPointerCapture', 'pointerCancel'] as const) {
      fireEvent.pointerDown(pad, { button: 0, buttons: 1, ...at(0, 0) })
      fireEvent[end](pad, { pointerId: 1 })
      fireEvent.pointerMove(pad, { buttons: 1, ...at(0, 30) })
      expect(useTilt.getState().target).toBeCloseTo(0)
    }
  })

  it('ignores a right-click', () => {
    const pad = renderPad()
    fireEvent.pointerDown(pad, { button: 2, buttons: 2, ...at(0, 30) })
    fireEvent.pointerMove(pad, { buttons: 2, ...at(0, 40) })
    expect(useTilt.getState()).toMatchObject({ source: 'drag', target: 0 })
  })
})
