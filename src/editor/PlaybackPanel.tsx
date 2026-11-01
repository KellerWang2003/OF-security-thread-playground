import { Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IconButton, ScrubField } from '../components/controls'
import { cn } from '@/lib/utils'
import { SWEEP_MAX, type LensState } from '../lib/lens'
import {
  MOVES_MAX,
  MOVE_KINDS,
  editableMoves,
  gestureSeconds,
  moveFromRecording,
  moveReach,
  swingEnds,
  movesAxes,
  movesOf,
  newMove,
  playbackPlan,
} from '../lib/moves'
import { HOLD_LIMITS, PLAYBACK_CURVES, SPEED_LIMITS, playbackEase, playbackSettings } from '../lib/playback'
import type { PlaybackCurve, PlaybackMove, Recording, TiltSettings } from '../lib/types'
import { saveTilt } from './playbackActions'

const presetName = (kind: PlaybackMove['kind']) => MOVE_KINDS.find((k) => k.value === kind)?.label.slice(2) ?? 'Move'

/**
 * Playback settings: one list of moves (presets, then saved recordings) on the left, added to the playlist on the right, which
 * plays in order and loops; the motion and frame settings sit under the playlist.
 */
export function PlaybackPanel({ projectId, tilt, lens }: { projectId: string; tilt: TiltSettings; lens: LensState }) {
  const moves = movesOf(tilt, lens)
  const recordings = tilt.recordings ?? []
  const full = moves.length >= MOVES_MAX
  const set = (patch: Partial<TiltSettings>) => saveTilt(projectId, patch)
  const add = (move: PlaybackMove) => { if (!full) set({ moves: [...editableMoves(tilt, lens), move] }) }
  const editMoves = (change: (list: PlaybackMove[]) => PlaybackMove[]) => set({ moves: change(editableMoves(tilt, lens)) })
  const removeRecording = (id: string) => {
    const left = editableMoves(tilt, lens).filter((m) => m.recordingId !== id)
    set({ recordings: recordings.filter((r) => r.id !== id), moves: left.length ? left : [newMove('y')] })
  }
  const loopSeconds = playbackPlan(tilt, lens).seconds
  // Dragging a row's number reorders the playlist: the dragged row follows the pointer, the others make room
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null)
  const shiftFor = (i: number) => {
    if (!drag) return 0
    if (i === drag.from) return drag.dy
    const to = Math.max(0, Math.min(moves.length - 1, drag.from + Math.round(drag.dy / ROW_PITCH)))
    if (drag.from < i && i <= to) return -ROW_PITCH
    if (to <= i && i < drag.from) return ROW_PITCH
    return 0
  }

  return (
    <div className="flex h-[400px]">
      <aside className="flex w-[184px] shrink-0 flex-col border-r bg-muted/40 p-3">
        <Section title="Moves" className="min-h-0 flex-1">
          <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {MOVE_KINDS.map((k) => (
              <LibraryRow key={k.value} name={presetName(k.value)} disabled={full} onAdd={() => add(newMove(k.value))} />
            ))}
            {recordings.map((r) => (
              <LibraryRow key={r.id} name={r.name} seconds={gestureSeconds(r)} disabled={full} onAdd={() => add(moveFromRecording(r))} onDelete={() => removeRecording(r.id)} />
            ))}
          </ul>
        </Section>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-3">
        <Section title="Playlist" className="min-h-0 flex-1" aside={<span className="tabular-nums" title="Time for the whole playlist, including holds">{Math.round(loopSeconds * 10) / 10} s loop</span>}>
          <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-lg bg-muted/50 p-1.5">
            {moves.map((move, i) => (
              <PlaylistRow
                key={move.id}
                index={i}
                count={moves.length}
                move={move}
                lens={lens}
                recordings={recordings}
                shift={shiftFor(i)}
                dragging={drag?.from === i}
                onChange={(next) => editMoves((list) => list.map((m, j) => (j === i ? next(m) : m)))}
                onDrag={(dy) => setDrag(dy === null ? null : { from: i, dy })}
                onDrop={(dy) => {
                  setDrag(null)
                  const to = Math.max(0, Math.min(moves.length - 1, i + Math.round(dy / ROW_PITCH)))
                  if (to !== i) editMoves((list) => {
                    const copy = [...list]
                    const [m] = copy.splice(i, 1)
                    copy.splice(to, 0, m)
                    return copy
                  })
                }}
                onRemove={() => editMoves((list) => list.filter((_, j) => j !== i))}
              />
            ))}
          </ol>
        </Section>
        <MotionSettings tilt={tilt} set={set} />
      </div>
    </div>
  )
}

