import { create } from 'zustand'

/**
 * How the right panel switches between a banknote's parts, while Keller compares ways of doing it: tabs under the
 * name, folder tags down the panel's edge, or the banknote with its parts nested as a tree. Remembered per browser;
 * the switch at the panel's foot goes once one is chosen.
 */
export type PanelOption = 'tabs' | 'tags' | 'tree'
export const PANEL_OPTIONS: { value: PanelOption; label: string }[] = [
  { value: 'tabs', label: 'Tabs' },
  { value: 'tags', label: 'Tags' },
  { value: 'tree', label: 'Tree' },
]
const KEY = 'of-playground.panel-option'

function load(): PanelOption {
  try {
    const saved = localStorage.getItem(KEY)
    const known = PANEL_OPTIONS.find((o) => o.value === saved)
    if (known) return known.value
  } catch { /* storage blocked: the default */ }
  return 'tabs'
}

export const usePanelOption = create<{ option: PanelOption }>(() => ({ option: load() }))

export function setPanelOption(option: PanelOption) {
  usePanelOption.setState({ option })
  try {
    localStorage.setItem(KEY, option)
  } catch { /* storage blocked: it lasts until reload */ }
}
