import { ImageUp, X } from 'lucide-react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { reportError } from '../cloud/notices'
import { ColorField, IconButton, Labeled, SwitchField } from '../components/controls'
import { backOf, type Side } from '../lib/back'
import { THUMB_PX, pickFiles, useImageUrl } from '../lib/images'
import { updateNote } from '../lib/store'
import type { Frame, Note } from '../lib/types'
import { turnOver } from '../tilt/tilt'
import { replaceFrameImage, setBackImage, setFaceImage, updateBack, updateFrame, type NoteRef } from './frameActions'

/** A fill as it is laid out: whether it shows an image, the image's picture once loaded, and the colour that shows without one */
interface Fill {
  image: boolean
  url?: string
  color: string
}

/** What it takes to change a fill */
interface FillEdits {
  setColor: (color: string) => void
  /** Makes a file the image */
  addImage: (file: File) => Promise<unknown>
  /** Drops the image, the colour showing again */
  removeImage: () => void
  /** The image card before there is an image */
  uploadLabel?: string
  /** The colour under every one of the thread's frames, and setting it (none lets the banknote show through) */
  background?: { color?: string; set: (color: string | undefined) => void }
}

/**
 * The image's card: what it says before there is an image (Upload), then the image itself (its picture once loaded)
 * with Replace, and × beside it. It never asks for a file on its own (Keller); its button does.
 */
function ImageCard({ image, url, uploadLabel = 'Upload image', onAdd, onRemove }: {
  image: boolean
  url?: string
  uploadLabel?: string
  onAdd: (file: File) => Promise<unknown>
  onRemove: () => void
}) {
  const upload = async () => {
    try {
      const [file] = await pickFiles()
      if (file) await onAdd(file)
    } catch (error) { reportError(error) }
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-[58px] min-w-0 flex-1 justify-start gap-2 overflow-hidden rounded-[calc(var(--radius-sm)+7px)] p-1.5"
        onClick={() => void upload()}
      >
        {image && url ? (
          <img src={url} alt="" className="h-11 w-11 shrink-0 rounded object-contain" />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded bg-muted">
            {!image && <ImageUp />}
          </span>
        )}
        {image ? 'Replace' : uploadLabel}
      </Button>
      {image && (
        <IconButton label="Remove image" onClick={onRemove}>
          <X />
        </IconButton>
      )}
    </div>
  )
}

/**
 * A fill meant for an image, laid out where it is set rather than in a panel of its own (Keller, 4 November: the upload
 * hid a level down and testers never found it): the image first, as its card (`label` naming it), then the colour,
 * always the secondary choice. What shows is the image when there is one, else the colour. A frame's fill also holds
 * the thread's Background colour, in a section of its own under it.
 */
function FillFields({ label, fill, edits }: { label?: string; fill: Fill; edits: FillEdits }) {
  const card = <ImageCard image={fill.image} url={fill.url} uploadLabel={edits.uploadLabel} onAdd={edits.addImage} onRemove={edits.removeImage} />
  return (
    <>
      {label ? <Labeled label={label}>{card}</Labeled> : card}
      <Labeled label="Colour">
        <ColorField value={fill.color} onChange={edits.setColor} />
      </Labeled>
      {/* A second section (Keller): the colour under every frame, showing on empty ones and round images */}
      {edits.background && (
        <>
          <div className="border-t border-border/70" />
          <SwitchField label="Background colour" title="One colour under every frame; off, the banknote shows through" checked={!!edits.background.color}
            onChange={(on) => edits.background?.set(on ? '#ffffff' : undefined)} />
          {edits.background.color && <ColorField value={edits.background.color} onChange={edits.background.set} />}
        </>
      )}
    </>
  )
}

/** A frame's fill and how to change it, with the thread's background; removing its image shows its colour again */
function frameFill(note: Note, noteRef: NoteRef, frame: Frame, url: string | undefined): { fill: Fill; edits: FillEdits } {
  return {
    fill: { image: frame.kind === 'image' && !!frame.imageId, url, color: frame.color },
    edits: {
      setColor: (color) => updateFrame(noteRef, frame.id, { color }),
      addImage: (file) => replaceFrameImage(noteRef, frame.id, file),
      removeImage: () => updateFrame(noteRef, frame.id, { kind: 'color', imageId: undefined, aspect: undefined, place: undefined }),
      background: {
        color: note.thread.backgroundColor,
        set: (backgroundColor) => updateNote(noteRef.projectId, noteRef.noteId, (n) => ({ ...n, thread: { ...n.thread, backgroundColor } })),
      },
    },
  }
}

/** A frame's fill, laid out under Tile pattern in the right panels */
export function FrameFill({ note, noteRef, frame }: { note: Note; noteRef: NoteRef; frame: Frame }) {
  const url = useImageUrl(frame.kind === 'image' ? frame.imageId : undefined, THUMB_PX)
  return <FillFields {...frameFill(note, noteRef, frame, url)} />
}

/** A frame's fill in a panel of its own, opened from somewhere else: the pencil on its clip in the timeline */
export function FrameFillPanel({ note, noteRef, frame, trigger, side = 'left', align = 'start', onOpenChange }: {
  note: Note
  noteRef: NoteRef
  frame: Frame
  trigger: ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  onOpenChange?: (open: boolean) => void
}) {
  const url = useImageUrl(frame.kind === 'image' ? frame.imageId : undefined, THUMB_PX)
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent side={side} align={align} sideOffset={8} className="w-60">
        <FillFields {...frameFill(note, noteRef, frame, url)} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * A side of the banknote's background, laid out as a frame's fill is (Keller: the same everywhere): its design, an
 * uploaded image that can be removed again, and under it its colour, which shows without one. Working on either side
 * turns the banknotes to it, so what changes is in sight.
 */
export function BackgroundFill({ note, noteRef, side }: { note: Note; noteRef: NoteRef; side: Side }) {
  const back = side === 'back' ? backOf(note) : undefined
  const face = back ?? { background: note.background, imageId: note.faceImageId, color: note.color }
  const url = useImageUrl(face.background === 'image' ? face.imageId : undefined, THUMB_PX)
  const setImage = back ? setBackImage : setFaceImage
  const turn = () => turnOver(side === 'back')
  return (
    <div className="flex flex-col gap-3" onPointerDownCapture={turn} onFocusCapture={turn}>
      <FillFields
        label={back ? 'Back' : 'Front'}
        fill={{ image: face.background === 'image' && !!face.imageId, url, color: face.color }}
        edits={{
          setColor: (color) => (back ? updateBack(noteRef, { color }) : updateNote(noteRef.projectId, noteRef.noteId, (n) => ({ ...n, color }))),
          addImage: (file) => setImage(noteRef, file),
          removeImage: () => void setImage(noteRef, undefined).catch(reportError),
          uploadLabel: 'Upload design',
        }}
      />
    </div>
  )
}
