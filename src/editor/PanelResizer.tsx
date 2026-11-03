import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { PANEL_WIDTH, savePanelWidth, setPanelWidth, usePanelWidth } from '../lib/panelWidth'

/**
 * The panel's left edge: drag it to make the panel wider for controls that need finer placement,
 * double-click to go back to the default width. The width is remembered.
 */
export function PanelResizer({ className }: { className?: string }) {
  const width = usePanelWidth((s) => s.width)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      title="Drag to resize the panel, double-click to reset"
      className={cn('group absolute top-3 bottom-3 z-10 w-3 translate-x-1/2 cursor-col-resize touch-none', className)}
      style={{ right: `calc(${width}px + 12px)` }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { startX: e.clientX, startWidth: width }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d) setPanelWidth(d.startWidth + d.startX - e.clientX)
      }}
      onPointerUp={() => {
        if (drag.current) savePanelWidth()
        drag.current = null
      }}
      onLostPointerCapture={() => {
        if (drag.current) savePanelWidth()
        drag.current = null
      }}
      onDoubleClick={() => {
        setPanelWidth(PANEL_WIDTH.initial)
        savePanelWidth()
      }}
    >
      <div className="absolute inset-y-6 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-primary/0 transition-colors group-hover:bg-primary/50 group-active:bg-primary" />
    </div>
  )
}
