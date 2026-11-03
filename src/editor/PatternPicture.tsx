import { useId } from 'react'
import { cn } from '@/lib/utils'
import { preparePattern } from '../lib/pattern'
import type { Note, ThreadPattern } from '../lib/types'

/**
 * A thread pattern as a little picture: each section's areas over `repeats` repeats along the thread (in the
 * thread's own direction), hatched at its ridge angle. The areas are stretched to fill the picture; the ridges keep
 * their angle. Gaps stay empty.
 */
export function PatternPicture({ note, pattern = note.pattern, width = 56, height = 40, repeats = 2, className }: {
  note: Pick<Note, 'frames' | 'tilt' | 'pattern' | 'thread'>
  /** Another pattern for this banknote, such as a preset's */
  pattern?: ThreadPattern
  width?: number
  height?: number
  repeats?: number
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const { sections, pattern: p } = preparePattern(pattern === note.pattern ? note : { ...note, pattern })
  const vertical = note.thread.direction === 'vertical'
  const length = repeats * p.repeatMm
  const box = (s: ThreadPattern['sections'][number], k: number) => {
    const along0 = ((k * p.repeatMm + s.startMm) / length) * (vertical ? height : width)
    const along1 = ((k * p.repeatMm + s.endMm) / length) * (vertical ? height : width)
    const across0 = s.acrossStart * (vertical ? width : height), across1 = s.acrossEnd * (vertical ? width : height)
    return vertical
      ? { x: across0, y: along0, width: across1 - across0, height: along1 - along0 }
      : { x: along0, y: across0, width: along1 - along0, height: across1 - across0 }
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden
      className={cn('shrink-0 overflow-hidden rounded-[3px] bg-muted', className)}>
      <defs>
        {sections.map((s, i) => (
          <pattern key={s.section.id} id={`${uid}-${i}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform={`rotate(${-s.angle})`}>
            <line x1="0" y1="2" x2="4" y2="2" stroke="currentColor" strokeWidth="1.3" />
          </pattern>
        ))}
      </defs>
      {Array.from({ length: repeats }, (_, k) => sections.map((s, i) => (
        <rect key={`${k}-${s.section.id}`} {...box(s.section, k)} fill={`url(#${uid}-${i})`} className="text-foreground/75 stroke-background" strokeWidth="1" />
      )))}
    </svg>
  )
}
