export function errorMessage(cause: unknown, fallback: string): string {
  if (cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string' && cause.message) return cause.message;
  return fallback;
}