function Section({ title, aside, className, children }: { title: string; aside?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-medium tracking-wide uppercase">{title}</span>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** One move to add to the playlist: a preset, or a recording, which can also be deleted */
function LibraryRow({ name, seconds, disabled, onAdd, onDelete }: {
  name: string
  seconds?: number
  disabled: boolean
  onAdd: () => void
  onDelete?: () => void
}) {
  return (
    <li className="group flex h-8 shrink-0 items-center gap-1 rounded-md pr-0.5 pl-2 hover:bg-background">
      <button type="button" disabled={disabled} onClick={onAdd} title="Add to the playlist"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs outline-none disabled:opacity-50">
        <span className="truncate">{name}</span>
        {seconds !== undefined && <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(seconds * 10) / 10} s</span>}
      </button>
      {onDelete && <IconButton label="Delete recording" size="icon-xs" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={onDelete}><Trash2 /></IconButton>}
      <IconButton label="Add to playlist" size="icon-xs" disabled={disabled} onClick={onAdd}><Plus /></IconButton>
    </li>
  )
}

/** Row height plus the gap between rows, in px */
const ROW_PITCH = 44

function PlaylistRow({ index, count, move, lens, recordings, shift, dragging, onChange, onDrag, onDrop, onRemove }: {
  index: number
  count: number
  move: PlaybackMove
  lens: LensState
  recordings: Recording[]
  shift: number
  dragging: boolean
  onChange: (change: (m: PlaybackMove) => PlaybackMove) => void
  onDrag: (dy: number | null) => void
  onDrop: (dy: number) => void
  onRemove: () => void
}) {
  const start = useRef<number | null>(null)
  const reach = moveReach(move, lens)
  const ends = swingEnds(move, lens)
  const axes = movesAxes(move)
  const name = move.kind === 'gesture' ? (recordings.find((r) => r.id === move.recordingId)?.name ?? 'Recording') : presetName(move.kind)
  return (
    <li
      className={cn('relative flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-background px-1.5 shadow-xs', dragging ? 'z-10 shadow-md' : 'transition-transform')}
      style={shift ? { transform: `translateY(${shift}px)` } : undefined}
    >
      <span
        role="button"
        tabIndex={-1}
        aria-label={`Drag to reorder ${name}`}
        title="Drag to reorder"
        className={cn('flex h-full w-4 shrink-0 touch-none items-center justify-center text-[10px] text-muted-foreground tabular-nums select-none hover:text-foreground', count > 1 && (dragging ? 'cursor-grabbing' : 'cursor-grab'))}
        onPointerDown={(e) => {
          if (e.button !== 0 || count < 2) return
          e.currentTarget.setPointerCapture(e.pointerId)
          start.current = e.clientY
          onDrag(0)
        }}
        onPointerMove={(e) => { if (start.current !== null) onDrag(e.clientY - start.current) }}
        onPointerUp={(e) => {
          if (start.current === null) return
          const dy = e.clientY - start.current
          start.current = null
          onDrop(dy)
        }}
        onPointerCancel={() => { start.current = null; onDrag(null) }}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1 truncate text-xs">
        {name}
        {move.kind === 'gesture' && <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">{Math.round(gestureSeconds(move) * 10) / 10} s</span>}
      </div>
      {(move.kind === 'y' || move.kind === 'x') && (
        <ScrubField className="w-[70px] shrink-0" label={move.kind === 'y' ? '↕' : '↔'}
          title={move.kind === 'y' ? 'Up/down tilt the move starts from; negative tilts down' : 'Side tilt the move starts from; negative tilts left'}
          value={Math.round(move.kind === 'y' ? ends.start.y : ends.start.x)} min={-SWEEP_MAX} max={SWEEP_MAX} unit="°"
          onChange={(from) => onChange((m) => ({ ...m, from, [m.kind]: m.kind === 'y' ? ends.end.y : ends.end.x }))} />
      )}
      {axes.includes('y') && (
        <ScrubField className="w-[70px] shrink-0" label={move.kind === 'y' ? '→' : '↕'} title="Up/down tilt this move reaches; negative tilts down"
          value={Math.round(move.kind === 'y' ? ends.end.y : reach.y)} min={-SWEEP_MAX} max={SWEEP_MAX} unit="°"
          onChange={(y) => onChange((m) => (m.kind === 'y' ? { ...m, y, from: ends.start.y } : { ...m, y }))} />
      )}
      {axes.includes('x') && (
        <ScrubField className="w-[70px] shrink-0" label={move.kind === 'x' ? '→' : '↔'} title="Side tilt this move reaches; negative tilts left"
          value={Math.round(move.kind === 'x' ? ends.end.x : reach.x)} min={-SWEEP_MAX} max={SWEEP_MAX} unit="°"
          onChange={(x) => onChange((m) => (m.kind === 'x' ? { ...m, x, from: ends.start.x } : { ...m, x }))} />
      )}
      <IconButton label="Remove" size="icon-xs" disabled={count <= 1} onClick={onRemove}><X /></IconButton>
    </li>
  )
}

function curvePath(curve: PlaybackCurve) {
  return Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${2 + i * 2},${22 - 20 * playbackEase(i / 40, curve)}`).join(' ')
}

/** Speed, holds and curve shape how every move travels; fade is how frames blend */
function MotionSettings({ tilt, set }: { tilt: TiltSettings; set: (patch: Partial<TiltSettings>) => void }) {
  const { speed, curve, holdSeconds } = playbackSettings(tilt)
  return (
    <Section title="Motion">
      <div className="grid grid-cols-2 gap-1.5">
        <ScrubField label="Speed" title="Playback speed multiplier; 1× takes one second each way" value={speed} {...SPEED_LIMITS} unit="×" onChange={(next) => set({ speed: next })} />
        <ScrubField label="Hold" title="Pause at flat and at full tilt, in seconds at each end" value={holdSeconds} {...HOLD_LIMITS} unit="s" onChange={(next) => set({ holdSeconds: next })} />
        <Select value={curve} items={PLAYBACK_CURVES} onValueChange={(next) => { if (next) set({ curve: next }) }}>
          <SelectTrigger aria-label="Playback curve" size="sm" className="h-8 w-full text-xs">
            <svg viewBox="0 0 84 24" className="h-4 w-8 shrink-0 text-foreground" aria-hidden>
              <path d={curvePath(curve)} fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {PLAYBACK_CURVES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <ScrubField label="Fade" title="How much neighbouring frames blend into each other" value={Math.round(tilt.transition * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => set({ transition: v / 100 })} />
      </div>
    </Section>
  )
}
