import { AppText as Text } from '@/components/app-text';
import { confirmAction } from '@/services/confirm-action';
import { useCallback, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { Button, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { useAuth } from '@/hooks/auth';
import { usePolling } from '@/hooks/polling';
import { useStaffing } from '@/hooks/staffing';
import {
  certificates,
  certificateUrl,
  invokeStaffing,
  uploadCertificate,
} from '@/services/staffing';
import { documentBytes } from '@/services/document-file';
import { setupRpc } from '@/services/planning';
export default function CertificatesScreen() {
  const { session } = useAuth();
  const load = useCallback(() => certificates(session!.user.id), [session]);
  const s = useStaffing(load);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const uploadId = useRef(randomUUID());
  const { data, refresh } = s;
  usePolling(refresh, 5000, Boolean(data?.some((c) => c.status === 'processing')));
  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled) {
      setFile(result.assets[0]);
      setTitle(result.assets[0].name);
      uploadId.current = randomUUID();
    }
  }
  if (s.loading) return <Loading label='Loading certificates…' />;
  return (
    <Page>
      <Title subtitle='Your reusable certificate library. Each event asks for the qualifications it needs; originals remain private to you and authorised event managers.'>
        My certificates
      </Title>
      {s.error && <Notice tone="error" message={s.error} />}
      <Button
        title='Choose PDF or image'
        disabled={s.pending}
        onPress={() => {
          void s.run(pick);
        }}
      />
      {file && (
        <>
          <Text>{file.name}</Text>
          <Field label='Title' value={title} onChangeText={setTitle} />
          <Button
            title={s.pending ? 'Uploading…' : 'Save certificate'}
            disabled={s.pending || !title.trim()}
            onPress={() => {
              void s.run(async () => {
                const c = await uploadCertificate({
                  id: uploadId.current,
                  userId: session!.user.id,
                  title,
                  name: file.name,
                  mimeType: file.mimeType ?? 'application/pdf',
                  bytes: await documentBytes(file),
                });
                setFile(null);
                setTitle('');
                uploadId.current = randomUUID();
                await invokeStaffing('certificate-ai', { certificateId: c.id });
              });
            }}
          />
        </>
      )}
      {!s.data?.length && (
        <Notice message='No certificates saved yet. Your event onboarding will ask for relevant qualifications.' />
      )}
      {s.data?.map((c) => (
        <PlanCard key={c.id}>
          <Text style={planStyles.heading}>{c.title}</Text>
          <Text style={planStyles.badge}>{c.status.replaceAll('_', ' ').toUpperCase()}</Text>
          <Text>
            {c.type ?? 'Type awaiting extraction'}
            {c.holder_name ? ` · ${c.holder_name}` : ''}
          </Text>
          <Text>
            Issued: {c.issued_at ?? 'Unknown'} · Expires:{' '}
            {c.expires_at ?? (c.never_expires ? 'No expiry confirmed' : 'Unknown')}
          </Text>
          {c.verification_notes && <Text>{c.verification_notes}</Text>}
          {c.error_message && <Notice message={c.error_message} />}
          <Button
            title='View original'
            secondary
            disabled={s.pending}
            onPress={() => {
              void s.run(async () => {
                await Linking.openURL(await certificateUrl(c.storage_path));
              });
            }}
          />
          {['uploaded', 'failed', 'requires_review', 'processing'].includes(c.status) && (
            <Button
              title={c.status === 'processing'
                ? 'Check / retry processing'
                : 'Extract / retry with AI'}
              disabled={s.pending}
              onPress={() => {
                void s.run(() => invokeStaffing('certificate-ai', { certificateId: c.id }));
              }}
            />
          )}
          {c.status !== 'archived' && (
            <Button
              title='Archive certificate'
              secondary
              disabled={s.pending}
              onPress={() => {
                confirmAction('Archive this certificate?', 'Archived certificates are not used to establish eligibility for future assignments. The original evidence remains retained.', () => { void s.run(() => setupRpc('archive_certification', { p_id: c.id })); }, true);
              }}
            />
          )}
        </PlanCard>
      ))}
      <Button title='Back' secondary onPress={() => router.back()} />
    </Page>
  );
}
