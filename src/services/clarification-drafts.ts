import { randomUUID } from 'expo-crypto';
export type ClarificationDraft = { question: string; answer: string; requestId: string };
const key = (event: string, user: string) => `gc:clarification:${user}:${event}`;
export function readClarification(event: string, user: string): ClarificationDraft | null {
  const raw = localStorage.getItem(key(event, user));
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (
    value && typeof value === 'object' && 'question' in value &&
    typeof value.question === 'string' && 'answer' in value && typeof value.answer === 'string' &&
    'requestId' in value && typeof value.requestId === 'string'
  ) return value as ClarificationDraft;
  return null;
}
export function keepClarification(
  event: string,
  user: string,
  question: string,
  answer: string,
  requestId: string = randomUUID(),
) {
  localStorage.setItem(key(event, user), JSON.stringify({ question, answer, requestId }));
  return requestId;
}
export function clearClarification(event: string, user: string) {
  localStorage.removeItem(key(event, user));
}
