import './local-storage';

// Promise boundaries keep storage failures in the same explicit recovery path
// as loading, rather than allowing an exception to break the form render.
export function loadDraft(key: string): Promise<string | null> {
  return Promise.resolve().then(() => localStorage.getItem(key));
}
export function saveDraft(key: string, value: string | null): Promise<void> {
  return Promise.resolve().then(() => {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  });
}
