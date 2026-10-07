import { randomUUID } from 'expo-crypto';
import type { Event } from '@/domain/event';
import type {
  AiJob,
  EntityKind,
  EntityReview,
  EventDocument,
  JoinedEvent,
  JoinPreview,
  Membership,
  OperatingWindow,
  Procedure,
  Readiness,
  SetupAnswer,
  SetupIssue,
} from '@/domain/planning';
import { type OperatingPlan, validateOperatingPlan } from '@/domain/operating-plan';
import type { Post, PostRequirement, SiteLocation } from '@/domain/site';
import { supabase } from './supabase';

export function planningClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
export async function setupRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await planningClient().rpc(name, args);
  if (error) throw error;
  return data as T;
}
export async function getMembership(eventId: string, userId: string): Promise<Membership | null> {
  const { data, error } = await planningClient().from('event_memberships').select('*').eq(
    'event_id',
    eventId,
  ).eq('user_id', userId).eq('status', 'active').maybeSingle();
  if (error) throw error;
  return data as Membership | null;
}
export const managerRole = (membership: Membership | null) =>
  Boolean(membership && membership.event_role !== 'volunteer');
export const joinedEvents = () => setupRpc<JoinedEvent[]>('my_joined_events');
export const previewJoin = (code: string) =>
  setupRpc<JoinPreview | null>('preview_event_join', { p_join_code: code.trim().toUpperCase() });
export const joinEvent = (code: string, id: string) =>
  setupRpc<string>('join_event', {
    p_join_code: code.trim().toUpperCase(),
    p_expected_event_id: id,
  });
export const getReadiness = (id: string) =>
  setupRpc<Readiness>('get_event_readiness', { p_event_id: id });

async function rows<T>(table: string, eventId: string): Promise<T[]> {
  const { data, error } = await planningClient().from(table).select('*').eq('event_id', eventId);
  if (error) throw error;
  return data as T[];
}
export type PlanningSnapshot = {
  event: Event;
  locations: SiteLocation[];
  posts: Post[];
  requirements: PostRequirement[];
  windows: OperatingWindow[];
  procedures: Procedure[];
  documents: EventDocument[];
  reviews: EntityReview[];
  jobs: AiJob[];
  issues: SetupIssue[];
  answers: SetupAnswer[];
  readiness: Readiness;
  description: string | null;
};
export async function getPlanningSnapshot(id: string): Promise<PlanningSnapshot> {
  const c = planningClient();
  const readiness = await getReadiness(id);
  const [
    event,
    locations,
    posts,
    windows,
    procedures,
    documents,
    reviews,
    jobs,
    issues,
    answers,
    description,
  ] = await Promise.all([
    c.from('events').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) throw error;
      return data as Event;
    }),
    rows<SiteLocation>('locations', id),
    rows<Post>('posts', id),
    rows<OperatingWindow>('post_operating_windows', id),
    rows<Procedure>('event_procedures', id),
    rows<EventDocument>('event_documents', id),
    rows<EntityReview>('setup_entity_reviews', id),
    rows<AiJob>('setup_ai_jobs', id),
    rows<SetupIssue>('setup_issues', id),
    rows<SetupAnswer>('setup_answers', id),
    c.from('event_setup_sessions').select('description').eq('event_id', id).maybeSingle().then(
      ({ data, error }) => {
        if (error) throw error;
        return data?.description as string ?? null;
      },
    ),
  ]);
  let requirements: PostRequirement[] = [];
  if (posts.length) {
    const { data, error } = await c.from('post_requirements').select('*').in(
      'post_id',
      posts.map((p) => p.id),
    );
    if (error) throw error;
    requirements = data as PostRequirement[];
  }
  // A snapshot assembled during another person's edit must not be used for confirmation.
  const current = await getReadiness(id);
  if (current.revision !== readiness.revision) {
    throw new Error('The plan changed while loading. Refresh to see the latest version.');
  }
  return {
    event,
    locations,
    posts,
    requirements,
    windows,
    procedures,
    documents,
    reviews,
    jobs: jobs.sort((a, b) => b.created_at.localeCompare(a.created_at)),
    issues,
    answers: answers.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    readiness: current,
    description,
  };
}
export async function enqueueAnalysis(
  id: string,
  requestId: string,
  question?: string,
  answer?: string,
) {
  return setupRpc<string>('enqueue_setup_job', {
    p_event_id: id,
    p_request_id: requestId,
    p_question: question ?? null,
    p_answer: answer ?? null,
  });
}
export async function launchAnalysis(jobId: string) {
  const { error } = await planningClient().functions.invoke('setup-ai', { body: { jobId } });
  if (error) {
    throw new Error(
      'Your input is saved, but AI analysis is unavailable. Retry later or continue with the manual editor.',
    );
  }
}
export function validateProposal(plan: unknown, s: PlanningSnapshot): OperatingPlan {
  return validateOperatingPlan(plan, {
    eventId: s.event.id,
    startDate: s.event.start_date,
    endDate: s.event.end_date,
    locationIds: s.locations.map((l) => l.id),
    sources: [
      ...(s.description ? [{ id: s.event.id, type: 'description' }] : []),
      ...s.documents.filter((d) => d.include_in_setup).map((d) => ({ id: d.id, type: 'document' })),
      ...s.answers.map((a) => ({ id: a.id, type: 'answer' })),
    ],
  });
}
export async function applyProposal(job: AiJob, plan: unknown, s: PlanningSnapshot) {
  const valid = validateProposal(plan, s);
  return setupRpc<void>('apply_setup_proposal', { p_job_id: job.id, p_plan: valid });
}
export const confirmEntity = (id: string, kind: EntityKind, entityId: string, revision: number) =>
  setupRpc<void>('confirm_setup_entity', {
    p_event_id: id,
    p_kind: kind,
    p_entity_id: entityId,
    p_expected_revision: revision,
  });
