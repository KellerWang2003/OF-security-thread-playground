import { Columns2, Droplet, Magnet, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FEATURES, FEATURE_LINES, FEATURE_NAMES, hasFeature, type Feature } from '../lib/layers'
import type { Note } from '../lib/types'

/** Each feature's icon, in the Add menu and the Banknotes list, as on its tab in the right panel */
export const FEATURE_ICONS: Record<Feature, ReactNode> = { thread: <Columns2 />, watermark: <Droplet />, magneticInk: <Magnet /> }

/**
 * The one way to add a banknote's security features (Keller, 4 November): a + whose menu lists every feature the
 * banknote doesn't have yet, each with its icon and a line on what it is. The banknote's row in the Banknotes list and
 * the end of the right panel's tabs both have it, and it goes once the banknote has them all.
 */
export function AddFeatureMenu({ note, onAdd, align = 'start' }: { note: Note; onAdd: (feature: Feature) => void; align?: 'start' | 'end' }) {
  const addable = FEATURES.filter((f) => !hasFeature(note, f))
  if (addable.length === 0) return null
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Add security feature" />} />}>
          <Plus />
        </TooltipTrigger>
        <TooltipContent>Add security feature</TooltipContent>
      </Tooltip>
      <DropdownMenuContent className="w-60" align={align}>
        {addable.map((f) => (
          <DropdownMenuItem key={f} className="items-start py-1.5" onClick={() => onAdd(f)}>
            <span className="mt-0.5 flex">{FEATURE_ICONS[f]}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>{FEATURE_NAMES[f]}</span>
              <span className="text-[11px] leading-snug whitespace-normal text-muted-foreground">{FEATURE_LINES[f]}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
