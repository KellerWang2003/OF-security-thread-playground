import { ImageUp } from 'lucide-react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { reportError } from '../cloud/notices'
import { ColorField, Segmented } from '../components/controls'
import { FrameThumb } from '../components/NoteView'
import { pickFiles, useImageUrl } from '../lib/images'
import type { Frame } from '../lib/types'
import { replaceFrameImage, updateFrame, type NoteRef } from './frameActions'

/** No fill: a faint check, as empty thread shows in Thread Studio */
const CHECK = {
  backgroundImage: 'repeating-conic-gradient(color-mix(in oklab, var(--foreground) 14%, transparent) 0% 25%, transparent 0% 50%)',
  backgroundSize: '8px 8px',
}

/** A frame's fill as a small square, as Figma's fill swatch: its colour or its image, a check when it has none */
export function FillSwatch({ frame, className }: { frame: Frame; className?: string }) {
  return (
    <span className={cn('relative block size-5 shrink-0 overflow-hidden rounded border border-foreground/15 bg-background', className)} style={CHECK}>
      <FrameThumb frame={frame} />
    </span>
  )
}

/** What the fill row reads: the colour, or Image */
const fillName = (frame: Frame) => (frame.kind === 'color' ? frame.color.toUpperCase() : 'Image')

/**
 * A frame's fill, chosen in a panel of its own as Figma does (Keller, rather than pills laid out flat): what it is at
 * the panel's top, a Colour or an Image, then that fill's own settings. There is no background under the frames any
 * more (Keller): an empty frame shows the banknote through. `trigger` opens it: the fill row in the right panel, or the
 * swatch on the frame's clip in the timeline, which also gives an empty frame its first fill
 */
export function FillPopover({ noteRef, frame, trigger, side = 'left', align = 'start', onOpenChange }: {
  noteRef: NoteRef
  frame: Frame
  trigger: ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  onOpenChange?: (open: boolean) => void
}) {
  const set = (patch: Partial<Frame>) => updateFrame(noteRef, frame.id, patch)
  const url = useImageUrl(frame.kind === 'image' ? frame.imageId : undefined)
  const upload = async () => {
    try {
      const [file] = await pickFiles()
      if (file) await replaceFrameImage(noteRef, frame.id, file)
    } catch (error) { reportError(error) }
  }

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent side={side} align={align} sideOffset={8} className="w-60">
        <Segmented
          value={frame.kind}
          options={[
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
      </PopoverContent>
    </Popover>
  )
}

/** The fill as one row, Figma's way: its swatch and what it is; a click opens `FillPopover` */
export function FillRow({ noteRef, frame }: { noteRef: NoteRef; frame: Frame }) {
  return (
    <FillPopover noteRef={noteRef} frame={frame} trigger={
      <Button variant="outline" size="sm" aria-label={`Fill: ${fillName(frame)}`}
        className="h-8 w-full justify-start gap-2 rounded-lg px-1.5 font-normal data-[popup-open]:border-ring">
        <FillSwatch frame={frame} />
        <span className={cn('truncate', frame.kind === 'color' && 'tabular-nums')}>{fillName(frame)}</span>
      </Button>
    } />
  )
}
