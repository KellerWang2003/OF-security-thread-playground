// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useNotice } from '../src/cloud/notices'
import { createNote } from '../src/lib/notes'
import type { Note } from '../src/lib/types'
import { TooltipProvider } from '../src/components/ui/tooltip'

// One banknote in place of the project store, and artwork that stores at once
const held = vi.hoisted(() => ({ note: undefined as Note | undefined, stored: 0 }))
vi.mock('../src/lib/store', () => ({
  findNote: () => held.note,
  updateNote: (_project: string, _note: string, change: (note: Note) => Note) => { held.note = change(held.note!) },
}))
vi.mock('../src/lib/images', () => ({
  THUMB_PX: 96,
  pickFiles: async () => [],
  useImageUrl: () => undefined,
  storeImage: async () => `stored-${++held.stored}`,
  removeImage: async () => {},
  imageAspect: async () => 0.5,
}))
const { clipboardImages, svgMarkup, usePasteImage, usePasteImages } = await import('../src/lib/pasteImages')
const { DesignCards } = await import('../src/editor/DesignCards')
const { UploadDesignButton } = await import('../src/editor/UploadDesignButton')
const { FrameFill } = await import('../src/editor/FillPicker')
const { LayerImage } = await import('../src/editor/PlacedFields')

const FIGMA_SVG = '<svg width="56" height="235" viewBox="0 0 56 235" fill="none" xmlns="http://www.w3.org/2000/svg">\n<rect width="56" height="235" rx="12" fill="#C60056"/>\n</svg>\n'
/** What Figma's own ⌘C puts on the clipboard: its layers in its own format, no image */
const FIGMA_LAYERS = '<meta charset="utf-8"><div><span data-metadata="<!--(figmeta)eyJmaWxlS2V5Ijoi(/figmeta)-->"></span><span data-buffer="<!--(figma)ZmlnLWtpd2k(/figma)-->"></span></div>'
const png = (name = 'image') => new File(['png'], `${name}.png`, { type: 'image/png' })

/** A clipboard as a paste hands it over */
function clipboard({ files = [], data = {} }: { files?: File[]; data?: Record<string, string> }) {
  return { files, types: [...(files.length ? ['Files'] : []), ...Object.keys(data)], getData: (type: string) => data[type] ?? '' } as unknown as DataTransfer
}

/** A paste where the keyboard is, as ⌘V gives one */
function paste(data: DataTransfer, target: EventTarget = document.activeElement ?? document.body) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: data })
  act(() => { target.dispatchEvent(event) })
  return event
}

/** The pointer over an element (jsdom lays nothing out, so it says what is under the pointer) */
function hover(element: Element | null) {
  document.elementFromPoint = () => element
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: 5, clientY: 5 }))
}

beforeEach(() => {
  held.note = createNote({ name: 'Banknote', x: 0, y: 0, widthMm: 150, heightMm: 70, color: '#123456' })
  held.stored = 0
  useNotice.setState({ message: '' })
})
afterEach(() => {
  cleanup()
  // Out of the window: over nothing
  window.dispatchEvent(new MouseEvent('pointerout', { relatedTarget: null }))
  ;(document.activeElement as HTMLElement | null)?.blur()
})

