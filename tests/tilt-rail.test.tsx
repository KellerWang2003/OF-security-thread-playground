// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '../src/components/ui/tooltip'
import { TiltRail } from '../src/editor/TiltRail'
import { setTilt, useTilt } from '../src/tilt/tilt'

beforeEach(() => {
  setTilt({ source: 'drag', angle: 0, target: 0 })
  Element.prototype.setPointerCapture = () => {}
})
afterEach(cleanup)

const renderRail = () => {
  render(<TooltipProvider><TiltRail /></TooltipProvider>)
  return screen.getByRole('slider', { name: 'Tilt' })
}

describe('tilt bar', () => {
  it('follows a drag and holds the angle after release', () => {
    const rail = renderRail()
    fireEvent.pointerDown(rail, { button: 0, buttons: 1, clientY: 200, pointerId: 1 })
    fireEvent.pointerMove(rail, { buttons: 1, clientY: 100, pointerId: 1 })
    expect(useTilt.getState().target).toBeCloseTo(30)
    fireEvent.pointerUp(rail, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(rail, { buttons: 0, clientY: 0, pointerId: 1 })
    expect(useTilt.getState()).toMatchObject({ source: 'hold', target: 30 })
  })

  it('stops following when the release is missed, the capture is lost, or the gesture is cancelled', () => {
    const rail = renderRail()
    fireEvent.pointerDown(rail, { button: 0, buttons: 1, clientY: 200, pointerId: 1 })
    // Moving with no button pressed means the release happened somewhere we never heard about
    fireEvent.pointerMove(rail, { buttons: 0, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(rail, { buttons: 1, clientY: 0, pointerId: 1 })
    expect(useTilt.getState().target).toBe(0)

    for (const end of ['lostPointerCapture', 'pointerCancel'] as const) {
      fireEvent.pointerDown(rail, { button: 0, buttons: 1, clientY: 200, pointerId: 1 })
      fireEvent[end](rail, { pointerId: 1 })
      fireEvent.pointerMove(rail, { buttons: 1, clientY: 100, pointerId: 1 })
      expect(useTilt.getState().target).toBe(0)
    }
  })

  it('ignores a right-click', () => {
    const rail = renderRail()
    fireEvent.pointerDown(rail, { button: 2, buttons: 2, clientY: 200, pointerId: 1 })
    fireEvent.pointerMove(rail, { buttons: 2, clientY: 100, pointerId: 1 })
    expect(useTilt.getState()).toMatchObject({ source: 'drag', target: 0 })
  })
})
