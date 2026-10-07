export type SetupSession = {
  event_id: string;
  description: string;
  notes_reviewed_at: string | null;
  updated_by: string;
  updated_at: string;
};

export function validateSetupDescription(value: string): string | null {
  const length = value.trim().length;
  if (length === 0) return 'Describe how the event works before saving.';
  if (length > 20000) return 'Keep the description under 20,000 characters.';
  return null;
}
