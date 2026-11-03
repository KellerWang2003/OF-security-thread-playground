import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IconButton, Labeled, LengthField, Section } from '../components/controls'
import { IMAGE_STEP, imageBox, placeOf, uprightBox } from '../lib/artwork'
import { patternOf } from '../lib/pattern'
import type { Frame, Note } from '../lib/types'
import { FillRow } from './FillPicker'
import { updateFrame, type NoteRef } from './frameActions'
import { swatch } from './LensVisuals'

/**
 * The frame the timeline is on, in Thread Studio's Frames tab and the canvas's Thread tab (Keller): in Thread Studio a
 * row of frame numbers to go to another frame without the timeline (`picker`; the canvas has the timeline for that),
 * then, for an image, where it sits in the tile (X and Y of its top-left corner as drawn, and its width, its height
 * following), then its fill, one row that opens the fill's own panel (`FillRow`).
 */
export function FramePanel({ note, noteRef, frame, index, onShow, picker = true }: {
  note: Note
  noteRef: NoteRef
  frame: Frame
  index: number
  /** Goes to a frame, as a click on its clip in the timeline does */
  onShow: (index: number) => void
  /** The row of frame numbers */
  picker?: boolean
}) {
  const set = (patch: Partial<Frame>) => updateFrame(noteRef, frame.id, patch)

  return (
    <>
      {picker && (
        <Section nested>
          <Labeled label="Frame">
            <div className="flex gap-1">
              {note.frames.map((f, i) => (
                <Button key={f.id} variant="outline" size="sm" aria-label={`Frame ${i + 1}`} aria-pressed={i === index}
                  className={cn('min-w-0 flex-1 px-0 tabular-nums hover:border-foreground/30', i === index && 'border-foreground/60 font-semibold')}
                  // Tinted like the frame strips of the lens
                  style={{ backgroundColor: `color-mix(in oklch, ${swatch(note, i)} 35%, transparent)` }}
                  onClick={() => onShow(i)}>
                  {i + 1}
                </Button>
              ))}
            </div>
          </Labeled>
        </Section>
      )}
      {frame.kind === 'image' && frame.aspect && <ImagePlaceFields note={note} frame={frame} aspect={frame.aspect} set={set} />}
      <Section nested title="Fill">
        <FillRow note={note} noteRef={noteRef} frame={frame} />
      </Section>
    </>
  )
}

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
      <IconButton label="Fit to the tile" size="icon-xs" disabled={!frame.place} onClick={() => set({ place: undefined })}><RotateCcw /></IconButton>
    }>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="From left">
          <LengthField label="X" title={vertical ? "Image position from the thread's left edge" : "Image position from the start of the tile"} value={box.x}
            min={-box.width} max={room.x} step={IMAGE_STEP} onChange={(x) => move({ x })} />
        </Labeled>
        <Labeled label="From top">
          <LengthField label="Y" title={vertical ? 'Image position from the start of the tile' : "Image position from the thread's top edge"} value={box.y}
            min={-box.height} max={room.y} step={IMAGE_STEP} onChange={(y) => move({ y })} />
        </Labeled>
        <Labeled label="Width">
          <LengthField label="W" title="Image width; its height follows the image" value={box.width} min={IMAGE_STEP} max={Math.max(room.x, room.y) * 4}
            step={IMAGE_STEP} onChange={(width) => move({ width })} />
        </Labeled>
      </div>
    </Section>
  )
}
