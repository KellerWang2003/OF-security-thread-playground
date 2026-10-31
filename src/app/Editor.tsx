import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { updateProject } from '../lib/store'
import type { Project } from '../lib/types'
import { FrameStrip } from '../editor/FrameStrip'
import { Inspector } from '../editor/Inspector'
import { Stage } from '../editor/Stage'

export function Editor({ project }: { project: Project }) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
        <Button variant="ghost" size="sm" onClick={() => (location.hash = '')}>
          <ArrowLeft />
          Projects
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <Input
          className="h-8 max-w-sm border-transparent font-medium shadow-none hover:border-input"
          value={project.name}
          onChange={(e) => updateProject(project.id, (p) => ({ ...p, name: e.target.value }))}
          aria-label="Project name"
        />
        <span className="ml-auto text-xs text-muted-foreground">Saved in this browser</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <Stage project={project} />
          <FrameStrip project={project} />
        </main>
        <Inspector project={project} />
      </div>
    </div>
  )
}
