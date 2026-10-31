import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '../components/controls'
import { enterWorkspace } from '../cloud/identity'
import { errorMessage } from '../cloud/errors'

export function OpenWorkspace() {
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  return <div className="flex h-full items-center justify-center bg-muted/40 p-6">
    <Card className="w-full max-w-sm">
      <CardHeader><CardTitle>Security thread playground</CardTitle></CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={(event) => {
          event.preventDefault()
          try { enterWorkspace(username) } catch (error) { setError(errorMessage(error)) }
        }}>
          <Field label="Username">
            <Input autoFocus aria-label="Username" autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={32} />
          </Field>
          <Button type="submit">Open workspace</Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  </div>
}
