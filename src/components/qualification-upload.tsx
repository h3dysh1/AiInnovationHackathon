import { useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { Button, Notice } from './ui';
import { AppText as Text } from './app-text';
import { documentBytes } from '@/services/document-file';
import { invokeStaffing, uploadCertificate } from '@/services/staffing';

export function QualificationUpload({ type, userId, onSaved, onBusy }: { type: string; userId: string; onSaved: () => Promise<void>; onBusy: (busy: boolean) => void }) {
  const uploadId = useRef(randomUUID());
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState(false);
  async function pick() {
    setError(null);
    try { const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true }); if (!result.canceled) { setFile(result.assets[0]); uploadId.current = randomUUID(); setReceived(false); } }
    catch { setError('Could not open your files. Try again.'); }
  }
  async function upload() {
    if (!file) return;
    setPending(true); onBusy(true); setError(null);
    try {
      const c = await uploadCertificate({ id: uploadId.current, userId, title: type, name: file.name, mimeType: file.mimeType ?? 'application/pdf', bytes: await documentBytes(file) });
      setFile(null); setReceived(true);
      await onSaved();
      // Original evidence is saved first. Moving on does not wait for AI.
      void invokeStaffing('certificate-ai', { certificateId: c.id }).then(onSaved).catch(() => setError('Your file is saved. Processing is unavailable; use Check / retry processing below or ask your coordinator to review it.'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload. Your selected file is still here; retry.'); }
    finally { setPending(false); onBusy(false); }
  }
  return <>
    {received ? <Notice tone='success' message='Certificate received. You can continue while it is checked.' /> : null}
    {error ? <Notice tone='error' message={error} /> : null}
    <Button title={file ? 'Choose a different file' : `Upload ${type}`} secondary={Boolean(file || received)} disabled={pending} onPress={() => { void pick(); }} />
    {file ? <><Text>{file.name} · PDF, JPEG or PNG, up to 10 MB</Text><Button title={pending ? 'Uploading…' : 'Save certificate'} disabled={pending} onPress={() => { void upload(); }} /></> : null}
  </>;
}
