import type { Event, EventDraft, Organisation } from '@/domain/event';
import { validateEventDraft } from '@/domain/event';
import { supabase } from '@/services/supabase';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

function eventValues(draft: EventDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    venue_name: draft.venueName.trim(),
    address: draft.address.trim() || null,
    start_date: draft.startDate,
    end_date: draft.endDate,
    operating_start_time: draft.operatingStartTime,
    operating_end_time: draft.operatingEndTime,
    timezone: draft.timezone.trim(),
    expected_attendance: draft.expectedAttendance.trim() ? Number(draft.expectedAttendance.trim()) : null,
  };
}

export async function listOrganisations(userId: string): Promise<Organisation[]> {
  const { data, error } = await client().from('organisations').select('id, name, created_by, created_at').eq('created_by', userId).order('name');
  if (error) throw error;
  return data as Organisation[];
}

export async function createOrganisation(userId: string, name: string): Promise<Organisation> {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 120) throw new Error('Organisation name must be 1–120 characters.');
  const { data, error } = await client().from('organisations').insert({ name: cleanName, created_by: userId }).select('id, name, created_by, created_at').single();
  if (error) throw error;
  return data as Organisation;
}

export async function listEvents(userId: string): Promise<Event[]> {
  const { data: memberships, error: membershipError } = await client().from('event_memberships').select('event_id').eq('user_id', userId).eq('status','active').in('event_role',['coordinator','safety_lead']);
  if (membershipError) throw membershipError;
  if (!memberships.length) return [];
  const { data, error } = await client().from('events').select('*').in('id', memberships.map(m=>m.event_id)).order('start_date', { ascending: true });
  if (error) throw error;
  return data as Event[];
}

export async function getEvent(id: string): Promise<Event> {
  const { data, error } = await client().from('events').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Event;
}

export async function createEvent(userId: string, organisationId: string, draft: EventDraft): Promise<Event> {
  const validationError = validateEventDraft(draft);
  if (validationError) throw new Error(validationError);
  const { data, error } = await client().from('events').insert({
    ...eventValues(draft), organisation_id: organisationId, created_by: userId, status: 'draft',
  }).select('*').single();
  if (error) throw error;
  return data as Event;
}

export async function updateEvent(id: string, draft: EventDraft): Promise<Event> {
  const validationError = validateEventDraft(draft);
  if (validationError) throw new Error(validationError);
  const { data, error } = await client().from('events').update(eventValues(draft)).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Event;
}
