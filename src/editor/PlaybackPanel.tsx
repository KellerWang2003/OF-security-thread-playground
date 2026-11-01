import { ArrowDown, ArrowUp, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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
                onChange={(next) => editMoves((list) => list.map((m, j) => (j === i ? next(m) : m)))}
                onMove={(by) => editMoves((list) => {
                  const copy = [...list]
                  const [m] = copy.splice(i, 1)
                  copy.splice(i + by, 0, m)
                  return copy
                })}
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

function PlaylistRow({ index, count, move, lens, recordings, onChange, onMove, onRemove }: {
  index: number
  count: number
  move: PlaybackMove
  lens: LensState
  recordings: Recording[]
  onChange: (change: (m: PlaybackMove) => PlaybackMove) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const reach = moveReach(move, lens)
  const axes = movesAxes(move)
  const name = move.kind === 'gesture' ? (recordings.find((r) => r.id === move.recordingId)?.name ?? 'Recording') : presetName(move.kind)
  return (
    <li className="flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-background px-1.5 shadow-xs">
      <span className="w-3 shrink-0 text-center text-[10px] text-muted-foreground tabular-nums">{index + 1}</span>
      <div className="min-w-0 flex-1 truncate text-xs">
        {name}
        {move.kind === 'gesture' && <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">{Math.round(gestureSeconds(move) * 10) / 10} s</span>}
      </div>
      {(move.kind === 'y' || move.kind === 'x') && (
        <ScrubField className="w-[70px] shrink-0" label={move.kind === 'y' ? '↕' : '↔'}
          title={move.kind === 'y' ? 'Up/down tilt the move starts from; negative tilts down' : 'Side tilt the move starts from; negative tilts left'}
          value={Math.round(move.from ?? 0)} min={-SWEEP_MAX} max={SWEEP_MAX} unit="°" onChange={(from) => onChange((m) => ({ ...m, from }))} />
      )}
      {axes.includes('y') && (
        <ScrubField className="w-[70px] shrink-0" label={move.kind === 'y' ? '→' : '↕'} title="Up/down tilt this move reaches; negative tilts down"
          value={Math.round(reach.y)} min={-SWEEP_MAX} max={SWEEP_MAX} unit="°" onChange={(y) => onChange((m) => ({ ...m, y }))} />
      )}
      {axes.includes('x') && (
        <ScrubField className="w-[70px] shrink-0" label={move.kind === 'x' ? '→' : '↔'} title="Side tilt this move reaches; negative tilts left"
          value={Math.round(reach.x)} min={-SWEEP_MAX} max={SWEEP_MAX} unit="°" onChange={(x) => onChange((m) => ({ ...m, x }))} />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`${name} options`} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp />Move up</DropdownMenuItem>
          <DropdownMenuItem disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown />Move down</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={count <= 1} onClick={onRemove}><X />Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
