import { create } from 'zustand'

/**
 * Whether the Lens effect's tilt map shows the print instead, and how many ridges the print draws across the
 * thread (magnified: real ridges are far finer). A way of looking, not part of a project: remembered per browser.
 */
export const PRINT_RIDGES = { min: 2, max: 40, initial: 10 }
const KEY = 'of-playground.print-view'

interface PrintView {
  on: boolean
  ridges: number
}

function load(): PrintView {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PrintView> | null
    const ridges = Number(saved?.ridges)
    return {
      on: saved?.on === true,
      ridges: Number.isFinite(ridges) ? Math.min(Math.max(Math.round(ridges), PRINT_RIDGES.min), PRINT_RIDGES.max) : PRINT_RIDGES.initial,
    }
  } catch { /* storage blocked or unreadable: the defaults */ }
  return { on: false, ridges: PRINT_RIDGES.initial }
}

export const usePrintView = create<PrintView>(() => load())

export function setPrintView(patch: Partial<PrintView>) {
  usePrintView.setState(patch)
  try {
    localStorage.setItem(KEY, JSON.stringify(usePrintView.getState()))
  } catch { /* storage blocked: it lasts until reload */ }
}
