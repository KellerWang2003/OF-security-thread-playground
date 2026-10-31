import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Editor } from './app/Editor'
import { ProjectList } from './app/ProjectList'
import { OpenWorkspace } from './app/OpenWorkspace'
import { cloudConfigured } from './cloud/client'
import { openWorkspace, closeWorkspace, useWorkspace, watchWorkspace, retrySync, signOut, clearDemoPreview } from './cloud/workspace'
import { readWorkspaceName, WORKSPACE_EVENT } from './cloud/identity'
import { useNotice, runAction } from './cloud/notices'
import { ConflictDialog } from './components/CloudStatus'

function useHash() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onChange = () => setHash(location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

function Workspace({ name }: { name: string }) {
  const hash = useHash()
  const { projects, demoPreview, loaded, error } = useWorkspace()
  useEffect(() => {
    void openWorkspace(name)
    const unwatch = watchWorkspace()
    return () => { unwatch(); closeWorkspace() }
  }, [name])
  useEffect(() => {
    if (hash !== '#/demo' && location.hash !== '#/demo') clearDemoPreview()
  }, [hash])
  if (!loaded) return <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
    <span role={error ? 'alert' : 'status'}>{error || 'Loading projects…'}</span>
    {error && <div className="flex gap-2"><Button onClick={() => runAction(Promise.resolve(retrySync()))}>Retry</Button><Button variant="ghost" onClick={() => runAction(signOut())}>Sign out</Button></div>}
  </div>
  const projectId = hash.match(/^#\/p\/(.+)$/)?.[1]
  const project = hash === '#/demo' ? demoPreview : projects.find((p) => p.id === projectId)
  return <>
    {project ? <Editor key={project.id} project={project} isDemo={hash === '#/demo'} /> : <ProjectList />}
    <ConflictDialog />
  </>
}

function App() {
  const [name, setName] = useState(readWorkspaceName)
  const notice = useNotice((s) => s.message)
  useEffect(() => {
    const onChange = (event: Event) => setName((event as CustomEvent<string | null>).detail)
    window.addEventListener(WORKSPACE_EVENT, onChange)
    return () => window.removeEventListener(WORKSPACE_EVENT, onChange)
  }, [])
  useEffect(() => { useNotice.setState({ message: '' }) }, [name])

  if (!cloudConfigured) return <div className="flex h-full items-center justify-center text-sm" role="alert">Cloud connection is not configured.</div>
  return <>
    {name ? <Workspace key={name} name={name} /> : <OpenWorkspace />}
    {notice && <div role="alert" className="fixed top-3 left-1/2 z-[100] flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-lg border bg-background p-3 text-sm shadow-lg">
      <span>{notice}</span>
      <Button variant="ghost" size="sm" onClick={() => useNotice.setState({ message: '' })}>Dismiss</Button>
    </div>}
  </>
}

export default App
