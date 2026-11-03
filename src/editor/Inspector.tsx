import { reportError } from '../cloud/notices'
import { ImageUp, RectangleHorizontal, RectangleVertical, Share, Shuffle, Trash2, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ColorField, Group, IconButton, Panel, ScrubField, Section, Segmented, SwitchField } from '../components/controls'
import { clamp } from '../lib/frames'
import { pickFiles, useImageUrl } from '../lib/images'
import { NOTE_SIZE, THREAD_WIDTH } from '../lib/notes'
import { mod, patternOf } from '../lib/pattern'
import { setPatternOffset, shufflePatternOffset, usePatternOffsets } from '../lib/patternOffset'
import { windowReports } from '../lib/patternRules'
import { updateNote } from '../lib/store'
import { fitSections } from '../lib/thread'
import type { Note } from '../lib/types'
import { fitWatermark, moveWatermarkTo } from '../lib/watermark'
import { EffectSection, LensMenu, ThreadPrint, type SetLens } from './EffectSection'
import { PanelResizer } from './PanelResizer'
import { WatermarkPanel } from './WatermarkPanel'
import { WindowsCard } from './WindowsCard'
import { setFaceImage, type NoteRef } from './frameActions'
import type { Layer } from './watermarkActions'

type Change = (note: Note) => Note

/**
 * Right: the selected banknote, one tab per part, as the Banknotes list has its layers: the banknote itself (size,
 * background), its security thread (placement, artwork, and its lens with the way into the thread editor) and its
 * watermark once it has one. The tab is the part picked: a click on the canvas or in the list turns to it, and turning
 * to a tab picks that part. One part at a time, so the panel never grows with features.
 */
