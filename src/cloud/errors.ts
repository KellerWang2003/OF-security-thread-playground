export function errorMessage(error: unknown, fallback = 'The operation could not be completed.') {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message : fallback
}
