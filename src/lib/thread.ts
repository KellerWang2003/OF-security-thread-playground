import type { CSSProperties } from 'react'
import type { ThreadSettings } from './types'

/** The same clipping pattern is used by the banknote and the enlarged cut preview. */
export function threadWindowMask(thread: ThreadSettings, scale: number): CSSProperties {
  const { windows } = thread
  if (!windows.enabled || windows.gapMm <= 0) return {}
  const horizontal = thread.direction === 'horizontal'
  const open = windows.windowMm * scale
  const period = (windows.windowMm + windows.gapMm) * scale
  const mask = `repeating-linear-gradient(${horizontal ? 'to right' : 'to bottom'}, #000 0, #000 ${open}px, transparent ${open}px, transparent ${period}px)`
  const offset = horizontal ? `${windows.offsetMm * scale}px 0` : `0 ${windows.offsetMm * scale}px`
  return { maskImage: mask, WebkitMaskImage: mask, maskPosition: offset, WebkitMaskPosition: offset }
}

/** Window edges measured from the top/left of the banknote, including partial edge windows. */
export function windowEdges(thread: ThreadSettings, lengthMm: number): number[] {
  const { windows } = thread
  if (!windows.enabled || windows.gapMm <= 0) return []
  const period = windows.windowMm + windows.gapMm
  if (period <= 0) return []
  const phase = ((windows.offsetMm % period) + period) % period
  const edges: number[] = []
  for (let start = phase - period; start <= lengthMm; start += period) {
    for (const edge of [start, start + windows.windowMm]) {
      if (edge >= 0 && edge <= lengthMm) edges.push(edge)
    }
  }
  return edges.sort((a, b) => a - b)
}
