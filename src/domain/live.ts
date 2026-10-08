import type { ResourceNeed } from './live-intelligence';
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
  response_plan_id?: string | null;
};

export type LiveIncident = {
  id: string;
  raw_report: string;
  status: 'received' | 'processing' | 'needs_review' | 'open' | 'resolved';
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  created_at: string;
  location_id?: string | null;
  ai_evidence?: string | null;
  category?: string | null;
  summary?: string | null;
  analyzed_at?: string | null;
  audio_path?: string | null;
  audio_mime_type?: string | null;
  transcript?: string | null;
  processing_status: 'queued' | 'processing' | 'complete' | 'failed';
  processing_error?: string | null;
  processing_failures: number;
}
export function incidentProcessingLabel(incident: LiveIncident): string {
  switch (incident.processing_status) {
    case 'queued': return 'Report saved · processing queued';
    case 'processing': return 'Report saved · processing';
    case 'failed': return incident.processing_failures < 3
      ? 'Processing failed · automatic retry scheduled · original retained'
      : 'Processing failed · retry available · original retained';
    case 'complete': return incident.status === 'needs_review'
      ? 'Processing complete · coordinator review needed' : 'Processing complete';
  }
}
export type IntelligenceSnapshot = {
  incidents: LiveIncident[];
  relations: { incident_id: string; related_incident_id: string; relation_type: string; confidence: number }[];
  risks: { id: string; title: string; explanation: string; severity: string; status: string; evidence?:{incidentIds?:string[];observationIds?:string[];shiftIds?:string[]} }[];
  responses: LiveResponse[];
  activeShifts: {id:string;post:string;location:string;ends_at:string}[];
  locations: {id:string;name:string}[];
  coverage: {shift_id:string;post:string;required:number;checked_in:number;qualifications:{label:string;actual:number;required:number}[]}[];
  observations: {id:string;kind:string;value:string;observed_at:string}[];
  dispatches: {id:string;response_plan_id:string;name:string;status:string}[];
  timeline: {id:string;event_type:string;detail:string;created_at:string}[];
  summary:{status:string;summary:string|null;error:string|null};
  readiness: {missingAcknowledgements:number;pendingCertificates:number;onboardingMissing:number;safetyProcedures:number};
  procedures: { id: string; title: string; document_type: string; content?:string }[];
};

export type LiveSnapshot = {
  event: { id: string; name: string; status: string; timezone: string; is_demo?:boolean; demo_source_id?:string|null };
  staffing: { assigned: number; checked_in: number; late: number; missing: number; completed: number };
  coverage: { post: string; location: string; required: number; assigned: number; checked_in: number; missing: number; criticality: string }[];
  incidents: Pick<LiveIncident, 'id' | 'raw_report' | 'status' | 'severity' | 'created_at'>[];
};

export type LiveResponse = {id:string;title:string;rationale:string;status:string;incident_id:string|null;risk_alert_id:string|null;
 revision:number;processing_status:string;processing_error:string|null;target_shift_id:string|null;instruction:string|null;resources:ResourceNeed[];actions:string[];procedure_ids:string[]};
export type ResponseCandidate={userId:string;name:string;resourceIndex:number;eligible:boolean;reason:string|null;source:string|null;rank:number};
