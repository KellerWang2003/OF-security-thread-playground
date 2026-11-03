import { ImageUp, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { reportError } from '../cloud/notices'
import { ColorField, IconButton, Labeled, ScrubField, Section, Segmented, SwitchField } from '../components/controls'
import { IMAGE_STEP, imageBox, placeOf, uprightBox } from '../lib/artwork'
import { pickFiles, useImageUrl } from '../lib/images'
import { patternOf } from '../lib/pattern'
import { updateNote } from '../lib/store'
import type { Frame, Note } from '../lib/types'
import { replaceFrameImage, updateFrame, type NoteRef } from './frameActions'
import { swatch } from './LensVisuals'

/**
 * The frame the timeline is on, always in Thread Studio's right panel (Keller): a picker to go to another frame without
 * the timeline, then, for an image, where it sits in the repeat (X and Y of its top-left corner as drawn, and its width,
 * its height following), then its fill: Background (nothing of its own, so the background shared by every frame
 * shows), a colour, or one image. The shared background is set here too, wherever it shows: on Background frames and
 * behind images.
 */
export function FramePanel({ note, noteRef, frame, index, onShow }: {
  note: Note
  noteRef: NoteRef
  frame: Frame
  index: number
  /** Goes to a frame, as a click on its clip in the timeline does */
  onShow: (index: number) => void
}) {
  const set = (patch: Partial<Frame>) => updateFrame(noteRef, frame.id, patch)
  const url = useImageUrl(frame.kind === 'image' ? frame.imageId : undefined)
  const upload = async () => {
    try {
      const [file] = await pickFiles()
      if (file) await replaceFrameImage(noteRef, frame.id, file)
    } catch (error) { reportError(error) }
  }
  const setBackground = (backgroundColor: string | undefined) =>
    updateNote(noteRef.projectId, noteRef.noteId, (n) => ({ ...n, thread: { ...n.thread, backgroundColor } }))

  return (
    <>
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
      {frame.kind === 'image' && frame.aspect && <ImagePlaceFields note={note} frame={frame} aspect={frame.aspect} set={set} />}
      <Section nested title="Fill">
        <Segmented
          value={frame.kind}
          options={[
            { value: 'none', label: 'Background' },
            { value: 'color', label: 'Colour' },
            { value: 'image', label: 'Image' },
          ]}
          // An image needs one first; a frame that had one gets it back
          onChange={(kind) => (kind === 'image' && !frame.imageId ? void upload() : set({ kind }))}
        />
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
        {/* The background shared by every frame, wherever this one lets it show */}
        {frame.kind !== 'color' && (
          <>
            <SwitchField label="Background colour" title="One colour under every frame; off, the banknote shows through" checked={!!note.thread.backgroundColor}
              onChange={(enabled) => setBackground(enabled ? '#ffffff' : undefined)} />
            {note.thread.backgroundColor && <ColorField value={note.thread.backgroundColor} onChange={setBackground} />}
          </>
        )}
      </Section>
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
