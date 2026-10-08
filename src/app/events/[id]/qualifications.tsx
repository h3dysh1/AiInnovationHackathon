import { AppText as Text } from '@/components/app-text';
import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';
import { EventManagerGate } from '@/components/event-manager-gate';
import { Button, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { useAuth } from '@/hooks/auth';
import { useStaffing } from '@/hooks/staffing';
import {
  certificateValidity,
  certificateDateWarnings,
  type Certification,
  validateCertificateFields,
} from '@/domain/certification';
import { certificateUrl, crewContext } from '@/services/staffing';
import { getEvent } from '@/services/events';
import { setupRpc } from '@/services/planning';
export default function Qualifications() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EventManagerGate id={id}>
      <Review id={id} />
    </EventManagerGate>
  );
}
function Review({ id }: { id: string }) {
  const { session } = useAuth();
  const load = useCallback(
    async () => ({ crew: await crewContext(id), event: await getEvent(id) }),
    [id],
  );
  const s = useStaffing(load);
  const [selected, setSelected] = useState<Certification | null>(null);
  const [fields, setFields] = useState({
    type: '',
    holderName: '',
    certificateNumber: '',
    issuer: '',
    issuedAt: '',
    expiresAt: '',
  });
  const [never, setNever] = useState(false);
  const [note, setNote] = useState('');
  if (s.loading) return <Loading />;
  const pendingCount = s.data?.crew.flatMap(m => m.certifications).filter(c => ['uploaded', 'processing', 'requires_review', 'failed'].includes(c.status)).length ?? 0;
  const select = (c: Certification) => {
    setSelected(c);
    setFields({
      type: c.type ?? '',
      holderName: c.holder_name ?? '',
      certificateNumber: c.certificate_number ?? '',
      issuer: c.issuer ?? '',
      issuedAt: c.issued_at ?? '',
      expiresAt: c.expires_at ?? '',
    });
    setNever(c.never_expires);
    setNote('');
  };
  const review = (accept: boolean) =>
    s.run(async () => {
      if (!selected) return;
      const candidate = accept
        ? validateCertificateFields({
          ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim() || null])),
          confidence: selected.extraction_confidence ?? 0,
        })
        : selected.extraction ??
          {
            type: selected.type,
            holderName: selected.holder_name,
            certificateNumber: selected.certificate_number,
            issuer: selected.issuer,
            issuedAt: selected.issued_at,
            expiresAt: selected.expires_at,
            confidence: 0,
          };
      await setupRpc('review_certification', {
        p_id: selected.id,
        p_fields: candidate,
        p_never_expires: never,
        p_accept: accept,
        p_note: note,
      });
      setSelected(null);
    });
  return (
    <Page>
      <Title subtitle='Every certificate needs human approval. Review the original evidence; qualifications must cover the whole event.'>
        Crew qualifications
      </Title>
      {s.error && <Notice tone="error" message={s.error} />}
      {s.data ? <Notice message={`${pendingCount} certificate${pendingCount === 1 ? '' : 's'} awaiting approval or processing. Date warnings remain in force after approval.`} /> : null}
      {selected && (
        <PlanCard>
          <Text style={planStyles.heading}>Review {selected.title}</Text>
          <Button
            title='View original evidence'
            secondary
            onPress={() => {
              void s.run(async () => {
                await Linking.openURL(await certificateUrl(selected.storage_path));
              });
            }}
          />
          {(Object.keys(fields) as (keyof typeof fields)[]).map((k) => (
            <Field
              key={k}
              label={k.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase())}
              value={fields[k]}
              onChangeText={(v) => setFields({ ...fields, [k]: v })}
              placeholder={k.endsWith('At') ? 'YYYY-MM-DD' : ''}
            />
          ))}
          {s.data ? certificateDateWarnings({ issued_at: fields.issuedAt || null, expires_at: fields.expiresAt || null, never_expires: never }, s.data.event.start_date, s.data.event.end_date).map(warning => <Notice key={warning} tone='warning' message={warning} />) : null}
          <Text style={planStyles.help}>Approval confirms your review of the evidence. A certificate with a date warning still cannot satisfy this event’s staffing requirements.</Text>
          <Button
            title={never ? '✓ No expiry confirmed' : 'Confirm certificate has no expiry'}
            secondary
            onPress={() => {
              setNever(!never);
              if (!never) setFields({ ...fields, expiresAt: '' });
            }}
          />
          <Field label='Review notes (required)' value={note} onChangeText={setNote} multiline />
          <Button
            title='Approve certificate after review'
            disabled={s.pending || !note.trim()}
            onPress={() => {
              void review(true);
            }}
          />
          <Button
            title='Reject with reason'
            secondary
            disabled={s.pending || !note.trim()}
            onPress={() => {
              void review(false);
            }}
          />
          <Button title='Cancel review' secondary onPress={() => setSelected(null)} />
        </PlanCard>
      )}
      {s.data?.crew.map((m) => (
        <PlanCard key={m.user_id}>
          <Text style={planStyles.heading}>{m.display_name}</Text>
          <Text>{m.onboarding ? 'Availability submitted' : 'Availability not submitted'}</Text>
          {m.onboarding?.experience_tags.length
            ? (
              <>
                <Text>
                  Experience: {m.onboarding.experience_tags.join(', ')} ·{' '}
                  {m.onboarding.experience_reviewed ? 'Reviewed' : 'Needs review'}
                </Text>
                {!m.onboarding.experience_reviewed && m.user_id !== session?.user.id && (
                  <Button
                    title='Confirm experience after review'
                    secondary
                    disabled={s.pending}
                    onPress={() => {
                      void s.run(() =>
                        setupRpc('review_event_experience', {
                          p_event_id: id,
                          p_user_id: m.user_id,
                        })
                      );
                    }}
                  />
                )}
              </>
            )
            : null}
          {!m.certifications.length && <Text>No certificates uploaded.</Text>}
          {m.certifications.map((c) => (
            <PlanCard key={c.id}>
              <Text>{c.title} · {c.status.replaceAll('_', ' ')}</Text>
              <Text>{c.type ?? 'Type unknown'} · Expiry: {c.expires_at ?? (c.never_expires ? 'No expiry confirmed' : 'Unknown')}</Text>
              <Text>{c.reviewed_at ? `Human ${c.status === 'rejected' ? 'rejection' : 'review'} recorded ${new Date(c.reviewed_at).toLocaleDateString()}` : 'Awaiting human approval'}</Text>
              {certificateDateWarnings(c, s.data!.event.start_date, s.data!.event.end_date).map(warning => <Notice key={warning} tone='warning' message={`${warning}${c.status === 'requires_review' ? ' Extracted details need checking against the original.' : ''}`} />)}
              <Text>
                {certificateValidity(c, s.data!.event.start_date, s.data!.event.end_date) ??
                  'Valid for this full event'}
              </Text>
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
              {m.user_id !== session?.user.id && (
                <Button
                  title='Review / correct certificate'
                  secondary
                  disabled={s.pending}
                  onPress={() => select(c)}
                />
              )}
            </PlanCard>
          ))}
        </PlanCard>
      ))}
      <Button
        title='Refresh'
        secondary
        onPress={() => {
          void s.refresh();
        }}
      />
      <Button title='Back' secondary onPress={() => router.back()} />
    </Page>
  );
}
