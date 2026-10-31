import { Cloud, CloudAlert, CloudUpload, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useWorkspace, retrySync, signOut, resolveConflict } from '../cloud/workspace'
import { runAction } from '../cloud/notices'

export function CloudStatus({ showWorkspace = false, isDemo = false }: { showWorkspace?: boolean; isDemo?: boolean }) {
  const { status, error, workspace } = useWorkspace()
  const title = isDemo ? 'Temporary demo; changes are discarded when you leave' : error || (status === 'conflict' ? 'A project changed on another device' : 'Projects and artwork are saved to this workspace')
  return <div className="flex min-w-0 items-center gap-1">
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" title={title}>
      {status === 'saved' ? <Cloud className="size-3.5" /> : status === 'saving' ? <CloudUpload className="size-3.5" /> : <CloudAlert className="size-3.5 text-destructive" />}
      {isDemo ? 'Demo preview' : status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : status === 'conflict' ? 'Conflict' : 'Couldn’t save'}
    </span>
    {!isDemo && status === 'error' && <Button variant="ghost" size="xs" onClick={() => runAction(Promise.resolve(retrySync()))}>Retry</Button>}
    {showWorkspace && <><span className="ml-2 min-w-0 max-w-24 truncate text-xs text-muted-foreground" title={workspace}>{workspace}</span><Button variant="ghost" size="sm" onClick={() => runAction(signOut())}><LogOut />Sign out</Button></>}
  </div>
}

export function ConflictDialog() {
  const { conflicts, projects } = useWorkspace()
  const id = conflicts[0]
  const name = projects.find((p) => p.id === id)?.name ?? 'Project'
  return <Dialog open={!!id}>
    <DialogContent showCloseButton={false} className="sm:max-w-md">
      <DialogHeader><DialogTitle>“{name}” changed on another device</DialogTitle></DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => runAction(Promise.resolve(resolveConflict(id, false)))}>Use cloud version</Button>
        <Button onClick={() => runAction(Promise.resolve(resolveConflict(id, true)))}>Keep both</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
