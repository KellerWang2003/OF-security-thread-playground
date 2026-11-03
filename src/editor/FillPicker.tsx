import { ImageUp, X } from 'lucide-react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { reportError } from '../cloud/notices'
import { ColorField, IconButton, Segmented } from '../components/controls'
import { pickFiles, useImageUrl } from '../lib/images'
import { updateNote } from '../lib/store'
import type { Frame, Note } from '../lib/types'
import { replaceFrameImage, setFaceImage, updateFrame, type NoteRef } from './frameActions'

/** A fill as its picker shows it: a colour, an image (with its picture once there is one), or nothing */
interface Fill {
  kind: 'none' | 'color' | 'image'
  color: string
  url?: string
}

/** What it takes to change a fill */
interface FillEdits {
  setKind: (kind: 'color' | 'image') => void
  setColor: (color: string) => void
  /** Makes a file the image */
  addImage: (file: File) => Promise<unknown>
  /** Drops the image, where it can go (the banknote's design) */
  removeImage?: () => void
  /** The image button before there is an image */
  uploadLabel?: string
}

/** No fill: a faint check, as empty thread shows in Thread Studio */
const CHECK = {
  backgroundImage: 'repeating-conic-gradient(color-mix(in oklab, var(--foreground) 14%, transparent) 0% 25%, transparent 0% 50%)',
  backgroundSize: '8px 8px',
}

/** A fill as a small square, as Figma's fill swatch: its colour or its image, a check when it has neither */
function FillSwatch({ fill }: { fill: Fill }) {
  return (
    <span className="relative block size-5 shrink-0 overflow-hidden rounded border border-foreground/15 bg-background" style={CHECK}>
      {fill.kind === 'color' && <span className="absolute inset-0" style={{ backgroundColor: fill.color }} />}
      {fill.kind === 'image' && fill.url && <img src={fill.url} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}
    </span>
  )
}

/** What the fill row reads: the colour, or Image */
const fillName = (fill: Fill) => (fill.kind === 'color' ? fill.color.toUpperCase() : 'Image')

type PanelPlace = {
  trigger: ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  onOpenChange?: (open: boolean) => void
}

/**
 * A fill, chosen in a panel of its own as Figma does (Keller, rather than pills laid out flat, and the same everywhere
 * a fill is chosen): what it is at the panel's top, a Colour or an Image, then that fill's own settings. Image starts
 * empty, its button adding one (Upload) and then changing it (Replace); it never asks for a file on its own (Keller).
 * `trigger` opens it.
 */
function FillPanel({ fill, edits, trigger, side = 'left', align = 'start', onOpenChange }: { fill: Fill; edits: FillEdits } & PanelPlace) {
  const upload = async () => {
    try {
      const [file] = await pickFiles()
      if (file) await edits.addImage(file)
    } catch (error) { reportError(error) }
  }
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent side={side} align={align} sideOffset={8} className="w-60">
        <Segmented
          value={fill.kind}
          options={[
            { value: 'color', label: 'Colour' },
            { value: 'image', label: 'Image' },
          ]}
          onChange={(kind) => edits.setKind(kind === 'image' ? 'image' : 'color')}
        />
        {fill.kind === 'color' && <ColorField value={fill.color} onChange={edits.setColor} />}
        {fill.kind === 'image' && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-[58px] min-w-0 flex-1 justify-start gap-2 overflow-hidden rounded-[calc(var(--radius-sm)+7px)] p-1.5"
              onClick={() => void upload()}
            >
              {fill.url ? (
                <img src={fill.url} alt="" className="h-11 w-11 shrink-0 rounded object-contain" />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded bg-muted">
                  <ImageUp />
                </span>
              )}
              {fill.url ? 'Replace' : (edits.uploadLabel ?? 'Upload image')}
            </Button>
            {fill.url && edits.removeImage && (
              <IconButton label="Remove image" onClick={edits.removeImage}>
                <X />
              </IconButton>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** A fill as one row, Figma's way: its swatch and what it is, `name` saying whose fill it is; a click opens its panel */
function FillRow({ name, fill, edits }: { name: string; fill: Fill; edits: FillEdits }) {
  return (
    <FillPanel fill={fill} edits={edits} trigger={
      <Button variant="outline" size="sm" aria-label={`${name}: ${fillName(fill)}`}
        className="h-8 w-full justify-start gap-2 rounded-lg px-1.5 font-normal data-[popup-open]:border-ring">
        <FillSwatch fill={fill} />
        <span className={cn('truncate', fill.kind === 'color' && 'tabular-nums')}>{fillName(fill)}</span>
      </Button>
    } />
  )
}

/** A frame's fill and how to change it; an image it had comes back when Image is picked again */
function frameFill(noteRef: NoteRef, frame: Frame, url: string | undefined): { fill: Fill; edits: FillEdits } {
  return {
    fill: { kind: frame.kind, color: frame.color, url },
    edits: {
      setKind: (kind) => updateFrame(noteRef, frame.id, { kind }),
      setColor: (color) => updateFrame(noteRef, frame.id, { color }),
      addImage: (file) => replaceFrameImage(noteRef, frame.id, file),
    },
  }
}

/** A frame's fill row, under Fill in the right panels */
export function FrameFillRow({ noteRef, frame }: { noteRef: NoteRef; frame: Frame }) {
  const url = useImageUrl(frame.kind === 'image' ? frame.imageId : undefined)
  return <FillRow name="Fill" {...frameFill(noteRef, frame, url)} />
}

/** A frame's fill panel, opened from somewhere else: the pencil on its clip in the timeline */
export function FrameFillPanel({ noteRef, frame, ...place }: { noteRef: NoteRef; frame: Frame } & PanelPlace) {
  const url = useImageUrl(frame.kind === 'image' ? frame.imageId : undefined)
  return <FillPanel {...frameFill(noteRef, frame, url)} {...place} />
}

/**
 * The banknote's background, chosen as a frame's fill is (Keller: the same everywhere): its colour, or its design, an
 * image that can be removed again, which falls back to the colour
 */
export function BackgroundFillRow({ note, noteRef }: { note: Note; noteRef: NoteRef }) {
  const url = useImageUrl(note.faceImageId)
  const set = (patch: Partial<Note>) => updateNote(noteRef.projectId, noteRef.noteId, (n) => ({ ...n, ...patch }))
  return (
    <FillRow
      name="Background"
      fill={{ kind: note.background === 'image' ? 'image' : 'color', color: note.color, url }}
      edits={{
        setKind: (kind) => set({ background: kind === 'image' ? 'image' : 'solid' }),
        setColor: (color) => set({ color }),
        addImage: (file) => setFaceImage(noteRef, file),
        removeImage: () => void setFaceImage(noteRef, undefined).catch(reportError),
        uploadLabel: 'Upload design',
      }}
    />
  )
}
