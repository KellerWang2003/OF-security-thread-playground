import { Panel, Segmented } from '../components/controls'
import type { Side } from '../lib/back'
import { turnOver, useTilt } from '../tilt/tilt'

const SIDES: { value: Side; label: string }[] = [{ value: 'front', label: 'Front' }, { value: 'back', label: 'Back' }]

/**
 * Front | Back at the top of the canvas, in the middle of the workspace (Keller, 4 November: on the tilt card it was
 * far too hidden): every banknote turned over to its back, or round to its front, as F does. Not in Thread Studio, as
 * the thread is only on the front.
 */
export function SideSwitch() {
  const side: Side = useTilt((s) => (s.flipped ? 'back' : 'front'))
  return (
    <div className="pointer-events-none absolute top-3 right-[calc(var(--panel-w)+20px)] left-3 flex justify-center">
      <Panel className="pointer-events-auto flex h-11 items-center p-1.5">
        <div className="w-44" title="Turn every banknote over (F)">
          <Segmented value={side} options={SIDES} onChange={(next) => turnOver(next === 'back')} />
        </div>
      </Panel>
    </div>
  )
}
