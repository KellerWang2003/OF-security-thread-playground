import { ArrowDown, ArrowUp, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { IconButton, ScrubField } from '../components/controls'
import { SWEEP_MAX, type LensState, type Tilt2 } from '../lib/lens'
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
  planPath,
  playbackPlan,
} from '../lib/moves'
import { HOLD_LIMITS, PLAYBACK_CURVES, SPEED_LIMITS, playbackEase, playbackSettings } from '../lib/playback'
import type { PlaybackCurve, PlaybackMove, Recording, TiltSettings } from '../lib/types'
import { saveTilt } from './playbackActions'

const presetName = (kind: PlaybackMove['kind']) => MOVE_KINDS.find((k) => k.value === kind)?.label.slice(2) ?? 'Move'

/**
 * Playback settings: presets and saved recordings on the left, added to the playlist on the right, which
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
    <div className="flex gap-3">
      <div className="flex w-[176px] shrink-0 flex-col gap-3">
        <Section title="Presets">
          <div className="grid grid-cols-2 gap-1.5">
            {MOVE_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                disabled={full}
                title={`Add ${presetName(k.value).toLowerCase()} to the playlist`}
                onClick={() => add(newMove(k.value))}
                className="group flex flex-col items-center gap-1 rounded-md border border-transparent bg-muted/60 p-1.5 text-[11px] outline-none hover:border-border focus-visible:border-ring disabled:opacity-50"
              >
                <PathThumb path={pathOf({ id: k.value, kind: k.value }, tilt, lens)} limit={lens.viewDeg} className="size-10" />
                {presetName(k.value)}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Recordings">
          {recordings.length ? (
            <ul className="flex max-h-[168px] flex-col gap-1 overflow-y-auto">
              {recordings.map((r) => (
                <RecordingRow key={r.id} recording={r} tilt={tilt} lens={lens} disabled={full} onAdd={() => add(moveFromRecording(r))} onDelete={() => removeRecording(r.id)} />
              ))}
            </ul>
          ) : (
            <div className="rounded-md bg-muted/40 px-2 py-3 text-center text-[11px] text-muted-foreground">None yet</div>
          )}
        </Section>
      </div>

      <div className="w-px shrink-0 bg-border" />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Section title="Playlist" aside={<span className="tabular-nums" title="Time for the whole playlist, including holds">{Math.round(loopSeconds * 10) / 10} s loop</span>}>
          <ol className="flex flex-col gap-1">
            {moves.map((move, i) => (
              <PlaylistRow
                key={move.id}
                index={i}
                count={moves.length}
                move={move}
                tilt={tilt}
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

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{title}</span>
        {aside}
      </div>
      {children}
    </section>
  )
}

const pathOf = (move: PlaybackMove, tilt: TiltSettings, lens: LensState) => planPath(playbackPlan({ ...tilt, holdSeconds: 0, moves: [move] }, lens))

/** A move's path on a small tilt pad: centre is flat, up is tilting up */
function PathThumb({ path, limit, className }: { path: Tilt2[]; limit: number; className?: string }) {
  const reach = Math.max(limit, ...path.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
  const d = path.map((p, i) => `${i ? 'L' : 'M'}${(20 + (p.x / reach) * 16).toFixed(1)},${(20 - (p.y / reach) * 16).toFixed(1)}`).join(' ')
  return (
    <svg viewBox="0 0 40 40" className={cn('shrink-0 rounded bg-background/70 text-primary', className)} aria-hidden>
      <path d="M20 4V36M4 20H36" stroke="currentColor" strokeOpacity="0.12" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function RecordingRow({ recording, tilt, lens, disabled, onAdd, onDelete }: {
  recording: Recording
  tilt: TiltSettings
  lens: LensState
  disabled: boolean
  onAdd: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex items-center gap-1 rounded-md bg-muted/60 p-1 pr-0.5">
      <PathThumb path={pathOf(moveFromRecording(recording), tilt, lens)} limit={lens.viewDeg} className="size-7" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-xs">{recording.name}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">{Math.round(gestureSeconds(recording) * 10) / 10} s</div>
      </div>
      <IconButton label="Add to playlist" size="icon-xs" disabled={disabled} onClick={onAdd}><Plus /></IconButton>
      <IconButton label="Delete recording" size="icon-xs" onClick={onDelete}><Trash2 /></IconButton>
    </li>
  )
}

function PlaylistRow({ index, count, move, tilt, lens, recordings, onChange, onMove, onRemove }: {
  index: number
  count: number
  move: PlaybackMove
  tilt: TiltSettings
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
    <li className="flex items-center gap-1.5 rounded-md bg-muted/40 p-1">
      <span className="w-3 shrink-0 text-center text-[10px] text-muted-foreground tabular-nums">{index + 1}</span>
      <PathThumb path={pathOf(move, tilt, lens)} limit={lens.viewDeg} className="size-8" />
      <div className="min-w-0 flex-1 truncate text-xs">
        {name}
        {move.kind === 'gesture' && <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">{Math.round(gestureSeconds(move) * 10) / 10} s</span>}
      </div>
      {axes.includes('y') && (
        <ScrubField className="w-[64px] shrink-0" label="↕" title="Up/down tilt this move reaches; negative tilts down"
          value={Math.round(reach.y)} min={-SWEEP_MAX} max={SWEEP_MAX} unit="°" onChange={(y) => onChange((m) => ({ ...m, y }))} />
      )}
      {axes.includes('x') && (
        <ScrubField className="w-[64px] shrink-0" label="↔" title="Side tilt this move reaches; negative tilts left"
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
