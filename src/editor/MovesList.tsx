import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IconButton, ScrubField } from '../components/controls'
import { SWEEP_MAX, type LensState } from '../lib/lens'
import { MOVES_MAX, MOVE_KINDS, editableMoves, gestureSeconds, moveReach, movesAxes, movesOf, newMove } from '../lib/moves'
import type { PlaybackMove, TiltSettings } from '../lib/types'
import { saveMoves } from './playbackActions'

/** Playback moves, played in order and looped. Each row is a preset move or a recorded gesture. */
export function MovesList({ projectId, tilt, lens }: { projectId: string; tilt: TiltSettings; lens: LensState }) {
  const moves = movesOf(tilt, lens)
  const edit = (index: number, change: ((m: PlaybackMove) => PlaybackMove) | null) => {
    const list = editableMoves(tilt, lens)
    saveMoves(projectId, change ? list.map((m, i) => (i === index ? change(m) : m)) : list.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Moves</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-xs" aria-label="Add move" title="Add move" disabled={moves.length >= MOVES_MAX} />}
          >
            <Plus />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {MOVE_KINDS.map((k) => (
              <DropdownMenuItem key={k.value} onClick={() => saveMoves(projectId, [...editableMoves(tilt, lens), newMove(k.value)])}>
                {k.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ol className="space-y-1">
        {moves.map((move, i) => (
          <MoveRow key={move.id} index={i} move={move} lens={lens} removable={moves.length > 1} onChange={(change) => edit(i, change)} />
        ))}
      </ol>
    </div>
  )
}

function MoveRow({ index, move, lens, removable, onChange }: {
  index: number
  move: PlaybackMove
  lens: LensState
  removable: boolean
  onChange: (change: ((m: PlaybackMove) => PlaybackMove) | null) => void
}) {
  const reach = moveReach(move, lens)
  const axes = movesAxes(move)
  const kinds: { value: PlaybackMove['kind']; label: string }[] = move.kind === 'gesture'
    ? [{ value: 'gesture', label: `● Recording · ${Math.round(gestureSeconds(move) * 10) / 10} s` }, ...MOVE_KINDS]
    : MOVE_KINDS
  return (
    <li className="flex items-center gap-1">
      <span className="w-3 shrink-0 text-center text-[10px] text-muted-foreground tabular-nums">{index + 1}</span>
      <Select
        value={move.kind}
        items={kinds}
        onValueChange={(kind) => {
          // A preset replaces a recording outright; picking the recording again is a no-op
          if (kind && kind !== 'gesture') onChange((m) => ({ id: m.id, kind, x: m.x, y: m.y }))
        }}
      >
        <SelectTrigger aria-label={`Move ${index + 1}`} size="sm" className="h-8 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {kinds.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {move.kind !== 'gesture' && (
        <>
          {axes.includes('y') && (
            <ScrubField
              className="w-[68px] shrink-0"
              label="↕"
              title="Up/down tilt this move reaches; negative tilts down"
              value={Math.round(reach.y)}
              min={-SWEEP_MAX}
              max={SWEEP_MAX}
              unit="°"
              onChange={(y) => onChange((m) => ({ ...m, y }))}
            />
          )}
          {axes.includes('x') && (
            <ScrubField
              className="w-[68px] shrink-0"
              label="↔"
              title="Side tilt this move reaches; negative tilts left"
              value={Math.round(reach.x)}
              min={-SWEEP_MAX}
              max={SWEEP_MAX}
              unit="°"
              onChange={(x) => onChange((m) => ({ ...m, x }))}
            />
          )}
        </>
      )}
      <IconButton label="Remove move" size="icon-xs" variant="ghost" disabled={!removable} onClick={() => onChange(null)}>
        <X />
      </IconButton>
    </li>
  )
}
