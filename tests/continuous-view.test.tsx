// @vitest-environment jsdom
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EdgeMarks } from '../src/editor/ContinuousView'
import { createNote } from '../src/lib/notes'

afterEach(cleanup)

describe('the continuous check on the canvas', () => {
  it('keeps the cut tolerance’s line in place while a drift moves the design under it', () => {
    const note = { ...createNote({ name: 'Drift', x: 0, y: 0, widthMm: 100, heightMm: 50, color: '#123456' }), continuous: { cutMm: 1 } }
    const { container, rerender } = render(<EdgeMarks note={note} scale={2} drift={{ x: 0, y: 0 }} quiet={false} />)
    const at = () => [...container.querySelectorAll('[data-cut-line]')].map((line) => [line.getAttribute('x'), line.getAttribute('y')])
    expect(at()).toEqual([['2', '2'], ['2', '2']])
    // It marks where the cut can land, so it stays, whichever way the cut drifts (Keller)
    rerender(<EdgeMarks note={note} scale={2} drift={{ x: 1, y: -0.5 }} quiet={false} />)
    expect(at()).toEqual([['2', '2'], ['2', '2']])
  })
})
