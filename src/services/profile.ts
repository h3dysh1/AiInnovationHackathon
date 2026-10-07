import type { AccountRole, UserProfile, VolunteerProfile } from '@/domain/profile';
import { supabase } from '@/services/supabase';

function client() {
  if (!supabase) throw new Error('Supabase is not configured. Add the Project URL and publishable key.');
  return supabase;
}

export async function getAccountRole(userId: string): Promise<AccountRole> {
  const { data, error } = await client()
    .from('account_roles')
    .select('role')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  if (data.role !== 'coordinator' && data.role !== 'volunteer') {
    throw new Error('This account has no valid role.');
  }
  return data.role;
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await client()
    .from('profiles')
    .select('id, display_name, phone')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data as UserProfile;
}

export async function getVolunteerProfile(userId: string): Promise<VolunteerProfile | null> {
  const { data, error } = await client()
    .from('volunteer_profiles')
    .select('user_id, emergency_contact_name, emergency_contact_phone, experience_level')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as VolunteerProfile | null;
}

export async function saveUserProfile(userId: string, values: Pick<UserProfile, 'display_name' | 'phone'>) {
  const { error } = await client().from('profiles').update(values).eq('id', userId);
  if (error) throw error;
}

export async function saveVolunteerProfile(
  userId: string,
  values: Pick<VolunteerProfile, 'emergency_contact_name' | 'emergency_contact_phone' | 'experience_level'>,
) {
  const { error } = await client().from('volunteer_profiles').upsert({ user_id: userId, ...values });
  if (error) throw error;
}
