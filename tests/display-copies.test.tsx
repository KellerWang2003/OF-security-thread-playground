// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A 3000 × 1500 px original; each copy's file says its step, so its address does too
const made = vi.hoisted(() => vi.fn(async (_blob: Blob, steps: number[]) => ({
  width: 3000,
  height: 1500,
  copies: steps.filter((step) => step < 3000).map((step) => [step, new Blob([], { type: `image/copy-${step}` })] as [number, Blob]),
})))
const offThread = vi.hoisted(() => ({ value: true }))
vi.mock('../src/lib/imageWork', () => ({ canWorkOffThread: () => offThread.value, makeCopies: made }))
const original = vi.hoisted(() => ({ type: 'image/png' }))
const unreachable = vi.hoisted(() => ({ value: false }))
vi.mock('../src/cloud/repository', () => ({
  downloadArtwork: async () => {
    if (unreachable.value) throw new Error('Couldn’t reach the workspace. Please retry.')
    return new Blob([], { type: original.type })
  },
}))
vi.mock('../src/cloud/notices', () => ({ reportError: () => {} }))
vi.mock('../src/cloud/cache', () => ({ readArtwork: async () => undefined, writeArtwork: async () => {} }))

import { loadImageUrl, setImageWorkspace, stepFor, storeImage, useImageUrl } from '../src/lib/images'

function Probe({ id, px }: { id: string; px?: number }) {
  return <span data-testid={`${id}@${px}`} data-url={useImageUrl(id, px) ?? ''} />
}

/** The address the probe ends up with */
async function shown(id: string, px?: number) {
  const { getByTestId } = render(<Probe id={id} px={px} />)
  const probe = getByTestId(`${id}@${px}`)
  await waitFor(() => expect(probe.dataset.url).not.toBe(''))
  return probe.dataset.url
}

beforeEach(() => {
  // jsdom has no object URLs: an address that says what it points at
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: (blob: Blob) => `blob:${blob.type}`, revokeObjectURL: () => {} }))
  made.mockClear()
  offThread.value = true
  original.type = 'image/png'
  unreachable.value = false
  // A fresh session each time: nothing known yet
  setImageWorkspace(`test-${crypto.randomUUID()}`)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('display copies', () => {
  it('picks the smallest step at least as big as an image is drawn, and the original past the last', () => {
    expect(stepFor(1)).toBe(256)
    expect(stepFor(256)).toBe(256)
    expect(stepFor(257)).toBe(512)
    expect(stepFor(4096)).toBe(4096)
    expect(stepFor(4097)).toBe(Infinity)
  })

  it('draws a view from the copy for its size, made once for every view', async () => {
    const id = crypto.randomUUID()
    expect(await shown(id, 120)).toBe('blob:image/copy-256')
    expect(await shown(id, 900)).toBe('blob:image/copy-1024')
    expect(await shown(id, 2000)).toBe('blob:image/copy-2048')
    expect(made).toHaveBeenCalledTimes(1)
  })

  it('draws the original where no copy is smaller, or without a size', async () => {
    const id = crypto.randomUUID()
    // The 4096 step is bigger than the 3000 px original itself
    expect(await shown(id, 3500)).toBe('blob:image/png')
    expect(await shown(id, 9000)).toBe('blob:image/png')
    expect(await shown(id)).toBe('blob:image/png')
  })

  it('keeps SVGs, and browsers that cannot make copies, on the original', async () => {
    original.type = 'image/svg+xml'
    expect(await shown(crypto.randomUUID(), 120)).toBe('blob:image/svg+xml')
    original.type = 'image/png'
    offThread.value = false
    expect(await shown(crypto.randomUUID(), 120)).toBe('blob:image/png')
    expect(made).not.toHaveBeenCalled()
  })

  it('says an image is on its way until it comes, and that it couldn’t be had once it can’t, so nothing loads for ever', async () => {
    const id = crypto.randomUUID()
    const states: (string | null | undefined)[] = []
    function Watch() {
      states.push(useImageUrl(id, 300))
      return null
    }
    unreachable.value = true
    render(<Watch />)
    // Undefined while on its way (a view shows it loading), then null: no image, and no longer loading
    expect(states[0]).toBeUndefined()
    await waitFor(() => expect(states.at(-1)).toBeNull())
    cleanup()
    // Drawn again, it is tried again
    unreachable.value = false
    expect(await shown(id, 300)).toBe('blob:image/copy-512')
  })

  it('keeps showing the biggest copy while a view waits for the original, rather than going back to loading', async () => {
    const id = crypto.randomUUID()
    // Its copies made (by a view at 1000 px), but not yet its original's address
    expect(await shown(id, 1000)).toBe('blob:image/copy-1024')
    const first: (string | null | undefined)[] = []
    function Zoomed() {
      first.push(useImageUrl(id, 9000))
      return null
    }
    render(<Zoomed />)
    expect(first[0]).toBe('blob:image/copy-2048')
    await waitFor(() => expect(first.at(-1)).toBe('blob:image/png'))
  })

  it('starts on an upload’s copies as soon as it is stored', async () => {
    const file = new Blob([], { type: 'image/jpeg' })
    let id = ''
    await act(async () => { id = await storeImage(file) })
    await waitFor(() => expect(made).toHaveBeenCalledWith(file, expect.any(Array)))
    expect(await loadImageUrl(id, 500)).toBe('blob:image/copy-512')
    expect(made).toHaveBeenCalledTimes(1)
  })
})
