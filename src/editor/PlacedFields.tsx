import { ImageUp, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IconButton, Labeled, LengthField } from '../components/controls'
import { reportError } from '../cloud/notices'
import { THUMB_PX, pickFiles, useImageUrl } from '../lib/images'
import { PLACE_MIN_MM, PLACE_STEP, type PlacedBox, boxRange, maxBoxWidth, resizeBox } from '../lib/placed'
import type { Note } from '../lib/types'
import { showsBack, useTilt } from '../tilt/tilt'

/**
 * A placed layer's one image (the watermark's, magnetic ink's): Upload image, or Replace beside its thumbnail, and
 * Remove image after it
 */
export function LayerImage({ imageId, grayscale = false, onUpload, onRemove }: {
  imageId: string | undefined
  /** The thumbnail in greyscale, when only the image's brightness counts */
  grayscale?: boolean
  onUpload: (file: File) => Promise<void>
  onRemove: () => void
}) {
  const image = useImageUrl(imageId, THUMB_PX)
  return (
    <Labeled label="Image">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-[58px] flex-1 justify-start gap-2 overflow-hidden rounded-[calc(var(--radius-sm)+7px)] p-1.5"
          onClick={async () => {
            try {
              const [file] = await pickFiles()
              if (file) await onUpload(file)
            } catch (error) { reportError(error) }
          }}
        >
          {image ? (
            <img src={image} alt="" className={cn('h-11 w-11 shrink-0 rounded bg-muted object-contain', grayscale && 'grayscale')} />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded bg-muted">
              <ImageUp />
            </span>
          )}
          {image ? 'Replace' : 'Upload image'}
        </Button>
        {imageId && (
          <IconButton label="Remove image" onClick={onRemove}>
            <X />
          </IconButton>
        )}
      </div>
    </Labeled>
  )
}

/**
 * Where a placed layer sits: X and Y of its top-left corner and W, its height following its image (placed.ts). Typed
 * values are kept exactly, in any unit. `children` take the grid's fourth cell. With the banknotes turned over, the same
 * X is from the right edge, which is the front's left seen from the back (only the watermark shows there).
 */
export function PlaceFields<T extends PlacedBox>({ note, box, name, onChange, children }: {
  note: Note
  box: T
  /** The layer, as a title starts it: "Watermark" */
  name: string
  onChange: (change: (box: T, note: Note) => T) => void
  children?: ReactNode
}) {
  // It may hang off the edges, as long as a quarter of it stays on the banknote
  const range = boxRange(box, note)
  const edge = useTilt(showsBack) ? 'right' : 'left'
  return (
    <div className="grid grid-cols-2 gap-2">
      <Labeled label={`From ${edge}`}>
        <LengthField label="X" title={`${name} position from the ${edge} edge`} value={box.xMm} min={range.x[0]} max={range.x[1]}
          step={PLACE_STEP} onChange={(xMm) => onChange((b) => ({ ...b, xMm }))} />
      </Labeled>
      <Labeled label="From top">
        <LengthField label="Y" title={`${name} position from the top edge`} value={box.yMm} min={range.y[0]} max={range.y[1]}
          step={PLACE_STEP} onChange={(yMm) => onChange((b) => ({ ...b, yMm }))} />
      </Labeled>
      <Labeled label="Width">
        <LengthField label="W" title={`${name} width; its height follows the image`} value={box.widthMm} min={PLACE_MIN_MM}
          max={maxBoxWidth(box, note)} step={PLACE_STEP} onChange={(widthMm) => onChange((b, n) => resizeBox(b, widthMm, n))} />
      </Labeled>
      {children}
    </div>
  )
}
