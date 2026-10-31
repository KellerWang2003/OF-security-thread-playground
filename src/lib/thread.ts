import type { CSSProperties } from 'react'
import { clamp } from './frames'
import type { ThreadSettings, ThreadWindow, ThreadWindows } from './types'

export const WINDOW_STEP = 0.5
export const snapWindow = (value: number) => Math.round(value / WINDOW_STEP) * WINDOW_STEP
export const threadLength = (note: { widthMm: number; heightMm: number; thread: Pick<ThreadSettings, 'direction'> }) =>
  note.thread.direction === 'horizontal' ? note.widthMm : note.heightMm

/** Convert the former repeat/bridge/offset pattern into individual visible sections. */
export function migrateWindows(raw: unknown, lengthMm: number): ThreadWindows {
  const old = raw as Partial<ThreadWindows> & { windowMm?: number; gapMm?: number; offsetMm?: number } | undefined
  if (Array.isArray(old?.sections)) return { enabled: old.enabled ?? true, sections: fitSections(old.sections, lengthMm) }
  const open = Math.max(WINDOW_STEP, old?.windowMm ?? 8)
  const gap = Math.max(0, old?.gapMm ?? 6)
  const period = open + gap
  const phase = (((old?.offsetMm ?? 0) % period) + period) % period
  const sections: ThreadWindow[] = []
  if (gap === 0) sections.push({ id: crypto.randomUUID(), startMm: 0, endMm: lengthMm })
  else for (let start = phase - period; start < lengthMm; start += period) {
    const startMm = Math.max(0, start), endMm = Math.min(lengthMm, start + open)
    if (endMm > startMm) sections.push({ id: crypto.randomUUID(), startMm, endMm })
  }
  return { enabled: old?.enabled ?? true, sections }
}

export function fitSections(sections: ThreadWindow[], lengthMm: number): ThreadWindow[] {
  let end = 0
  return sections.filter((s) => Number.isFinite(s.startMm) && Number.isFinite(s.endMm))
    .toSorted((a, b) => a.startMm - b.startMm)
    .flatMap((section) => {
      const startMm = clamp(section.startMm, end, lengthMm)
      const endMm = clamp(section.endMm, startMm, lengthMm)
      if (endMm <= startMm) return []
      end = endMm
      return [{ ...section, startMm, endMm }]
    })
}

/** Keep an edited window inside the banknote and out of its neighbours. */
export function sectionBounds(sections: ThreadWindow[], id: string, lengthMm: number) {
  const sorted = sections.toSorted((a, b) => a.startMm - b.startMm)
  const index = sorted.findIndex((s) => s.id === id)
  return { min: index > 0 ? sorted[index - 1].endMm : 0, max: index >= 0 && index < sorted.length - 1 ? sorted[index + 1].startMm : lengthMm }
}

/** An empty section list hides the entire thread; continuous mode ignores the mask. */
export function threadWindowMask(thread: ThreadSettings, scale: number): CSSProperties {
  if (!thread.windows.enabled) return {}
  const sections = thread.windows.sections ?? []
  const stops = ['transparent 0px']
  for (const section of sections.toSorted((a, b) => a.startMm - b.startMm)) {
    const start = section.startMm * scale, end = section.endMm * scale
    stops.push(`transparent ${start}px`, `#000 ${start}px`, `#000 ${end}px`, `transparent ${end}px`)
  }
  stops.push('transparent 100%')
  const mask = `linear-gradient(${thread.direction === 'horizontal' ? 'to right' : 'to bottom'}, ${stops.join(', ')})`
  return { maskImage: mask, WebkitMaskImage: mask }
}

export function windowEdges(thread: ThreadSettings, lengthMm: number): number[] {
  if (!thread.windows.enabled) return []
  return [...new Set(fitSections(thread.windows.sections ?? [], lengthMm).flatMap((s) => [s.startMm, s.endMm]))].sort((a, b) => a - b)
}

/** Where complete image copies sit along the thread, in px from its top/left end: each copy's start and length. */
export function imageTiles(thicknessPx: number, lengthPx: number, gapPx: number, aspect: number, direction: ThreadSettings['direction']) {
  const naturalPx = direction === 'vertical' ? thicknessPx * aspect : thicknessPx / aspect
  if (!(naturalPx > 0)) return { naturalPx: 0, starts: [] }
  const step = naturalPx + Math.max(0, gapPx)
  return { naturalPx, starts: Array.from({ length: Math.ceil(lengthPx / step) }, (_, i) => i * step) }
}
