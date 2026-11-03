import { ImageUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Group, IconButton, ScrubField, Section, SwitchField } from '../components/controls'
import { reportError } from '../cloud/notices'
import { pickFiles, useImageUrl } from '../lib/images'
import { useReading } from '../lib/relief'
import type { Note, Watermark, WatermarkLevels } from '../lib/types'
import {
  FULL_LEVELS, LEVELS_GAP, WATERMARK_MIN_MM, WATERMARK_STEP, gammaAt, maxWatermarkWidth, midtonesAt, resizeWatermark,
} from '../lib/watermark'
import type { NoteRef } from './frameActions'
import { setWatermarkImage, updateWatermark } from './watermarkActions'

/**
 * Right, under the Watermark tab: the selected banknote's watermark. One image, read only by brightness, as paper has no
 * colour: its light parts are thinner paper that lets more light through, or its dark parts with Invert. Its levels,
 * Auto or by hand, then shape how thin. Where it sits and how strongly it shows. Removing it is beside the tabs.
 */
export function WatermarkPanel({ note, watermark, noteRef, onPlace }: {
  note: Note
  watermark: Watermark
  noteRef: NoteRef
  /** Shows it on the canvas, flat and clear, to place it */
  onPlace: () => void
}) {
  const image = useImageUrl(watermark.imageId)
  const reading = useReading(watermark)
  // By hand, or Auto's for the image as read
  const levels = watermark.levels ?? reading?.auto
  const change = (next: (w: Watermark, n: Note) => Watermark) => updateWatermark(noteRef, next)

  return (
    <Group>
      <Section nested>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-[58px] flex-1 justify-start gap-2 overflow-hidden rounded-[calc(var(--radius-sm)+7px)] p-1.5"
            onClick={async () => {
              try {
                const [file] = await pickFiles()
                if (!file) return
                await setWatermarkImage(noteRef, file)
                onPlace()
              } catch (error) { reportError(error) }
            }}
          >
            {image ? (
              // In greyscale, as only its brightness counts
              <img src={image} alt="" className="h-11 w-11 shrink-0 rounded bg-muted object-contain grayscale" />
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center rounded bg-muted">
                <ImageUp />
              </span>
            )}
            {image ? 'Replace' : 'Upload image'}
          </Button>
          {watermark.imageId && (
            <IconButton label="Remove image" onClick={() => void setWatermarkImage(noteRef, undefined)}>
              <X />
            </IconButton>
          )}
        </div>
        {watermark.imageId && (
          <>
            <SwitchField label="Invert" checked={watermark.invert === true} onChange={(on) => change((w) => ({ ...w, invert: on }))} />
            {/* Off, it keeps the levels Auto had, to set by hand; moving a handle turns it off too */}
            <SwitchField label="Auto levels" title="Levels fitted to the image" checked={!watermark.levels}
              onChange={(on) => change(({ levels: _byHand, ...w }) => (on ? w : { ...w, levels: levels ?? FULL_LEVELS }))} />
            <LevelsSlider levels={levels} onChange={(next) => change((w) => ({ ...w, levels: next }))} />
          </>
        )}
      </Section>

      <Section nested>
        <div className="grid grid-cols-2 gap-2">
          <ScrubField label="X" title="Watermark position from the left edge" value={watermark.xMm} min={0} max={Math.max(0, note.widthMm - watermark.widthMm)}
            step={WATERMARK_STEP} unit="mm" onChange={(xMm) => change((w) => ({ ...w, xMm }))} />
          <ScrubField label="Y" title="Watermark position from the top edge" value={watermark.yMm} min={0} max={Math.max(0, note.heightMm - watermark.heightMm)}
            step={WATERMARK_STEP} unit="mm" onChange={(yMm) => change((w) => ({ ...w, yMm }))} />
          <ScrubField label="W" title="Watermark width; its height follows the image" value={Math.round(watermark.widthMm * 100) / 100} min={WATERMARK_MIN_MM}
            max={maxWatermarkWidth(watermark, note)} step={WATERMARK_STEP} unit="mm" onChange={(widthMm) => change((w, n) => resizeWatermark(w, widthMm, n))} />
          <ScrubField label="Depth" title="How strongly the watermark shows at its clearest, tilted or held to the light" value={Math.round(watermark.depth * 100)} min={0} max={100}
            step={5} unit="%" onChange={(depth) => change((w) => ({ ...w, depth: depth / 100 }))} />
        </div>
      </Section>
    </Group>
  )
}

/** The levels slider's handles, left to right */
const HANDLES = ['Where the watermark starts', 'Midtones', 'Where it is thinnest']
/** Black, grey and white handles, as in Photoshop's Levels */
const HANDLE_TONES = ['bg-neutral-900', 'bg-neutral-500', undefined]

/** A share 0 to 1 from the slider's percent, without float dust */
const share = (percent: number) => Math.round(percent * 10) / 1000

/**
 * Levels on how thin the paper is: where the watermark starts (anything fainter stays plain paper), its midtones, and
 * where it reaches the thinnest paper. The midtones handle keeps its place between the ends as they move.
 */
function LevelsSlider({ levels, onChange }: { levels: WatermarkLevels | undefined; onChange: (levels: WatermarkLevels) => void }) {
  const { low, high, gamma } = levels ?? FULL_LEVELS
  const percent = (x: number) => Math.round(x * 1000) / 10
  return (
    <Slider
      value={[percent(low), percent(low + (high - low) * midtonesAt(gamma)), percent(high)]}
      min={0}
      max={100}
      step={1}
      minStepsBetweenValues={1}
      disabled={!levels}
      thumbLabel={(i) => HANDLES[i]}
      thumbClassName={(i) => HANDLE_TONES[i]}
      onValueChange={(value, { activeThumbIndex: i }) => {
        if (!levels || !Array.isArray(value)) return
        const [lo, mid, hi] = value.map(share)
        if (i === 0) onChange({ ...levels, low: Math.min(lo, high - LEVELS_GAP) })
        else if (i === 2) onChange({ ...levels, high: Math.max(hi, low + LEVELS_GAP) })
        else onChange({ ...levels, gamma: gammaAt((mid - low) / (high - low)) })
      }}
    />
  )
}
