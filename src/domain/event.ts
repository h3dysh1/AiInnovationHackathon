export type EventStatus = 'draft' | 'recruiting' | 'rostering' | 'published' | 'live' | 'completed';

export type Organisation = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
};

export type Event = {
  id: string;
  organisation_id: string;
  name: string;
  description: string | null;
  venue_name: string;
  address: string | null;
  start_date: string;
  end_date: string;
  operating_start_time: string;
  operating_end_time: string;
  timezone: string;
  expected_attendance: number | null;
  status: EventStatus;
  join_code: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  setup_revision: number;
  model_status: 'draft' | 'needs_review' | 'verified';
  verified_revision: number | null;
};

export type EventDraft = {
  name: string;
  description: string;
  venueName: string;
  address: string;
  startDate: string;
  endDate: string;
  operatingStartTime: string;
  operatingEndTime: string;
  timezone: string;
  expectedAttendance: string;
};

export const emptyEventDraft: EventDraft = {
  name: '', description: '', venueName: '', address: '',
  startDate: '', endDate: '', operatingStartTime: '09:00', operatingEndTime: '18:00',
  timezone: 'Australia/Melbourne', expectedAttendance: '',
};

export function draftFromEvent(event: Event): EventDraft {
  return {
    name: event.name,
    description: event.description ?? '',
    venueName: event.venue_name,
    address: event.address ?? '',
    startDate: event.start_date,
    endDate: event.end_date,
    operatingStartTime: event.operating_start_time.slice(0, 5),
    operatingEndTime: event.operating_end_time.slice(0, 5),
    timezone: event.timezone,
    expectedAttendance: event.expected_attendance?.toString() ?? '',
  };
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function validTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function validateEventDraft(draft: EventDraft): string | null {
  if (!draft.name.trim()) return 'Enter an event name.';
  if (draft.name.trim().length > 160) return 'Event name is too long.';
  if (draft.description.length > 2000) return 'Description is too long.';
  if (!draft.venueName.trim()) return 'Enter a venue name.';
  if (draft.venueName.trim().length > 160) return 'Venue name is too long.';
  if (draft.address.length > 300) return 'Address is too long.';
  if (!validDate(draft.startDate) || !validDate(draft.endDate)) return 'Enter dates as YYYY-MM-DD.';
  if (draft.endDate < draft.startDate) return 'End date must be on or after start date.';
  if (!validTime(draft.operatingStartTime) || !validTime(draft.operatingEndTime)) return 'Enter operating hours as HH:MM.';
  if (draft.operatingEndTime <= draft.operatingStartTime) return 'Operating end time must be after start time.';
  try { new Intl.DateTimeFormat('en', { timeZone: draft.timezone.trim() }); }
  catch { return 'Enter a valid timezone, such as Australia/Melbourne.'; }
  if (draft.expectedAttendance.trim() && (!/^\d+$/.test(draft.expectedAttendance.trim()) || Number(draft.expectedAttendance) < 1 || Number(draft.expectedAttendance) > 2147483647)) {
    return 'Expected attendance must be a positive whole number.';
  }
  return null;
}
