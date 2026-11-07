import { ImageUp, X } from 'lucide-react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { reportError } from '../cloud/notices'
import { ColorField, IconButton, Labeled, SwitchField } from '../components/controls'
import { THUMB_PX, pickFiles, useImageUrl } from '../lib/images'
import { usePasteImage } from '../lib/pasteImages'
import { updateNote } from '../lib/store'
import type { Frame, Note } from '../lib/types'
import { replaceFrameImage, updateFrame, type NoteRef } from './frameActions'

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
  /** The colour under every one of the thread's frames, and setting it (none lets the banknote show through) */
  background?: { color?: string; set: (color: string | undefined) => void }
}

/**
 * The image's card: what it says before there is an image (Upload), then the image itself (its picture once loaded)
 * with Replace, and × beside it. It never asks for a file on its own (Keller); its button does, and an image pasted
 * while the pointer is over it goes in too (`usePasteImage`).
 */
function ImageCard({ image, url, onAdd, onRemove }: {
  image: boolean
  url?: string
  onAdd: (file: File) => Promise<unknown>
  onRemove: () => void
}) {
  const upload = async () => {
    try {
      const [file] = await pickFiles()
      if (file) await onAdd(file)
    } catch (error) { reportError(error) }
  }
  const paste = usePasteImage(onAdd)
  return (
    <div className="flex items-center gap-2">
      <Button
        {...paste}
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
        {image ? 'Replace' : 'Upload image'}
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
 * A frame's fill, laid out where it is set rather than in a panel of its own (Keller, 4 November: the upload hid a level
 * down and testers never found it): the image first, as its card, then the colour, always the secondary choice. What
 * shows is the image when there is one, else the colour. It also holds the thread's Background colour, in a section of
 * its own under it.
 */
function FillFields({ fill, edits }: { fill: Fill; edits: FillEdits }) {
  return (
    <>
      <ImageCard image={fill.image} url={fill.url} onAdd={edits.addImage} onRemove={edits.removeImage} />
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
