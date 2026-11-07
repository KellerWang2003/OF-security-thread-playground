import { useEffect, useId } from 'react'
import { reportError } from '../cloud/notices'

/**
 * Pasting images into upload slots (Keller, 7 November: the app also runs inside Figma's code layers, where images are
 * copied rather than picked from files). With an image or an SVG on the clipboard, ⌘/Ctrl+V while the pointer is over a
 * slot, any card or button that uploads an image, gives it the image as its file picker would; with the pointer over
 * none, the slot with the keyboard's focus takes it. A copied file, a copied picture (a screenshot, a browser's Copy
 * image, Figma's Copy as PNG) and SVG copied as text (Figma's Copy as SVG, an editor's code) all paste. It listens to
 * the paste itself rather than reading the clipboard, which needs no permission, in a frame as on its own.
 */

const SLOT = 'data-paste-slot'

interface Slot {
  /** Gets the pasted images: all of them where several may come (the timeline's +), else the first */
  take: (files: File[]) => unknown
  multiple: boolean
}
const slots = new Map<string, Slot>()
/** Where the pointer is, while it is in the window */
let pointer: { x: number; y: number } | undefined
let listening = false

/** Makes what its props are spread on an upload slot for one image, which `take` gets as the file picker gives it */
export function usePasteImage(take: (file: File) => unknown) {
  return usePasteSlot((files) => take(files[0]), false)
}

/** An upload slot that takes several images at once (the timeline's +, a frame each) */
export function usePasteImages(take: (files: File[]) => unknown) {
  return usePasteSlot(take, true)
}

function usePasteSlot(take: Slot['take'], multiple: boolean) {
  const id = useId()
  useEffect(() => {
    slots.set(id, { take, multiple })
    listen()
    return () => {
      slots.delete(id)
    }
  }, [id, take, multiple])
  return { [SLOT]: id }
}

type Clipboard = Pick<DataTransfer, 'files' | 'types' | 'getData'>

/**
 * The images on a clipboard, as files to upload: the image files it holds (a copied picture comes as one), else an SVG
 * copied as text, made a file. Empty when it holds no image; throws when it holds an SVG that can't be read
 */
