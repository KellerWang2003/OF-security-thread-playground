import { useRef, useState } from 'react'
import { NoteView } from '../components/NoteView'
import { cn } from '../lib/cn'
import { clamp, formatDeg } from '../lib/frames'
import type { Project } from '../lib/types'
import { setTilt, useTilt, useTiltLoop } from '../tilt/tilt'
import { addImageFrames } from './frameActions'
import { useElementSize } from './useElementSize'

const PADDING = 120

/** The note in the middle of the editor: drag on it to tilt, drop images on it to add frames */
export function Stage({ project }: { project: Project }) {
  const ref = useRef<HTMLDivElement>(null)
  const size = useElementSize(ref)
  const drag = useRef<{ x: number; y: number; start: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dropping, setDropping] = useState(false)
  const { note, tilt } = project
  const { angle, source, zoom, perspective, sheen } = useTilt()
  useTiltLoop(tilt.rangeDeg)

  const fit = size
    ? Math.max(0.5, Math.min((size.width - PADDING) / note.widthMm, (size.height - PADDING) / note.heightMm))
    : 0
  const scale = fit * zoom
  const vertical = tilt.axis === 'vertical'

  return (
    <div
      ref={ref}
      className={cn(
        'relative flex flex-1 touch-none items-center justify-center overflow-hidden select-none',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
        dropping && 'bg-neutral-200/70',
      )}
      style={{ perspective: 1600 }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        const s = useTilt.getState()
        const start = s.source === 'drag' ? s.target : s.angle
        drag.current = { x: e.clientX, y: e.clientY, start }
        setDragging(true)
        setTilt({ source: 'drag', target: start })
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const delta = vertical ? drag.current.y - e.clientY : e.clientX - drag.current.x
        // About 160 px of drag sweeps half the range
        const target = clamp(drag.current.start + (delta * tilt.rangeDeg) / 160, -tilt.rangeDeg, tilt.rangeDeg)
        setTilt({ target })
      }}
      onPointerUp={() => {
        drag.current = null
        setDragging(false)
        if (useTilt.getState().springBack) setTilt({ target: 0 })
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDropping(false)
        void addImageFrames(project.id, Array.from(e.dataTransfer.files))
      }}
    >
      {scale > 0 && (
        <div className="flex flex-col items-center gap-3" style={{ transformStyle: 'preserve-3d' }}>
          <NoteView project={project} scale={scale} angle={angle} perspective={perspective} sheen={sheen} />
        </div>
      )}

      <div className="pointer-events-none absolute top-3 left-4 flex items-baseline gap-2 text-xs text-neutral-500">
        <span className="w-12 text-lg font-medium text-neutral-900 tabular-nums">{formatDeg(angle)}</span>
        <span>
          {source === 'wobble' ? 'Auto-wobble' : source === 'slider' ? 'Slider' : 'Drag'} ·{' '}
          {note.widthMm} × {note.heightMm} mm
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-neutral-400">
        {vertical ? 'Drag up and down' : 'Drag left and right'} to tilt · drop images here to add frames
      </div>
    </div>
  )
}
