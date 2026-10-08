export async function enablePush(): Promise<string> { return 'Phone push notifications are available in a configured mobile build. Your in-app inbox is available here.'; }
export async function revokePush() { /* Web has no phone token. */ }
export async function restorePush() { /* In-app inbox polling is handled by the provider. */ }
export function subscribePush(_listener: (notificationId: string) => void) { return () => {}; }
