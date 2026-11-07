import { ImageUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { reportError } from '../cloud/notices'
import { IconButton, Labeled } from '../components/controls'
import { sideImageId, type Side } from '../lib/back'
import { THUMB_PX, pickFiles, useImageUrl } from '../lib/images'
import { usePasteImage } from '../lib/pasteImages'
import type { Note } from '../lib/types'
import { turnOver } from '../tilt/tilt'
import { setBackImage, setFaceImage, type NoteRef } from './frameActions'

/**
 * The banknote's two sides, Front and Back side by side (Keller, 4 November: one under the other, each with its colour,
 * repeated itself): each a card showing its design, a click on it to upload or replace it, and × on its label to remove
 * it. There is no colour to pick: a side without a design is plain paper (`PAPER`), as banknotes have to use their
 * design (Keller). Working on either side turns the banknotes to it, so what changes is in sight.
 */
export function DesignCards({ note, noteRef }: { note: Note; noteRef: NoteRef }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <DesignCard note={note} noteRef={noteRef} side="front" />
      <DesignCard note={note} noteRef={noteRef} side="back" />
    </div>
  )
}

function DesignCard({ note, noteRef, side }: { note: Note; noteRef: NoteRef; side: Side }) {
  const imageId = sideImageId(note, side)
  const url = useImageUrl(imageId, THUMB_PX)
  const name = side === 'back' ? 'Back' : 'Front'
  const set = (file: File | undefined) => (side === 'back' ? setBackImage : setFaceImage)(noteRef, file)
  const upload = async () => {
    try {
      const [file] = await pickFiles()
      if (file) await set(file)
    } catch (error) { reportError(error) }
  }
  const turn = () => turnOver(side === 'back')
  // A design pasted over the card is working on its side too
  const paste = usePasteImage((file) => {
    turn()
    return set(file)
  })
  return (
    <div role="group" aria-label={name} className="min-w-0" onPointerDownCapture={turn} onFocusCapture={turn}>
      <Labeled
        label={name}
        action={imageId ? (
          <IconButton label="Remove design" size="icon-xs" className="size-5 text-muted-foreground" onClick={() => void set(undefined).catch(reportError)}>
            <X />
          </IconButton>
        ) : undefined}
      >
        <Button
          {...paste}
          variant="outline"
          className="h-[104px] w-full flex-col gap-1.5 overflow-hidden rounded-[calc(var(--radius-sm)+7px)] p-1.5 text-xs font-medium"
          onClick={() => void upload()}
        >
          {imageId && url ? (
            <img src={url} alt="" className="min-h-0 w-full flex-1 rounded object-contain" />
          ) : imageId && url === undefined ? (
            // The design still on its way: its place shimmers
            <Skeleton className="min-h-0 w-full flex-1 rounded" />
          ) : (
            <span className="flex min-h-0 w-full flex-1 items-center justify-center rounded bg-muted">
              {!imageId && <ImageUp className="size-4" />}
            </span>
          )}
          {imageId ? 'Replace' : 'Upload design'}
        </Button>
      </Labeled>
    </div>
  )
}
