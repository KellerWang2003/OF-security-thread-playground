import { useEffect, useState } from 'react'
import { Editor } from './app/Editor'
import { ProjectList } from './app/ProjectList'
import { useProjects } from './lib/store'

// The open project lives in the URL hash (#/p/<id>), so a reload keeps you in the editor
function useHash() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onChange = () => setHash(location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

function App() {
  const hash = useHash()
  const { projects, loaded } = useProjects()

  useEffect(() => {
    void useProjects.getState().load()
  }, [])

  if (!loaded) return null

  const projectId = hash.match(/^#\/p\/(.+)$/)?.[1]
  const project = projects.find((p) => p.id === projectId)
  return project ? <Editor project={project} /> : <ProjectList />
}

export default App
