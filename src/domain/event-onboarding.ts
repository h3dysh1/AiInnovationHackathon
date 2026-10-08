import { certificateValidity, qualificationKey, type Certification } from './certification.ts';
export type EventQualification = { type: string; posts: string[] };
export function eventQualifications(requirements: { certification_type: string; post_name: string; location_name: string }[]): EventQualification[] {
  const groups = new Map<string, EventQualification>();
  for (const r of requirements) {
    const key = qualificationKey(r.certification_type);
    const item = groups.get(key) ?? { type: r.certification_type, posts: [] };
    const post = `${r.location_name} · ${r.post_name}`;
    if (!item.posts.includes(post)) item.posts.push(post);
    groups.set(key, item);
  }
  return [...groups.values()];
}
export function eventQualificationStatus(owned: Certification[], type: string, start: string, end: string) {
  const matching = owned.filter(c => c.status !== 'archived' && c.type && qualificationKey(c.type) === qualificationKey(type));
  const valid = matching.find(c => certificateValidity(c, start, end, type) === null);
  if (valid) return { state: 'valid' as const, certificate: valid, message: 'Already valid for this event. No new upload needed.' };
  const pending = owned.find(c => ['uploaded', 'processing', 'requires_review'].includes(c.status) && qualificationKey(c.type ?? c.title) === qualificationKey(type));
  if (pending) return { state: 'pending' as const, certificate: pending, message: 'Received; verification is still pending. This does not yet establish eligibility.' };
  const other = matching[0];
  return { state: 'missing' as const, certificate: other, message: other ? certificateValidity(other, start, end, type) ?? 'Needs review' : 'Upload this if you hold it. You can still volunteer in other eligible roles.' };
}

export type EventOnboardingDraft = { revision: number; step: number; windows: { startDate: string; endDate: string; startTime: string; endTime: string }[]; hours: string; maximum: string; daily: string; preferred: string[] };
export function parseEventOnboardingDraft(raw: string | null): EventOnboardingDraft | null {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const d = v as Record<string, unknown>;
    if (!Number.isInteger(d.revision) || !Number.isInteger(d.step) || Number(d.step) < 0 || !Array.isArray(d.windows) || d.windows.length > 100 || !Array.isArray(d.preferred) || !d.preferred.every(p => typeof p === 'string') || !['hours', 'maximum', 'daily'].every(k => typeof d[k] === 'string')) return null;
    if (!d.windows.every(w => w && typeof w === 'object' && ['startDate', 'endDate'].every(k => typeof w[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w[k])) && ['startTime', 'endTime'].every(k => typeof w[k] === 'string' && /^\d{2}:\d{2}$/.test(w[k])))) return null;
    return d as EventOnboardingDraft;
  } catch { return null; }
}