export function clipboardImages(data: Clipboard | null): File[] {
  if (!data) return []
  const files = Array.from(data.files ?? [])
  if (files.length) return files.filter((file) => file.type.startsWith('image/'))
  for (const type of ['image/svg+xml', 'text/plain', 'text/html']) {
    if (!data.types.includes(type)) continue
    const svg = svgMarkup(data.getData(type))
    if (svg) return [new File([svg], 'Pasted SVG.svg', { type: 'image/svg+xml' })]
  }
  return []
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const DOCTYPE = /<!doctype[^>[]*(?:\[[\s\S]*?\])?\s*>/i
/** What may sit round an SVG copied as text: space, an XML declaration, a doctype, comments, and copied HTML's wrapping */
const WRAPPING = new RegExp(String.raw`\s+|<\?xml[\s\S]*?\?>|${DOCTYPE.source}|<!--[\s\S]*?-->|<\/?(?:html|head|body|meta)\b[^>]*>`, 'iy')

/** Whether the text between `from` and `to` is only what may sit round an SVG */
function onlyWrapping(text: string, from: number, to: number) {
  WRAPPING.lastIndex = from
  while (WRAPPING.lastIndex < to) {
    const at = WRAPPING.lastIndex
    if (!WRAPPING.exec(text) || WRAPPING.lastIndex > to || WRAPPING.lastIndex === at) return false
  }
  return true
}

/**
 * An SVG copied as text, ready to be a file: the text when it is one SVG and nothing more (code round one isn't), with
 * the namespaces an image needs, which markup copied from a web page or a component leaves out. Undefined when it isn't
 * an SVG; throws when it is one that can't be read
 */
export function svgMarkup(text: string): string | undefined {
  const start = text.search(/<svg[\s>]/i)
  const close = text.toLowerCase().lastIndexOf('</svg>')
  if (start < 0 || close < start) return undefined
  const end = close + '</svg>'.length
  if (!onlyWrapping(text, 0, start) || !onlyWrapping(text, end, text.length)) return undefined
  // A doctype stays, as some editors declare entities in it
  const doctype = DOCTYPE.exec(text.slice(0, start))?.[0]
  const markup = (doctype ? `${doctype}\n` : '') + withNamespaces(text.slice(start, end))
  if (!readable(markup)) throw new Error('The SVG on the clipboard can’t be read.')
  return markup
}

function withNamespaces(svg: string) {
  const open = /^<svg\b[^>]*>/i.exec(svg)?.[0] ?? ''
  let tag = open
  if (!/\sxmlns\s*=/.test(tag)) tag = tag.replace(/^<svg/i, `<svg xmlns="${SVG_NS}"`)
  if (/\bxlink:/.test(svg) && !/\sxmlns:xlink\s*=/.test(tag)) tag = tag.replace(/^<svg/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
  return tag + svg.slice(open.length)
}

function readable(markup: string) {
  if (typeof DOMParser === 'undefined') return true
  const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement
  return root.namespaceURI === SVG_NS && root.localName === 'svg' && root.getElementsByTagName('parsererror').length === 0
}

/** Whether the clipboard holds Figma's own copy of layers, which only Figma can paste */
const figmaLayers = (data: Clipboard | null) => !!data?.types.includes('text/html') && /\(figm(?:a|eta)\)/.test(data.getData('text/html'))

const TEXT_INPUTS = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number'])
/** Whether a paste there goes into text being typed */
function typingIn(target: EventTarget | null) {
  if (target instanceof HTMLInputElement) return TEXT_INPUTS.has(target.type)
  return target instanceof Element && !!target.closest('textarea, [contenteditable]:not([contenteditable="false"])')
}

function slotOf(element: Element | null | undefined) {
  const id = element?.closest(`[${SLOT}]`)?.getAttribute(SLOT)
  return id ? slots.get(id) : undefined
}

function onPaste(event: ClipboardEvent) {
  if (event.defaultPrevented) return
  const typing = typingIn(event.target)
  // The slot under the pointer, whatever has the focus, else the slot with it, unless text is being typed
  const under = pointer && typeof document.elementFromPoint === 'function' ? document.elementFromPoint(pointer.x, pointer.y) : null
  const slot = slotOf(under) ?? (typing ? undefined : slotOf(document.activeElement))
  if (!slot) return
  let images: File[]
  try {
    images = clipboardImages(event.clipboardData)
  } catch (error) {
    event.preventDefault()
    reportError(error)
    return
  }
  if (!images.length) {
    // Text pasted into a field goes there, as ever
    if (typing) return
    event.preventDefault()
    reportError(new Error(figmaLayers(event.clipboardData)
      ? 'Figma’s own copy only pastes in Figma. Copy as PNG (⌘/Ctrl+Shift+C) or Copy as SVG there, then paste here.'
      : 'There’s no image on the clipboard.'))
    return
  }
  event.preventDefault()
  void Promise.resolve().then(() => slot.take(slot.multiple ? images : images.slice(0, 1))).catch(reportError)
}

/**
 * Inside another page (Figma's code layers) the keyboard stays with that page until the app is clicked, so ⌘V would
 * paste there: the pointer coming over a slot brings the keyboard to the app, as a click would
 */
function takeKeyboard(event: PointerEvent) {
  if (window.self === window.top || document.hasFocus()) return
  if (event.target instanceof Element && event.target.closest(`[${SLOT}]`)) window.focus()
}

function listen() {
  if (listening) return
  listening = true
  const options = { capture: true, passive: true }
  const track = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY }
  }
  window.addEventListener('pointermove', track, options)
  window.addEventListener('pointerdown', track, options)
  window.addEventListener('pointerover', takeKeyboard, options)
  // Out of the window, or the frame it is shown in, the pointer is over no slot
  window.addEventListener('pointerout', (event) => {
    if (!event.relatedTarget) pointer = undefined
  }, options)
  window.addEventListener('paste', onPaste)
}
