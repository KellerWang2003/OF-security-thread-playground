import { ImageUp, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reportError } from '../cloud/notices'
import { ColorField, IconButton, Labeled, ScrubField, Section, Segmented } from '../components/controls'
import { IMAGE_STEP, imageBox, placeOf, uprightBox } from '../lib/artwork'
import { pickFiles, useImageUrl } from '../lib/images'
import { patternOf } from '../lib/pattern'
import type { Frame, Note } from '../lib/types'
import { replaceFrameImage, updateFrame, type NoteRef } from './frameActions'

/**
 * The frame picked in Thread Studio's timeline: what it shows (nothing, so the background shows, a colour, or one
 * image) and, for an image, where it sits in the repeat: X and Y of its top-left corner in the repeat, and its
 * width, its height following the image (Keller: one thing per frame, placed in the repeat).
 */
export function FramePanel({ note, noteRef, frame }: { note: Note; noteRef: NoteRef; frame: Frame }) {
  const set = (patch: Partial<Frame>) => updateFrame(noteRef, frame.id, patch)
  const url = useImageUrl(frame.kind === 'image' ? frame.imageId : undefined)
  const upload = async () => {
    try {
      const [file] = await pickFiles()
      if (file) await replaceFrameImage(noteRef, frame.id, file)
    } catch (error) { reportError(error) }
  }

  return (
    <>
      <Section nested>
        <Labeled label="Fill">
          <Segmented
            value={frame.kind}
            options={[
              { value: 'none', label: 'None' },
              { value: 'color', label: 'Colour' },
              { value: 'image', label: 'Image' },
            ]}
            // An image needs one first; a frame that had one gets it back
            onChange={(kind) => (kind === 'image' && !frame.imageId ? void upload() : set({ kind }))}
          />
        </Labeled>
        {frame.kind === 'color' && <ColorField value={frame.color} onChange={(color) => set({ color })} />}
        {frame.kind === 'image' && (
          <Button
            variant="outline"
            size="sm"
            className="h-[58px] justify-start gap-2 overflow-hidden rounded-[calc(var(--radius-sm)+7px)] p-1.5"
            onClick={() => void upload()}
          >
            {url ? (
              <img src={url} alt="" className="h-11 w-11 shrink-0 rounded object-contain" />
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center rounded bg-muted">
                <ImageUp />
              </span>
            )}
            {url ? 'Replace' : 'Upload image'}
          </Button>
        )}
      </Section>
      {frame.kind === 'image' && frame.aspect && <ImagePlaceFields note={note} frame={frame} aspect={frame.aspect} set={set} />}
    </>
  )
}

const tidy = (mm: number) => Math.round(mm * 100) / 100

function ImagePlaceFields({ note, frame, aspect, set }: { note: Note; frame: Frame; aspect: number; set: (patch: Partial<Frame>) => void }) {
  const { thread } = note
  const repeat = patternOf(note).repeatMm
  const box = uprightBox(imageBox(frame.place, aspect, repeat, thread.widthMm, thread.direction), thread.direction)
  const vertical = thread.direction === 'vertical'
  // Width and height across the banknote: the repeat runs down a vertical thread and across a horizontal one
  const room = vertical ? { x: thread.widthMm, y: repeat } : { x: repeat, y: thread.widthMm }
  const move = (patch: Partial<typeof box>) => {
    const next = { ...box, ...patch }
    // A new width keeps the corner where it is, the height following the image
    if (patch.width !== undefined) next.height = patch.width * aspect
    set({ place: placeOf(next, thread.widthMm, thread.direction) })
  }

  return (
    <Section nested title="Place" action={
      <IconButton label="Fit to the repeat" size="icon-xs" disabled={!frame.place} onClick={() => set({ place: undefined })}><RotateCcw /></IconButton>
    }>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="From left">
          <ScrubField label="X" title={vertical ? "Image position from the thread's left edge" : "Image position from the start of the repeat"} value={tidy(box.x)}
            min={-box.width} max={room.x} step={IMAGE_STEP} unit="mm" onChange={(x) => move({ x })} />
        </Labeled>
        <Labeled label="From top">
          <ScrubField label="Y" title={vertical ? 'Image position from the start of the repeat' : "Image position from the thread's top edge"} value={tidy(box.y)}
            min={-box.height} max={room.y} step={IMAGE_STEP} unit="mm" onChange={(y) => move({ y })} />
        </Labeled>
        <Labeled label="Width">
          <ScrubField label="W" title="Image width; its height follows the image" value={tidy(box.width)} min={IMAGE_STEP} max={Math.max(room.x, room.y) * 4}
            step={IMAGE_STEP} unit="mm" onChange={(width) => move({ width })} />
        </Labeled>
      </div>
    </Section>
  )
}
