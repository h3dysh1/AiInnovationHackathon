import { expiredReceipt, parseOutbox, outboxKey, reportSendFailure, retryDelay, type QueuedIncident } from '@/domain/incident-outbox';
import { loadDraft, saveDraft } from './draft-storage';
import { preserveIncidentAudio, releaseIncidentAudio } from './incident-evidence';
import { supabase, scopedReportingClient } from './supabase';
import { reportIncident, reportVoiceIncident } from './staffing';

const listeners = new Set<() => void>();
export function subscribeOutbox(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
let mutations: Promise<unknown> = Promise.resolve();
function mutate<T>(work: () => Promise<T>): Promise<T> {
  const task = mutations.then(work, work);
  mutations = task.catch(() => undefined);
  return task;
}
export async function readOutbox(userId: string) {
  return parseOutbox(await loadDraft(outboxKey(userId)), userId);
}
async function write(userId: string, reports: QueuedIncident[]) {
  await saveDraft(outboxKey(userId), JSON.stringify(reports));
  listeners.forEach(listener => listener());
}
export function queueIncident(input: Pick<QueuedIncident, 'userId' | 'eventId' | 'requestId' | 'report' | 'recordingUri' | 'assignmentId'>) {
  return mutate(async () => {
    const reports = await readOutbox(input.userId);
    const existing = reports.find(q => q.requestId === input.requestId);
    if (existing) return existing;
    if (!input.report.trim() && !input.recordingUri) throw new Error('Record or type your report first.');
    const recordingUri = input.recordingUri ? await preserveIncidentAudio(input.recordingUri, input.requestId) : null;
    const queued: QueuedIncident = {
      ...input, recordingUri, createdAt: new Date().toISOString(), attempts: 0,
      status: 'queued', nextAttemptAt: 0, error: null, incidentId: null,
    };
    // Validate before saving; storage failure must never be described as queued.
    parseOutbox(JSON.stringify([queued]), input.userId);
    await write(input.userId, [...reports, queued]);
    return queued;
  });
}
export function retryQueuedIncident(userId: string, requestId: string) {
  return mutate(async () => {
    const reports = await readOutbox(userId);
    await write(userId, reports.map(q => q.requestId === requestId && q.status !== 'received'
      ? { ...q, status: 'queued', nextAttemptAt: 0, error: null } : q));
  });
}
async function update(userId: string, requestId: string, change: Partial<QueuedIncident>) {
  await mutate(async () => {
    const reports = await readOutbox(userId);
    await write(userId, reports.map(q => q.requestId === requestId ? { ...q, ...change } : q));
  });
}
// The queue write comes first: an entry must never point at audio that is gone.
// A failed delete only leaves an unused file behind.
function release(requestId: string) {
  try { releaseIncidentAudio(requestId); } catch { /* Retried the next time receipts are pruned. */ }
}
async function pruneReceipts(userId: string) {
  const expired = await mutate(async () => {
    const reports = await readOutbox(userId);
    const now = Date.now();
    const expired = reports.filter(q => expiredReceipt(q, now));
    if (expired.length) await write(userId, reports.filter(q => !expired.includes(q)));
    return expired;
  });
  expired.forEach(q => release(q.requestId));
}
let flushing: Promise<void> | null = null;
export async function flushIncidentOutbox(force = false): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    // Housekeeping must never stop queued reports from being sent.
    await pruneReceipts(userId).catch(() => undefined);
    const reports = await readOutbox(userId);
    for (const report of reports) {
      if (report.status !== 'queued' || !force && report.nextAttemptAt > Date.now()) continue;
      // Never send a previous account's reports under a newly signed-in user.
      const current = await supabase.auth.getSession();
      if (current.data.session?.user.id !== userId) break;
      const attempts = report.attempts + 1;
      await update(userId, report.requestId, { attempts, nextAttemptAt: Date.now() + retryDelay(attempts) });
      try {
        const client = await scopedReportingClient(userId);
        const received = report.recordingUri
          ? await reportVoiceIncident(report.eventId, report.recordingUri, report.assignmentId, report.report, report.requestId, client)
          : await reportIncident(report.eventId, report.report, report.assignmentId, report.requestId, client);
        // The server now holds the recording, so the local copy can go.
        await update(userId, report.requestId, { status: 'received', incidentId: received.id, error: null, receivedAt: Date.now(), recordingUri: null });
        if (report.recordingUri) release(report.requestId);
      } catch (cause) {
        const failure = reportSendFailure(cause);
        await update(userId, report.requestId, { status: failure.blocked ? 'blocked' : 'queued', error: failure.message });
      }
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
