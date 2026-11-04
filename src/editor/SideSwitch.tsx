import { cn } from '@/lib/utils'
import { Panel, Segmented } from '../components/controls'
import type { Side } from '../lib/back'
import { turnOver, useTilt } from '../tilt/tilt'

const SIDES: { value: Side; label: string }[] = [{ value: 'front', label: 'Front' }, { value: 'back', label: 'Back' }]

/**
 * Front | Back at the top of the canvas (Keller, 4 November: on the tilt card it was far too hidden): every banknote
 * turned over to its back, or round to its front, as F does. Centred in the width the canvas has free (Keller): left
 * of the right panel while a banknote is selected, across the whole window once it has gone, gliding between the two
 * rather than jumping (Keller). Not in Thread Studio, as the thread is only on the front.
 */
export function SideSwitch({ besidePanel }: { besidePanel: boolean }) {
  const side: Side = useTilt((s) => (s.flipped ? 'back' : 'front'))
  return (
    <div className={cn('pointer-events-none absolute top-3 left-3 flex justify-center transition-[right] duration-200 ease-out', besidePanel ? 'right-[calc(var(--panel-w)+20px)]' : 'right-3')}>
      <Panel className="pointer-events-auto flex h-11 items-center p-1.5">
        <div className="w-44" title="Turn every banknote over (F)">
          <Segmented value={side} options={SIDES} onChange={(next) => turnOver(next === 'back')} />
        </div>
      </Panel>
    </div>
  )
}
