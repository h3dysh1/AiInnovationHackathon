import { randomUUID } from 'expo-crypto';
import type { Certification } from '@/domain/certification';
import type { IntelligenceSnapshot, LiveAssignment, LiveSnapshot } from '@/domain/live';
import type { Availability, CrewMember, Onboarding, Roster, RosterContext } from '@/domain/roster';
import { planningClient, setupRpc } from './planning';
export type OnboardingContext = {
  posts: { id: string; name: string; location_name: string }[];
  requirements: { certification_type: string; post_name: string; location_name: string }[];
  preferences: Onboarding | null;
  availability: Availability[];
};
export type RosterReadiness = {
  issues: (string | { shiftId: string; message: string })[];
  warnings: string[];
  revision: number;
  staffingRevision: number;
  ready: boolean;
};
export const onboardingContext = (id: string) =>
  setupRpc<OnboardingContext>('event_onboarding_context', { p_event_id: id });
export const crewContext = (id: string) =>
  setupRpc<CrewMember[]>('event_crew_context', { p_event_id: id });
export const rosterContext = (id: string) =>
  setupRpc<RosterContext>('get_roster_context', { p_roster_id: id });
export const rosterReadiness = (id: string) =>
  setupRpc<RosterReadiness>('get_roster_readiness', { p_roster_id: id });
