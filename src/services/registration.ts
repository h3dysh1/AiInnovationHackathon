import { saveUserProfile, saveVolunteerProfile } from './profile';
import { supabase } from './supabase';
export type RegistrationProfile = { name: string; phone: string; emergencyName: string; emergencyPhone: string; experience: string };
export async function completeVolunteerRegistration(userId: string, values: RegistrationProfile) {
  if (!supabase) throw new Error('Account service is unavailable.');
  if (!values.name.trim() || !values.phone.trim() || !values.emergencyName.trim() || !values.emergencyPhone.trim() || !values.experience.trim()) throw new Error('Complete your profile before continuing.');
  await saveUserProfile(userId, { display_name: values.name.trim(), phone: values.phone.trim() });
  await saveVolunteerProfile(userId, { emergency_contact_name: values.emergencyName.trim(), emergency_contact_phone: values.emergencyPhone.trim(), experience_level: values.experience });
  // Mark completion only after both authoritative profile records were saved.
  const { error } = await supabase.auth.updateUser({ data: { profile_onboarding_complete: true } });
  if (error) throw error;
}
