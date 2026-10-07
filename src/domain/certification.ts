import { validPlanDate } from './operating-plan.ts';
export type CertificateFields = {
  type: string | null;
  holderName: string | null;
  certificateNumber: string | null;
  issuer: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  confidence: number;
};
export type Certification = {
  id: string;
  user_id: string;
  title: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status:
    | 'uploaded'
    | 'processing'
    | 'verified'
    | 'requires_review'
    | 'expired'
    | 'rejected'
    | 'failed'
    | 'archived';
  type: string | null;
  holder_name: string | null;
  certificate_number: string | null;
  issuer: string | null;
  issued_at: string | null;
  expires_at: string | null;
  never_expires: boolean;
  extraction_confidence: number | null;
  extraction: CertificateFields | null;
  verification_notes: string | null;
  reviewed_at: string | null;
  error_message: string | null;
  attempt: number;
  processing_started_at: string | null;
  uploaded_at: string;
};
export function qualificationKey(value: string) {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['firstaid', 'providefirstaid', 'hltaid011', 'hltaid011providefirstaid'].includes(key)) {
    return 'firstaid';
  }
  if (
    [
      'cpr',
      'hltaid009',
      'providecardiopulmonaryresuscitation',
      'hltaid009providecardiopulmonaryresuscitation',
    ].includes(key)
  ) return 'cpr';
  return key;
}
export function holderMatches(holder: string | null, name: string) {
  const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  return Boolean(holder && normalize(name) && normalize(holder) === normalize(name));
}
export function validateCertificateFields(value: unknown): CertificateFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Certificate extraction must be an object.');
  }
  const v = value as Record<string, unknown>;
  const text = (key: string, max: number) => {
    if (v[key] === null) return null;
    if (typeof v[key] !== 'string' || !v[key].trim() || v[key].length > max) {
      throw new Error(`Invalid certificate ${key}.`);
    }
    return v[key].trim();
  };
  const issuedAt = text('issuedAt', 10), expiresAt = text('expiresAt', 10);
  if (
    issuedAt && !validPlanDate(issuedAt) || expiresAt && !validPlanDate(expiresAt) ||
    issuedAt && expiresAt && issuedAt > expiresAt
  ) throw new Error('Certificate dates are invalid.');
  if (
    typeof v.confidence !== 'number' || !Number.isFinite(v.confidence) || v.confidence < 0 ||
    v.confidence > 1
  ) throw new Error('Invalid extraction confidence.');
  return {
    type: text('type', 120),
    holderName: text('holderName', 120),
    certificateNumber: text('certificateNumber', 160),
    issuer: text('issuer', 200),
    issuedAt,
    expiresAt,
    confidence: v.confidence,
  };
}
export function certificateValidity(
  c: Pick<Certification, 'status' | 'type' | 'issued_at' | 'expires_at' | 'never_expires'>,
  start: string,
  end: string,
  required?: string,
): string | null {
  if (!['verified', 'expired'].includes(c.status)) return 'Requires verification';
  if (!c.type) return 'Type missing';
  if (required && qualificationKey(c.type) !== qualificationKey(required)) {
    return 'Different qualification';
  }
  if (c.issued_at && c.issued_at > start) return 'Issued after event starts';
  if (!c.expires_at && !c.never_expires) return 'Expiry unknown';
  if (c.expires_at && c.expires_at < start) return 'Expires before event';
  if (c.expires_at && c.expires_at < end) return 'Expires during event';
  return null;
}
const nullable = { type: ['string', 'null'] };
export const certificateSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'type',
    'holderName',
    'certificateNumber',
    'issuer',
    'issuedAt',
    'expiresAt',
    'confidence',
  ],
  properties: {
    type: nullable,
    holderName: nullable,
    certificateNumber: nullable,
    issuer: nullable,
    issuedAt: nullable,
    expiresAt: nullable,
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};