export function Inspector({ note, noteRef, layer, onLayer, selectedWindowId, onWindowSelect, onExport, onEditThread, onPlaceWatermark, onRemoveWatermark }: {
  note: Note
  /** Picks a part of the banknote, as its row in the list does */
  onLayer: (layer: Layer) => void
  onExport: () => void
  /** Opens the thread editor, where the lens and the thread's sections are edited */
  onEditThread: () => void
  noteRef: NoteRef
  layer: Layer
  selectedWindowId?: string
  /** Selecting a window edits it on the canvas; undefined leaves window editing */
  onWindowSelect: (id: string | undefined) => void
  onPlaceWatermark: () => void
  onRemoveWatermark: () => void
}) {
  const update = (change: Change) => updateNote(noteRef.projectId, noteRef.noteId, change)
  const { thread } = note
  const threadLength = thread.direction === 'vertical' ? note.heightMm : note.widthMm
  const setThread = (patch: Partial<Note['thread']>) => update((n) => ({ ...n, thread: { ...n.thread, ...patch } }))
  const acrossOf = (n: Pick<Note, 'widthMm' | 'heightMm'>, direction: Note['thread']['direction']) =>
    direction === 'vertical' ? n.widthMm : n.heightMm
  const setSize = (widthMm: number, heightMm: number) =>
    update((n) => ({
      ...n,
      widthMm,
      heightMm,
      thread: { ...n.thread, positionMm: clamp(n.thread.positionMm, 0, acrossOf({ widthMm, heightMm }, n.thread.direction)),
        windows: { ...n.thread.windows, sections: fitSections(n.thread.windows.sections, n.thread.direction === 'vertical' ? heightMm : widthMm) } },
      ...(n.watermark ? { watermark: fitWatermark(n.watermark, { widthMm, heightMm }) } : {}),
    }))
  // Turning the thread keeps it at the same relative position across the note
  const setDirection = (direction: Note['thread']['direction']) =>
    update((n) => ({
      ...n,
      thread: {
        ...n.thread,
        direction,
        windows: { ...n.thread.windows, sections: fitSections(n.thread.windows.sections, direction === 'vertical' ? n.heightMm : n.widthMm) },
        positionMm: Math.round((n.thread.positionMm / acrossOf(n, n.thread.direction)) * acrossOf(n, direction) * 2) / 2,
      },
    }))
  // Turning the note keeps the thread at the same relative position across it
  const flipOrientation = () =>
    update((n) => {
      const flipped = { widthMm: n.heightMm, heightMm: n.widthMm }
      const across = acrossOf(n, n.thread.direction)
      const positionMm = Math.round((n.thread.positionMm / across) * acrossOf(flipped, n.thread.direction) * 2) / 2
      return { ...n, ...flipped, thread: { ...n.thread, positionMm, windows: { ...n.thread.windows, sections: fitSections(n.thread.windows.sections, n.thread.direction === 'vertical' ? flipped.heightMm : flipped.widthMm) } },
        ...(n.watermark ? { watermark: moveWatermarkTo(n.watermark, n, flipped) } : {}) }
    })
  const portrait = note.heightMm >= note.widthMm
  const background = useImageUrl(note.faceImageId)

  return (
    <>
    <PanelResizer />
    <Panel className="absolute top-3 right-3 bottom-3 flex w-(--panel-w) flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 py-2 pr-2 pl-4">
        <span className="truncate text-sm font-medium">{note.name}</span>
        <Button variant="outline" size="sm" onClick={onExport}><Share />Export</Button>
      </div>

      <Tabs value={layer} onValueChange={(next) => onLayer(next as Layer)} className="min-h-0 flex-1 gap-0">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 pr-2 pl-2.5">
        <TabsList variant="line" className="h-7">
          <TabsTrigger value="note" className="px-1.5 text-[13px]">Banknote</TabsTrigger>
          <TabsTrigger value="thread" className="px-1.5 text-[13px]">Thread</TabsTrigger>
          {note.watermark && <TabsTrigger value="watermark" className="px-1.5 text-[13px]">Watermark</TabsTrigger>}
        </TabsList>
        {layer === 'watermark' && note.watermark && (
          <IconButton label="Remove watermark" size="icon-xs" className="text-muted-foreground" onClick={onRemoveWatermark}><Trash2 /></IconButton>
        )}
      </div>

      <TabsContent value="note" className="min-h-0 overflow-y-auto">
      <Group>
      <Section nested>
        <Segmented
          value={portrait ? 'portrait' : 'landscape'}
          options={[
            { value: 'portrait', label: <RectangleVertical className="size-3.5" aria-label="Portrait" /> },
            { value: 'landscape', label: <RectangleHorizontal className="size-3.5" aria-label="Landscape" /> },
          ]}
          onChange={(next) => {
            if ((next === 'portrait') !== portrait) flipOrientation()
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <ScrubField label="W" value={note.widthMm} min={NOTE_SIZE.min} max={NOTE_SIZE.max} step={0.5} unit="mm" onChange={(w) => setSize(w, note.heightMm)} />
          <ScrubField label="H" value={note.heightMm} min={NOTE_SIZE.min} max={NOTE_SIZE.max} step={0.5} unit="mm" onChange={(h) => setSize(note.widthMm, h)} />
        </div>
      </Section>

      <Section nested>
        <Segmented
          value={note.background}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'image', label: 'Image' },
          ]}
          onChange={(mode) => update((n) => ({ ...n, background: mode }))}
        />
        {note.background === 'solid' ? (
          <ColorField value={note.color} onChange={(color) => update((n) => ({ ...n, color }))} />
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-[58px] flex-1 justify-start gap-2 overflow-hidden rounded-[calc(var(--radius-sm)+7px)] p-1.5"
              onClick={async () => {
                try {
                  const [file] = await pickFiles()
                  if (file) await setFaceImage(noteRef, file)
                } catch (error) { reportError(error) }
              }}
            >
              {background ? (
                <img src={background} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded bg-muted">
                  <ImageUp />
                </span>
              )}
              {background ? 'Replace' : 'Upload design'}
            </Button>
            {note.faceImageId && (
              <IconButton label="Remove image" onClick={() => void setFaceImage(noteRef, undefined)}>
                <X />
              </IconButton>
            )}
          </div>
        )}
      </Section>
      </Group>
      </TabsContent>

      <TabsContent value="thread" className="min-h-0 overflow-y-auto">
      <Group>
      <Section nested>
        <Segmented
          value={thread.direction}
          options={[
            { value: 'vertical', label: 'Vertical' },
            { value: 'horizontal', label: 'Horizontal' },
          ]}
          onChange={setDirection}
        />
        <div className="grid grid-cols-2 gap-2">
          <ScrubField
            label="T"
            title="Thread width vertically, or height horizontally"
            value={thread.widthMm}
            min={THREAD_WIDTH.min}
            max={THREAD_WIDTH.max}
            step={THREAD_WIDTH.step}
            unit="mm"
            onChange={(widthMm) => setThread({ widthMm })}
          />
          <ScrubField
            label={thread.direction === 'vertical' ? 'X' : 'Y'}
            title={thread.direction === 'vertical' ? 'Thread position from the left edge' : 'Thread position from the top edge'}
            value={thread.positionMm}
            min={0}
            max={acrossOf(note, thread.direction)}
            step={0.5}
            unit="mm"
            onChange={(positionMm) => setThread({ positionMm })}
          />
        </div>
        <WindowsCard note={note} noteRef={noteRef} selectedWindowId={selectedWindowId} onWindowSelect={onWindowSelect} />
      </Section>

      <Section nested title="Artwork">
        <SwitchField
          label="Background"
          checked={!!thread.backgroundColor}
          onChange={(enabled) => setThread({ backgroundColor: enabled ? '#ffffff' : undefined })}
        />
        {thread.backgroundColor && (
          <ColorField value={thread.backgroundColor} onChange={(backgroundColor) => setThread({ backgroundColor })} />
        )}
        <ScrubField
          label="Image gap"
          title="Space between complete image copies along the thread"
          value={thread.imageGapMm ?? 0}
          min={0}
          max={threadLength}
          step={0.5}
          unit="mm"
          onChange={(imageGapMm) => setThread({ imageGapMm })}
        />
      </Section>

      <LensEffect note={note} noteRef={noteRef} onEditThread={onEditThread} />
      <PrintOffset note={note} onWindowSelect={onWindowSelect} />
      </Group>
      </TabsContent>

      {note.watermark && (
        <TabsContent value="watermark" className="min-h-0 overflow-y-auto">
          <WatermarkPanel note={note} watermark={note.watermark} noteRef={noteRef} onPlace={onPlaceWatermark} />
        </TabsContent>
      )}
      </Tabs>
    </Panel>
    </>
  )
}