export const verifyModel = (id: string, revision: number) =>
  setupRpc<void>('verify_event_model', { p_event_id: id, p_expected_revision: revision });
export const publishRecruitment = (id: string, code: string, revision: number) =>
  setupRpc<void>('publish_event_recruitment', {
    p_event_id: id,
    p_join_code: code.trim().toUpperCase(),
    p_expected_revision: revision,
  });
export const resolveIssue = (id: string, resolution: string) =>
  setupRpc<void>('resolve_setup_issue', { p_issue_id: id, p_resolution: resolution.trim() });
export const reviewDocument = (id: string, note: string) =>
  setupRpc<void>('review_event_document', { p_document_id: id, p_note: note.trim() });
export async function saveWindow(
  eventId: string,
  postId: string,
  values: Omit<OperatingWindow, 'id' | 'event_id' | 'post_id'>,
  existingId?: string,
) {
  const q = existingId
    ? planningClient().from('post_operating_windows').update(values).eq('id', existingId)
    : planningClient().from('post_operating_windows').insert({
      ...values,
      id: randomUUID(),
      event_id: eventId,
      post_id: postId,
    });
  const { error } = await q;
  if (error) throw error;
}
export async function removeWindow(id: string) {
  const { error } = await planningClient().from('post_operating_windows').delete().eq('id', id);
  if (error) throw error;
}
export async function saveProcedure(eventId: string, title: string, content: string, id?: string) {
  if (!title.trim() || !content.trim()) throw new Error('Enter a title and procedure.');
  const q = id
    ? planningClient().from('event_procedures').update({
      title: title.trim(),
      content: content.trim(),
    }).eq('id', id)
    : planningClient().from('event_procedures').insert({
      event_id: eventId,
      title: title.trim(),
      content: content.trim(),
    });
  const { error } = await q;
  if (error) throw error;
}
export async function removeProcedure(id: string) {
  const { error } = await planningClient().from('event_procedures').delete().eq('id', id);
  if (error) throw error;
}

export const removeSetupItem = (eventId: string, kind: 'location' | 'post', id: string) =>
  setupRpc<void>('remove_setup_item', { p_event_id: eventId, p_kind: kind, p_entity_id: id });
export const moveSetupPost = (eventId: string, post: Post, locationId: string) =>
  setupRpc<void>('move_setup_post', {
    p_event_id: eventId,
    p_post_id: post.id,
    p_current_location_id: post.location_id,
    p_location_id: locationId,
  });

export const dismissProposal = (jobId: string, reason: string, revision: number) =>
  setupRpc<void>('dismiss_setup_proposal', {
    p_job_id: jobId,
    p_reason: reason,
    p_expected_revision: revision,
  });

export async function analysisProgress(id: string): Promise<Pick<AiJob, 'status' | 'updated_at'>> {
  const { data, error } = await planningClient().from('setup_ai_jobs').select('status,updated_at')
    .eq('id', id).single();
  if (error) throw error;
  return data as Pick<AiJob, 'status' | 'updated_at'>;
}
