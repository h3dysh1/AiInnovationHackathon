export type QueuedIncident = {
  requestId: string;
  userId: string;
  eventId: string;
  report: string;
  assignmentId?: string;
  recordingUri: string | null;
  createdAt: string;
  attempts: number;
  nextAttemptAt: number;
  status: 'queued' | 'blocked' | 'received';
  error: string | null;
  incidentId: string | null;
};

export const outboxKey = (userId: string) => `ground-control:incident-outbox:${userId}`;
const uuid = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
export function parseOutbox(raw: string | null, userId: string): QueuedIncident[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('The saved report queue could not be read. It has not been overwritten.');
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid saved report. Original retained.');
    const q = item as Record<string, unknown>;
    if (q.userId !== userId || typeof q.requestId !== 'string' || !uuid.test(q.requestId) ||
      typeof q.eventId !== 'string' || !uuid.test(q.eventId) || typeof q.report !== 'string' ||
      q.report.length > 4000 || !(q.recordingUri === null || typeof q.recordingUri === 'string') ||
      !(q.assignmentId === undefined || typeof q.assignmentId === 'string') ||
      typeof q.createdAt !== 'string' || !Number.isFinite(Date.parse(q.createdAt)) ||
      typeof q.attempts !== 'number' || !Number.isInteger(q.attempts) || q.attempts < 0 ||
      typeof q.nextAttemptAt !== 'number' || !Number.isFinite(q.nextAttemptAt) ||
      !['queued', 'blocked', 'received'].includes(String(q.status)) ||
      !(q.error === null || typeof q.error === 'string') ||
      !(q.incidentId === null || typeof q.incidentId === 'string')) {
      throw new Error('Invalid saved report. Original retained.');
    }
    return q as QueuedIncident;
  });
}

export function reportSendFailure(cause: unknown): { message: string; blocked: boolean } {
  const value = cause && typeof cause === 'object' ? cause as Record<string, unknown> : {};
  const message = typeof value.message === 'string' ? value.message : 'Connection interrupted. Will retry this same report.';
  const code = String(value.code ?? value.statusCode ?? '');
  // Permission/validation errors need human correction, not an endless retry loop.
  const blocked = ['42501', 'P0001', '23503', '23514', '400', '403', '413'].includes(code) ||
    /under 10 MB|could not read the voice recording|recording is missing/i.test(message);
  return { message, blocked };
}

export const retryDelay = (attempt: number) => Math.min(300000, 5000 * 2 ** Math.min(attempt - 1, 6));
