export type AccountRole = 'coordinator' | 'volunteer';

export type UserProfile = {
  id: string;
  display_name: string;
  phone: string | null;
};

export type VolunteerProfile = {
  user_id: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  experience_level: string | null;
};
