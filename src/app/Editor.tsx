import { ArrowLeft } from 'lucide-react'
import { Button } from '../components/ui'
import { updateProject } from '../lib/store'
import type { Project } from '../lib/types'
import { FrameStrip } from '../editor/FrameStrip'
import { Inspector } from '../editor/Inspector'
import { Stage } from '../editor/Stage'

export function Editor({ project }: { project: Project }) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3">
        <Button variant="ghost" size="sm" onClick={() => (location.hash = '')}>
          <ArrowLeft className="size-3.5" />
          Projects
        </Button>
        <div className="h-5 w-px bg-neutral-200" />
        <input
          className="min-w-0 flex-1 rounded px-1.5 py-1 text-sm font-medium outline-none hover:bg-neutral-50 focus:bg-neutral-100"
          value={project.name}
          onChange={(e) => updateProject(project.id, (p) => ({ ...p, name: e.target.value }))}
          aria-label="Project name"
        />
        <span className="text-xs text-neutral-400">Saved in this browser</span>
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