describe('images on the clipboard', () => {
  it('reads a copied picture as its file, and leaves out files that are no image', () => {
    const picture = png()
    expect(clipboardImages(clipboard({ files: [new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' }), picture] }))).toEqual([picture])
    expect(clipboardImages(clipboard({ data: { 'text/plain': 'Banknote 1' } }))).toEqual([])
    expect(clipboardImages(null)).toEqual([])
  })

  it('makes an SVG copied as text a file, as Figma’s Copy as SVG copies it', async () => {
    const [file] = clipboardImages(clipboard({ data: { 'text/plain': FIGMA_SVG } }))
    expect(file.type).toBe('image/svg+xml')
    expect(await file.text()).toBe(FIGMA_SVG.trim())
    // Copied from a web page, wrapped as copied HTML is
    const [html] = clipboardImages(clipboard({ data: { 'text/html': `<meta charset='utf-8'>${FIGMA_SVG}` } }))
    expect(await html.text()).toBe(FIGMA_SVG.trim())
  })

  it('takes a whole SVG file’s text, with its prolog, and adds the namespaces a picture needs', () => {
    const file = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: Sketch -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n${FIGMA_SVG}`
    expect(svgMarkup(file)).toBe(`<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n${FIGMA_SVG.trim()}`)
    // An icon's markup copied from a page or a component often leaves them out
    expect(svgMarkup('<svg viewBox="0 0 10 10"><use xlink:href="#a"/></svg>'))
      .toBe('<svg xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><use xlink:href="#a"/></svg>')
  })

  it('leaves text that only holds an SVG among other things, and stops at an SVG that can’t be read', () => {
    expect(svgMarkup('const icon = `<svg viewBox="0 0 1 1"></svg>`')).toBeUndefined()
    expect(svgMarkup('Banknote 1')).toBeUndefined()
    expect(() => svgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>')).toThrow('can’t be read')
  })
})

/** Two slots as the app has them: one image (a card), and several (the timeline's +), beside a text field */
function Slots({ one, several }: { one: (file: File) => unknown; several: (files: File[]) => unknown }) {
  const single = usePasteImage(one)
  const multiple = usePasteImages(several)
  return (
    <>
      <button type="button" {...single}>Upload image</button>
      <button type="button" {...multiple}>Add frame</button>
      <input aria-label="Name" />
    </>
  )
}

describe('pasting into upload slots', () => {
  it('gives the slot under the pointer the image, and all of them to one that takes several', async () => {
    const one = vi.fn()
    const several = vi.fn()
    render(<Slots one={one} several={several} />)
    const [a, b] = [png('a'), png('b')]

    hover(screen.getByText('Upload image'))
    expect(paste(clipboard({ files: [a, b] })).defaultPrevented).toBe(true)
    await waitFor(() => expect(one).toHaveBeenCalledWith(a))

    hover(screen.getByText('Add frame'))
    paste(clipboard({ files: [a, b] }))
    await waitFor(() => expect(several).toHaveBeenCalledWith([a, b]))
    expect(one).toHaveBeenCalledTimes(1)
  })

  it('with the pointer over no slot, gives it to the slot with the focus, but leaves text being typed alone', async () => {
    const one = vi.fn()
    render(<Slots one={one} several={() => {}} />)
    hover(document.body)

    const name = screen.getByRole('textbox', { name: 'Name' })
    name.focus()
    expect(paste(clipboard({ files: [png()] })).defaultPrevented).toBe(false)
    expect(paste(clipboard({ data: { 'text/plain': 'Banknote 1' } })).defaultPrevented).toBe(false)

    screen.getByText('Upload image').focus()
    paste(clipboard({ files: [png()] }))
    await waitFor(() => expect(one).toHaveBeenCalledTimes(1))
    expect(useNotice.getState().message).toBe('')
  })

  it('still gives the slot under the pointer an image while a field has the focus, its text staying the field’s', async () => {
    const one = vi.fn()
    render(<Slots one={one} several={() => {}} />)
    screen.getByRole('textbox', { name: 'Name' }).focus()
    hover(screen.getByText('Upload image'))

    expect(paste(clipboard({ data: { 'text/plain': 'Banknote 1' } })).defaultPrevented).toBe(false)
    expect(paste(clipboard({ data: { 'text/plain': FIGMA_SVG } })).defaultPrevented).toBe(true)
    await waitFor(() => expect(one).toHaveBeenCalledTimes(1))
    expect(one.mock.calls[0][0].type).toBe('image/svg+xml')
  })

  it('says so when there is no image to paste, and how to copy one from Figma', () => {
    const one = vi.fn()
    render(<Slots one={one} several={() => {}} />)
    hover(screen.getByText('Upload image'))

    paste(clipboard({ data: { 'text/html': FIGMA_LAYERS, 'text/plain': '' } }))
    expect(useNotice.getState().message).toMatch(/Copy as PNG .*Copy as SVG/)
    paste(clipboard({ data: { 'text/plain': 'Banknote 1' } }))
    expect(useNotice.getState().message).toBe('There’s no image on the clipboard.')
    paste(clipboard({ data: { 'text/plain': '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>' } }))
    expect(useNotice.getState().message).toBe('The SVG on the clipboard can’t be read.')
    expect(one).not.toHaveBeenCalled()
  })

  it('takes nothing once the pointer has left the window, or the slot is gone', () => {
    const one = vi.fn()
    const { unmount } = render(<Slots one={one} several={() => {}} />)
    const card = screen.getByText('Upload image')
    hover(card)
    window.dispatchEvent(new MouseEvent('pointerout', { relatedTarget: null }))
    expect(paste(clipboard({ files: [png()] })).defaultPrevented).toBe(false)

    unmount()
    hover(card)
    expect(paste(clipboard({ files: [png()] })).defaultPrevented).toBe(false)
    expect(one).not.toHaveBeenCalled()
  })
})

describe('the app’s upload slots', () => {
  const ref = () => ({ projectId: 'p', noteId: held.note!.id })

  it('the banknote’s design cards and the + on its side take a pasted design', async () => {
    render(<TooltipProvider><DesignCards note={held.note!} noteRef={ref()} /></TooltipProvider>)
    hover(screen.getByRole('group', { name: 'Back' }).querySelector('button'))
    paste(clipboard({ files: [png()] }))
    await waitFor(() => expect(held.note!.back?.imageId).toBe('stored-1'))
    cleanup()

    render(<TooltipProvider><UploadDesignButton noteRef={ref()} side="front" /></TooltipProvider>)
    hover(screen.getByRole('button', { name: 'Upload design' }))
    paste(clipboard({ data: { 'text/plain': FIGMA_SVG } }))
    await waitFor(() => expect(held.note!.faceImageId).toBe('stored-2'))
  })

  it('a frame’s Tile pattern card and a placed layer’s Image card take a pasted image', async () => {
    const frame = held.note!.frames[0]
    render(<TooltipProvider><FrameFill note={held.note!} noteRef={ref()} frame={frame} /></TooltipProvider>)
    hover(screen.getByRole('button', { name: 'Upload image' }))
    paste(clipboard({ files: [png('star')] }))
    await waitFor(() => expect(held.note!.frames[0]).toMatchObject({ kind: 'image', imageId: 'stored-1', name: 'star' }))
    cleanup()

    const upload = vi.fn(async () => {})
    render(<TooltipProvider><LayerImage imageId={undefined} onUpload={upload} onRemove={() => {}} /></TooltipProvider>)
    hover(screen.getByRole('button', { name: 'Upload image' }))
    const picture = png()
    paste(clipboard({ files: [picture] }))
    await waitFor(() => expect(upload).toHaveBeenCalledWith(picture))
  })
})