export async function certificates(userId: string) {
  const { data, error } = await planningClient().from('certifications').select('*').eq(
    'user_id',
    userId,
  ).order('uploaded_at', { ascending: false });
  if (error) throw error;
  return data as Certification[];
}
export async function rosters(eventId: string) {
  const { data, error } = await planningClient().from('rosters').select('*').eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Roster[];
}
export async function invokeStaffing(name: string, body: Record<string, unknown>) {
  const { data, error } = await planningClient().functions.invoke(name, { body });
  if (error) {
    if ('context' in error && error.context instanceof Response) {
      const detail = await error.context.json().catch(() => null);
      if (detail?.error) throw new Error(detail.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data as { complete?: boolean; searchLimited?: boolean };
}
export async function uploadCertificate(
  input: {
    id: string;
    userId: string;
    title: string;
    name: string;
    mimeType: string;
    bytes: ArrayBuffer;
  },
) {
  if (!input.title.trim() || input.title.length > 160) {
    throw new Error('Enter a certificate title (up to 160 characters).');
  }
  if (!input.bytes.byteLength || input.bytes.byteLength > 10485760) {
    throw new Error('Choose a certificate up to 10 MB.');
  }
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(input.mimeType)) {
    throw new Error('Choose PDF, JPEG or PNG.');
  }
  const c = planningClient();
  const existing = await c.from('certifications').select('*').eq('id', input.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as Certification;
  const path = `${input.userId}/${input.id}/${
    input.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'certificate'
  }`;
  const { error: uploadError } = await c.storage.from('certificates').upload(path, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (
    uploadError && uploadError.message !== 'The resource already exists' &&
    String('statusCode' in uploadError ? uploadError.statusCode : '') !== '409'
  ) throw uploadError;
  const { data, error } = await c.from('certifications').insert({
    id: input.id,
    user_id: input.userId,
    title: input.title.trim(),
    storage_path: path,
    mime_type: input.mimeType,
    size_bytes: input.bytes.byteLength,
  }).select('*').single();
  if (error) {
    const saved = await c.from('certifications').select('*').eq('id', input.id).maybeSingle();
    if (saved.data) return saved.data as Certification;
    throw error;
  }
  return data as Certification;
}
export async function certificateUrl(path: string) {
  const { data, error } = await planningClient().storage.from('certificates').createSignedUrl(
    path,
    300,
  );
  if (error) throw error;
  return data.signedUrl;
}
export type Schedule = {
  published: boolean;
  shifts: {
    id: string;
    starts_at: string;
    ends_at: string;
    post: string;
    location: string;
    instructions: string | null;
    supervisor: string | null;
    escalation: string | null;
  }[];
};
export const mySchedule = (id: string) =>
  setupRpc<Schedule>('my_event_schedule', { p_event_id: id });
export const myLiveAssignments = (id: string) =>
  setupRpc<LiveAssignment[]>('my_live_assignments', { p_event_id: id });
export const setCheckIn = (assignmentId: string, action: 'check_in' | 'check_out') =>
  setupRpc<unknown>('set_check_in', { p_assignment_id: assignmentId, p_action: action });
export const reportIncident = (eventId: string, report: string, assignmentId?: string) =>
  setupRpc<{ id: string; status: string }>('report_incident', {
    p_event_id: eventId,
    p_raw_report: report,
    p_assignment_id: assignmentId ?? null,
  });
export async function reportVoiceIncident(
  eventId: string,
  uri: string,
  assignmentId?: string,
) {
  const c = planningClient();
  const { data: userData, error: userError } = await c.auth.getUser();
  if (userError || !userData.user) throw new Error('Sign in again before sending a voice report.');
  const bytes = await fetch(uri).then((response) => {
    if (!response.ok) throw new Error('Could not read the voice recording.');
    return response.arrayBuffer();
  });
  if (!bytes.byteLength || bytes.byteLength > 10485760) {
    throw new Error('Keep voice reports under 10 MB.');
  }
  const incidentId = randomUUID();
  const path = `${userData.user.id}/${eventId}/${incidentId}.m4a`;
  const { error: uploadError } = await c.storage.from('incident-audio').upload(path, bytes, {
    contentType: 'audio/mp4',
    upsert: false,
  });
  if (uploadError) throw uploadError;
  try {
    return await setupRpc<{ id: string; status: string }>('report_voice_incident', {
      p_event_id: eventId,
      p_audio_path: path,
      p_audio_mime_type: 'audio/mp4',
      p_audio_size_bytes: bytes.byteLength,
      p_assignment_id: assignmentId ?? null,
    });
  } catch (error) {
    await c.storage.from('incident-audio').remove([path]);
    throw error;
  }
}
export async function incidentAudioUrl(path: string) {
  const { data, error } = await planningClient().storage.from('incident-audio').createSignedUrl(
    path,
    300,
  );
  if (error) throw error;
  return data.signedUrl;
}
export async function startIncidentAnalysis(incidentId: string) {
  const { error } = await planningClient().functions.invoke('incident-ai', {
    body: { incidentId },
  });
  if (error) return false;
  return true;
}
export const liveSnapshot = (id: string) =>
  setupRpc<LiveSnapshot>('live_event_snapshot', { p_event_id: id });
export const intelligenceSnapshot = (id: string) =>
  setupRpc<IntelligenceSnapshot>('intelligence_snapshot', { p_event_id: id });
export const analyzeIncident = (id: string) => setupRpc<unknown>('analyze_incident', { p_incident_id: id });
export const correlateIncident = (id: string) => setupRpc<unknown>('correlate_incident', { p_incident_id: id });
export const detectRisk = (id: string) => setupRpc<unknown>('detect_risk', { p_event_id: id });
export const proposeResponse = (incidentId?: string, riskId?: string) =>
  setupRpc<unknown>('propose_response', { p_incident_id: incidentId ?? null, p_risk_id: riskId ?? null });
export const approveResponse = (id: string, instruction: string) =>
  setupRpc<unknown>('approve_response', { p_response_id: id, p_instruction: instruction });
export const resolveIncident = (id: string, notes: string) =>
  setupRpc<unknown>('resolve_incident', { p_id: id, p_notes: notes });
export const updateDispatch = (id: string, status: string) =>
  setupRpc<unknown>('update_dispatch', { p_id: id, p_status: status });
export const myDispatchRequests = (id: string) =>
  setupRpc<{ id: string; instruction: string; status: string; updated_at: string }[]>(
    'my_dispatch_requests',
    { p_event_id: id },
  );
export const closeEvent = (id: string, summary: string) =>
  setupRpc<unknown>('close_event', { p_event_id: id, p_summary: summary });
