import { validateSetupDescription, type SetupSession } from '@/domain/setup';
import { supabase } from '@/services/supabase';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function getSetupSession(eventId: string): Promise<SetupSession | null> {
  const { data, error } = await client().from('event_setup_sessions').select('*').eq('event_id', eventId).maybeSingle();
  if (error) throw error;
  return data as SetupSession | null;
}

export async function saveSetupDescription(eventId: string, userId: string, description: string): Promise<SetupSession> {
  const validationError = validateSetupDescription(description);
  if (validationError) throw new Error(validationError);
  const previous = await getSetupSession(eventId);
  const values = {
    description: description.trim(),
    notes_reviewed_at: null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  const table = client().from('event_setup_sessions');
  const query = previous
    ? table.update(values).eq('event_id', eventId)
    : table.insert({ event_id: eventId, ...values });
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data as SetupSession;
}

export async function markSetupNotesReviewed(eventId: string, userId: string, expectedUpdatedAt: string): Promise<SetupSession> {
  const { data, error } = await client().from('event_setup_sessions').update({
    notes_reviewed_at: new Date().toISOString(),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }).eq('event_id', eventId).eq('updated_at', expectedUpdatedAt).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('These notes changed elsewhere. Reopen setup and review the latest description.');
  return data as SetupSession;
}
