import type { EventDocument } from '@/domain/planning';
import { planningClient } from './planning';
export type DocumentUpload = {
  id: string;
  eventId: string;
  userId: string;
  title: string;
  type: string;
  name: string;
  mimeType: string;
  bytes: ArrayBuffer;
};
export async function uploadDocument(input: DocumentUpload): Promise<EventDocument> {
  if (!input.title.trim() || input.title.trim().length > 160) {
    throw new Error('Document title must be 1–160 characters.');
  }
  if (!input.bytes.byteLength || input.bytes.byteLength > 10485760) {
    throw new Error('Choose a file between 1 byte and 10 MB.');
  }
  if (
    ![
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'text/tab-separated-values',
      'image/jpeg',
      'image/png',
    ].includes(input.mimeType)
  ) throw new Error('Export this document to PDF, CSV or an image before uploading.');
  const c = planningClient();
  const existing = await c.from('event_documents').select('*').eq('id', input.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as EventDocument;
  const path = `${input.eventId}/${input.id}/${
    input.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'document'
  }`;
  const storage = c.storage.from('event-documents');
  const { error: uploadError } = await storage.upload(path, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  // A retry may find the original immutable upload from an interrupted metadata write.
  if (
    uploadError && uploadError.message !== 'The resource already exists' &&
    String('statusCode' in uploadError ? uploadError.statusCode : '') !== '409'
  ) throw uploadError;
  const { data, error } = await c.from('event_documents').insert({
    id: input.id,
    event_id: input.eventId,
    title: input.title.trim(),
    document_type: input.type,
    original_name: input.name,
    storage_path: path,
    mime_type: input.mimeType,
    size_bytes: input.bytes.byteLength,
    uploaded_by: input.userId,
  }).select('*').single();
  if (error) {
    const saved = await c.from('event_documents').select('*').eq('id', input.id).maybeSingle();
    if (saved.data) return saved.data as EventDocument;
    throw error;
  }
  return data as EventDocument;
}
export async function setDocumentIncluded(id: string, include: boolean) {
  const { error } = await planningClient().from('event_documents').update({
    include_in_setup: include,
  }).eq('id', id);
  if (error) throw error;
}
export async function documentUrl(path: string) {
  const { data, error } = await planningClient().storage.from('event-documents').createSignedUrl(
    path,
    300,
  );
  if (error) throw error;
  return data.signedUrl;
}
