import 'expo-sqlite/localStorage/install';

function draftKey(eventId: string, userId: string) {
  return `ground-control:setup-draft:${userId}:${eventId}`;
}

export function getSetupDraft(eventId: string, userId: string): string | null {
  return localStorage.getItem(draftKey(eventId, userId));
}

export function keepSetupDraft(eventId: string, userId: string, description: string): void {
  localStorage.setItem(draftKey(eventId, userId), description);
}

export function removeSetupDraft(eventId: string, userId: string): void {
  localStorage.removeItem(draftKey(eventId, userId));
}