/**
 * The thread's lens, a section of the thread: Edit thread first, into the thread editor, then the lens's basic
 * controls and its preview (the tilt map, or the print), as in the thread editor. With mixed angles there is no one
 * lens to show, so the print of every section together.
 */
function LensEffect({ note, noteRef, onEditThread }: { note: Note; noteRef: NoteRef; onEditThread: () => void }) {
  const set: SetLens = (patch) => updateNote(noteRef.projectId, noteRef.noteId, (n) => ({ ...n, tilt: { ...n.tilt, ...patch } }))
  const edit = <Button size="sm" onClick={onEditThread}>Edit thread</Button>
  if (patternOf(note).mixed) {
    return (
      <Section nested title="Lens effect" action={<span className="text-[11px] text-muted-foreground" title="Mixed angles is on: each section plays its own lens">Mixed</span>}>
        {edit}
        <ThreadPrint note={note} />
      </Section>
    )
  }
  return <EffectSection note={note} set={set} title="Lens effect" action={<LensMenu note={note} set={set} />}>{edit}</EffectSection>
}

/**
 * Where the print lands along the thread. It isn't registered to the banknote, so this only previews one landing
 * (remembered per browser, never saved in the project): Shuffle tries another. Shown only when some section is
 * shorter than the repeat, since lanes look the same wherever they land. Windows that miss a tilt (or frames only one
 * tilt shows) at this landing are listed, rule 1; a click selects the window.
 */
function PrintOffset({ note, onWindowSelect }: { note: Note; onWindowSelect: (id: string | undefined) => void }) {
  const saved = usePatternOffsets((s) => s.offsets[note.id] ?? 0)
  const pattern = patternOf(note)
  const repeat = pattern.repeatMm
  if (!pattern.sections.some((s) => s.startMm > 1e-6 || s.endMm < repeat - 1e-6)) return null
  const misses = windowReports(note, saved).flatMap((w) => {
    const now = w.misses.filter((m) => m.now)
    if (!now.length) return []
    const share = Math.max(...w.misses.map((m) => m.share))
    return [{ id: w.windowId, text: `${w.label} misses ${now.map((m) => m.label).join(' · ')}`, title: `At ${Math.round(share * 100)}% of offsets` }]
  })
  return (
    <Section nested>
      <div className="flex items-center gap-1">
        <ScrubField className="flex-1" label="Offset" title="Where the print lands along the thread: a preview, not saved in the project"
          value={Math.round(mod(saved, repeat) * 10) / 10} min={0} max={repeat} step={0.1} unit="mm" onChange={(mm) => setPatternOffset(note.id, mm)} />
        <IconButton label="Shuffle the offset" onClick={() => shufflePatternOffset(note.id, repeat)}><Shuffle /></IconButton>
      </div>
      {misses.length > 0 && (
        <div className="flex flex-col">
          {misses.map((miss) => (
            <Button key={miss.id ?? 'thread'} variant="ghost" size="xs" title={miss.title}
              className="h-auto min-h-6 justify-start py-1 text-left leading-snug font-normal whitespace-normal text-amber-700 dark:text-amber-500"
              onClick={() => onWindowSelect(miss.id)}>
              <TriangleAlert />
              {miss.text}
            </Button>
          ))}
        </div>
      )}
    </Section>
  )
}
