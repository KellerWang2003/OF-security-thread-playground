import { errorMessage } from './errors'
import { create } from 'zustand'

export const useNotice = create<{ message: string }>(() => ({ message: '' }))
export function reportError(error: unknown) {
  useNotice.setState({ message: errorMessage(error) })
}
export function runAction(action: Promise<unknown>) { void action.catch(reportError) }
