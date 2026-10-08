export type IncidentDraft = {
  report: string;
  assignmentId?: string;
  recordingUri: string | null;
  requestId: string;
  attempted: boolean;
};

export function parseIncidentDraft(value: string | null): IncidentDraft | null {
  if (!value) return null;
  try {
    const draft: unknown = JSON.parse(value);
    if (!draft || typeof draft !== 'object') return null;
    const d = draft as Record<string, unknown>;
    if (typeof d.report !== 'string' || d.report.length > 4000 ||
      typeof d.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(d.requestId) ||
      typeof d.attempted !== 'boolean' ||
      !(d.recordingUri === null || typeof d.recordingUri === 'string') ||
      !(d.assignmentId === undefined || typeof d.assignmentId === 'string')) return null;
    return d as IncidentDraft;
  } catch { return null; }
}
