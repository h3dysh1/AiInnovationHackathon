export type LiveAssignment = {
  assignment_id: string;
  shift_id: string;
  post: string;
  location: string;
  starts_at: string;
  ends_at: string;
  instructions: string | null;
  status: 'scheduled' | 'checked_in' | 'late' | 'missing' | 'completed';
  checked_in_at: string | null;
};

export type LiveIncident = {
  id: string;
  raw_report: string;
  status: 'received' | 'processing' | 'needs_review' | 'open' | 'resolved';
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  created_at: string;
  category?: string | null;
  summary?: string | null;
  analyzed_at?: string | null;
  audio_path?: string | null;
  audio_mime_type?: string | null;
}
export type IntelligenceSnapshot = {
  incidents: LiveIncident[];
  relations: { incident_id: string; related_incident_id: string; relation_type: string; confidence: number }[];
  risks: { id: string; title: string; explanation: string; severity: string; status: string }[];
  responses: { id: string; title: string; rationale: string; status: string; incident_id: string | null; risk_alert_id: string | null }[];
  procedures: { id: string; title: string; document_type: string }[];
};

export type LiveSnapshot = {
  event: { id: string; name: string; status: string; timezone: string };
  staffing: { assigned: number; checked_in: number; late: number; missing: number; completed: number };
  coverage: { post: string; location: string; required: number; assigned: number; checked_in: number; missing: number; criticality: string }[];
  incidents: LiveIncident[];
};
