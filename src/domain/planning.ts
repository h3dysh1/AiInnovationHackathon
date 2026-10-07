import type { OperatingPlan, Source } from './operating-plan';
export type EventRole = 'coordinator' | 'safety_lead' | 'volunteer';
export type Membership = {
  id: string;
  event_id: string;
  user_id: string;
  event_role: EventRole;
  status: 'active' | 'inactive';
  joined_at: string;
};
export type EventDocument = {
  id: string;
  event_id: string;
  title: string;
  document_type: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  include_in_setup: boolean;
  processing_status: 'uploaded' | 'processing' | 'ready' | 'failed';
  processing_error: string | null;
  reviewed_at: string | null;
  uploaded_at: string;
};
export const documentTypes = [
  'run_sheet',
  'operations',
  'volunteer_plan',
  'roster',
  'emergency_plan',
  'medical_plan',
  'heat_plan',
  'handbook',
  'other',
] as const;
export type EntityKind = 'location' | 'post' | 'requirement' | 'window' | 'procedure';
export type EntityReview = {
  entity_kind: EntityKind;
  entity_id: string;
  source_type: Source['sourceType'];
  source_id: string | null;
  source_reference: string;
  confidence: number | null;
  status: 'confirmed' | 'needs_review';
  confirmed_at: string | null;
  ai_job_id: string | null;
};
export type OperatingWindow = {
  id: string;
  event_id: string;
  post_id: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  minimum_coverage: number | null;
};
export type Procedure = { id: string; event_id: string; title: string; content: string };
export type SetupIssue = {
  id: string;
  event_id: string;
  job_id: string;
  issue_key: string;
  severity: 'blocking' | 'review';
  question: string;
  evidence: string;
  status: 'open' | 'resolved';
  resolution: string | null;
};
export type SetupAnswer = {
  id: string;
  event_id: string;
  question: string;
  answer: string;
  created_at: string;
};
export type AiJob = {
  id: string;
  event_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  input_revision: number;
  attempt: number;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  output: OperatingPlan | null;
  applied_revision: number | null;
  dismissed_at: string | null;
  dismissal_reason: string | null;
};
export type ReadinessIssue = { code: string; message: string; entityId?: string };
export type Readiness = {
  revision: number;
  modelStatus: 'draft' | 'needs_review' | 'verified';
  verifiedRevision: number | null;
  issues: ReadinessIssue[];
  confirmed: number;
  total: number;
};
export type JoinPreview = {
  id: string;
  name: string;
  description: string | null;
  venue_name: string;
  start_date: string;
  end_date: string;
  timezone: string;
};
export type JoinedEvent = JoinPreview & { event_role: EventRole; status: string };
