import { randomUUID } from 'expo-crypto';
import type { Certification } from '@/domain/certification';
import type { IntelligenceSnapshot, LiveAssignment, LiveIncident, LiveSnapshot, ResponseCandidate } from '@/domain/live';
import type { Availability, CrewMember, Onboarding, Roster, RosterContext } from '@/domain/roster';
import { planningClient, setupRpc } from './planning';
import type { SupabaseClient } from '@supabase/supabase-js';
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
export async function reportIncident(eventId: string, report: string, assignmentId?: string, requestId?: string, client: SupabaseClient = planningClient()) {
  const { data, error } = await client.rpc('report_incident', {
    p_event_id: eventId,
    p_raw_report: report,
    p_assignment_id: assignmentId ?? null,
    p_request_id: requestId ?? null,
  });
  if (error) throw error;
  return data as { id: string; status: string };
}
export async function reportVoiceIncident(
  eventId: string,
  uri: string,
  assignmentId?: string,
  writtenContext = '',
  requestId = randomUUID(),
  client: SupabaseClient = planningClient(),
) {
  const c = client;
  const { data: userData, error: userError } = await c.auth.getUser();
  if (userError || !userData.user) throw new Error('Sign in again before sending a voice report.');
  const recording = await fetch(uri);
  if (!recording.ok) throw new Error('Could not read the voice recording.');
  const mimeType = recording.headers.get('content-type')?.split(';')[0] === 'audio/webm'
    ? 'audio/webm' : 'audio/mp4';
  const bytes = await recording.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 10485760) {
    throw new Error('Keep voice reports under 10 MB.');
  }
  const path = `${userData.user.id}/${eventId}/${requestId}.${mimeType === 'audio/webm' ? 'webm' : 'm4a'}`;
  const { error: uploadError } = await c.storage.from('incident-audio').upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError && uploadError.message !== 'The resource already exists' &&
    String('statusCode' in uploadError ? uploadError.statusCode : '') !== '409') throw uploadError;
  // Keep uploaded evidence on an ambiguous network failure. A retry uses the same
  // path and request ID; referenced audio is also protected by storage policy.
  const { data, error } = await c.rpc('report_voice_incident', {
      p_event_id: eventId,
      p_audio_path: path,
      p_audio_mime_type: mimeType,
      p_audio_size_bytes: bytes.byteLength,
      p_assignment_id: assignmentId ?? null,
      p_written_context: writtenContext,
      p_request_id: requestId,
    });
  if (error) throw error;
  return data as { id: string; status: string };
}
export async function myIncidentReports(eventId: string) {
  const c = planningClient();
  const { data: user, error: authError } = await c.auth.getUser();
  if (authError || !user.user) throw new Error('Sign in again to see your reports.');
  const { data, error } = await c.from('incidents').select('*')
    .eq('event_id', eventId).eq('reporter_id', user.user.id)
    .order('created_at', { ascending: false }).limit(10);
  if (error) throw error;
  return data as LiveIncident[];
}
export const retryIncidentProcessing = (id: string) =>
  setupRpc<LiveIncident>('retry_incident_processing', { p_id: id });
export async function incidentAudioUrl(path: string) {
  const { data, error } = await planningClient().storage.from('incident-audio').createSignedUrl(
    path,
    300,
  );
  if (error) throw error;
  return data.signedUrl;
}
export const liveSnapshot = (id: string) =>
  setupRpc<LiveSnapshot>('live_event_snapshot', { p_event_id: id });
export const intelligenceSnapshot = (id: string) =>
  setupRpc<IntelligenceSnapshot>('intelligence_snapshot', { p_event_id: id });
export const detectRisk = (id: string) => setupRpc<unknown>('request_event_intelligence', { p_event_id: id });
export const proposeResponse = (incidentId?: string, riskId?: string) =>
  setupRpc<unknown>('propose_response', { p_incident_id: incidentId ?? null, p_risk_id: riskId ?? null });
export const approveResponse = (id:string, revision:number, selections:{userId:string;resourceIndex:number}[]) =>
  setupRpc<unknown>('approve_response', {p_response_id:id,p_revision:revision,p_selections:selections});
export const responseCandidates=(id:string)=>setupRpc<ResponseCandidate[]>('response_candidates',{p_response_id:id});
export const modifyResponse=(id:string,revision:number,shiftId:string,instruction:string,resources:import('@/domain/live-intelligence').ResourceNeed[],actions:string[])=>
  setupRpc<unknown>('modify_response',{p_id:id,p_revision:revision,p_shift_id:shiftId,p_instruction:instruction,p_resources:resources,p_actions:actions});
export const dismissResponse=(id:string,revision:number)=>setupRpc<unknown>('dismiss_response',{p_id:id,p_revision:revision});
export const retryResponse=(id:string)=>setupRpc<unknown>('retry_response_processing',{p_id:id});
export const completeResponse=(id:string,notes:string)=>setupRpc<unknown>('complete_response',{p_id:id,p_notes:notes});
export const startEvent=(id:string,grace:number)=>setupRpc<unknown>('start_event',{p_event_id:id,p_grace_minutes:grace});
export const recordObservation=(id:string,kind:string,value:string,locationId:string|null)=>setupRpc<unknown>('record_event_observation',{p_event_id:id,p_kind:kind,p_value:value,p_location_id:locationId});
export const setStandby=(id:string,until:string|null)=>setupRpc<unknown>('set_standby',{p_event_id:id,p_available_until:until});

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
