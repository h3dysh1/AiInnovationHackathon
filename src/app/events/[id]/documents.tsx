import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { type DocumentPickerAsset, getDocumentAsync } from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { openURL } from 'expo-linking';
import { Text } from 'react-native';
import { EventManagerGate } from '@/components/event-manager-gate';
import { Button, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { documentTypes } from '@/domain/planning';
import { useAuth } from '@/hooks/auth';
import { usePlanning } from '@/hooks/planning';
import { documentBytes } from '@/services/document-file';
import { documentUrl, setDocumentIncluded, uploadDocument } from '@/services/documents';
import { reviewDocument } from '@/services/planning';
export default function DocumentsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EventManagerGate id={id}>
      <Documents id={id} />
    </EventManagerGate>
  );
}
function Documents({ id }: { id: string }) {
  const s = usePlanning(id);
  const { session } = useAuth();
  const [asset, setAsset] = useState<DocumentPickerAsset | null>(null);
  const [uploadId, setUploadId] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('operations');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  async function choose() {
    await s.run(async () => {
      const r = await getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: [
          'application/pdf',
          'text/plain',
          'text/markdown',
          'text/csv',
          'application/vnd.ms-excel',
          'text/tab-separated-values',
          'image/jpeg',
          'image/png',
        ],
      });
      if (!r.canceled) {
        if ((r.assets[0].size ?? 0) > 10485760) {
          throw new Error('Choose a document smaller than 10 MB.');
        }
        setAsset(r.assets[0]);
        setTitle(r.assets[0].name);
        setUploadId(randomUUID());
      }
    });
  }
  async function upload() {
    if (!asset || !session) return;
    const mime = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      md: 'text/markdown',
      csv: 'text/csv',
      tsv: 'text/tab-separated-values',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
    }[asset.name.split('.').pop()?.toLowerCase() ?? ''] ?? asset.mimeType ??
      'application/octet-stream';
    const ok = await s.run(async () => {
      await uploadDocument({
        id: uploadId,
        eventId: id,
        userId: session.user.id,
        title,
        type,
        name: asset.name,
        mimeType: mime,
        bytes: await documentBytes(asset),
      });
    });
    if (ok) {
      setAsset(null);
      setTitle('');
    }
  }
  if (s.loading) return <Loading />;
  return (
    <Page>
      <Title subtitle='Original files are retained privately for this event.'>
        Event documents
      </Title>
      {s.error ? <Notice message={s.error} /> : null}
      <Text style={planStyles.help}>
        PDF, TXT, Markdown, CSV, TSV, JPEG or PNG · up to 10 MB per file. Export Word/Excel files to
        PDF or CSV first. Include up to 10 files / 12 MB in one AI analysis.
      </Text>
      <Button
        title='Choose document'
        disabled={s.pending}
        onPress={() => {
          void choose();
        }}
      />
      {asset
        ? (
          <PlanCard>
            <Text style={planStyles.text}>{asset.name}</Text>
            <Field label='Document title' value={title} onChangeText={setTitle} />
            <Text style={planStyles.heading}>Document type: {type.replaceAll('_', ' ')}</Text>
            {documentTypes.map((t) => (
              <Button
                key={t}
                title={`${type === t ? '✓ ' : ''}${t.replaceAll('_', ' ')}`}
                secondary
                disabled={s.pending}
                onPress={() => setType(t)}
              />
            ))}
            <Button
              title={s.pending ? 'Uploading…' : 'Upload original'}
              disabled={s.pending}
              onPress={() => {
                void upload();
              }}
            />
            <Button
              title='Cancel selection'
              secondary
              disabled={s.pending}
              onPress={() => setAsset(null)}
            />
          </PlanCard>
        )
        : null}
      {s.data?.documents.map((d) => (
        <PlanCard key={d.id}>
          <Text style={planStyles.heading}>{d.title}</Text>
          <Text style={planStyles.badge}>
            {d.processing_status.toUpperCase()} · {d.include_in_setup ? 'Included' : 'Excluded'}
          </Text>
          <Text style={planStyles.help}>
            {d.document_type.replaceAll('_', ' ')} · {d.original_name} ·{' '}
            {Math.ceil(d.size_bytes / 1024)} KB · {new Date(d.uploaded_at).toLocaleString()}
          </Text>
          {d.processing_error ? <Notice message={d.processing_error} /> : null}
          <Button
            title='View original'
            secondary
            disabled={s.pending}
            onPress={() => {
              void s.run(async () => openURL(await documentUrl(d.storage_path)));
            }}
          />
          <Button
            title={d.include_in_setup ? 'Exclude from analysis' : 'Include in analysis'}
            secondary
            disabled={s.pending}
            onPress={() => {
              void s.run(() => setDocumentIncluded(d.id, !d.include_in_setup));
            }}
          />
          {reviewId === d.id
            ? (
              <>
                <Field
                  label='How did you incorporate or resolve this document?'
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
                <Button
                  title='Record manual document review'
                  disabled={s.pending || !note.trim()}
                  onPress={() => {
                    void s.run(() => reviewDocument(d.id, note)).then((ok) => {
                      if (ok) {
                        setReviewId(null);
                        setNote('');
                      }
                    });
                  }}
                />
              </>
            )
            : (
              <Button
                title='Review manually'
                secondary
                disabled={s.pending}
                onPress={() => {
                  setReviewId(d.id);
                  setNote('');
                }}
              />
            )}
        </PlanCard>
      ))}
      <Button
        title='Analyse setup with AI'
        disabled={s.pending}
        onPress={() => router.push({ pathname: '/events/[id]/assistant', params: { id } })}
      />
      <Button
        title='Back to setup'
        secondary
        disabled={s.pending || Boolean(asset)}
        onPress={() => router.back()}
      />
    </Page>
  );
}
