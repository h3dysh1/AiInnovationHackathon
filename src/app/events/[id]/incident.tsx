import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Button, Disclosure, Field, Notice, Page, Section, Title } from '@/components/ui';
import { useAuth } from '@/hooks/auth';
import { parseIncidentDraft } from '@/domain/incident-draft';
import { confirmAction } from '@/services/confirm-action';
import { loadDraft, saveDraft } from '@/services/draft-storage';
import { incidentProcessingLabel } from '@/domain/live';
import { usePolling } from '@/hooks/polling';
import { useStaffing } from '@/hooks/staffing';
import { myIncidentReports, myLiveAssignments, retryIncidentProcessing } from '@/services/staffing';
import { queueIncident, readOutbox, flushIncidentOutbox, subscribeOutbox, retryQueuedIncident } from '@/services/incident-outbox';
import type { QueuedIncident } from '@/domain/incident-outbox';

export default function IncidentReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const draftKey = `ground-control:incident-draft:${session?.user.id}:${id}`;
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const s = useStaffing(useCallback(async () => {
    const [assignments, reports] = await Promise.all([myLiveAssignments(id), myIncidentReports(id)]);
    return { assignments, reports, loadedAt: Date.now() };
  }, [id]));
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });
  const recorderState = useAudioRecorderState(recorder);
  const [report, setReport] = useState('');
  const [assignmentId, setAssignmentId] = useState<string | undefined>();
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [microphoneReady, setMicrophoneReady] = useState<boolean | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [queued, setQueued] = useState<QueuedIncident | null>(null);
  const [requestId, setRequestId] = useState(randomUUID);
  const [attempted, setAttempted] = useState(false);
  const recordingHeld = useRef(false);
  const preparingRecording = useRef(false);
  const { refresh } = s;
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    let active = true;
    const update = () => { void readOutbox(userId).then(reports => {
      if (!active) return;
      const queued = reports.find(q => q.requestId === requestId) ?? null;
      setQueued(queued);
      if (queued?.status === 'received') setSent(true);
    }).catch(() => { if (active) setDraftError('Could not read the report queue. Your saved report has been retained.'); }); };
    update();
    const unsubscribe = subscribeOutbox(update);
    return () => { active = false; unsubscribe(); };
  }, [requestId, session?.user.id]);
  usePolling(refresh, 5000, sent);
  useEffect(() => {
    let active = true;
    void loadDraft(draftKey).then(value => {
      if (!active) return;
      const draft = parseIncidentDraft(value);
      if (draft) {
        setReport(draft.report); setAssignmentId(draft.assignmentId);
        setRecordingUri(draft.recordingUri); setRequestId(draft.requestId); setAttempted(draft.attempted);
      }
    }).catch(() => { if (active) setDraftError('Local draft storage is unavailable. Keep this screen open until your report is received.'); }).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [draftKey]);
  const currentAssignment = s.data?.assignments.find(a => a.status === 'checked_in' ||
    (Date.parse(a.starts_at) <= s.data!.loadedAt && Date.parse(a.ends_at) > s.data!.loadedAt));
  const selectedAssignment = assignmentId ?? currentAssignment?.assignment_id;
  const reportingFrom = s.data?.assignments.find(a => a.assignment_id === selectedAssignment);
  useEffect(() => {
    if (!draftReady) return;
    void saveDraft(draftKey, sent || queued || (!report && !recordingUri && !attempted) ? null : JSON.stringify({ report, assignmentId: selectedAssignment, recordingUri, requestId, attempted }))
      .then(() => setDraftError(null)).catch(() => setDraftError('Your draft could not be saved on this device. Keep this screen open until receipt.'));
  }, [draftKey, draftReady, sent, queued, report, selectedAssignment, recordingUri, requestId, attempted]);
  const startRecording = async () => {
    if (preparingRecording.current || recorder.isRecording) return;
    recordingHeld.current = true;
    preparingRecording.current = true;
    setRecordingError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      setMicrophoneReady(permission.granted);
      if (!permission.granted) return;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      if (!recordingHeld.current) return;
      setRecordingUri(null);
      recorder.record();
    } catch {
      setRecordingError('Could not start recording. Try again or type your report.');
    } finally {
      preparingRecording.current = false;
    }
  };
  const stopRecording = async () => {
    recordingHeld.current = false;
    if (!recorder.isRecording) return;
    try {
      await recorder.stop();
      let uri = recorder.uri ?? null;
      if (uri && Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob();
        uri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not preserve the recording.'));
          reader.readAsDataURL(blob);
        });
      }
      setRecordingUri(uri);
    } catch {
      setRecordingError('Could not finish recording. Please type your report.');
    }
  };
  return (
    <Page>
      <Title subtitle='Type or record what happened. Receipt is confirmed after you send.'>
        Report an incident
      </Title>
      {s.error ? <Notice tone="error" message={s.error} /> : null}
      {draftError ? <Notice tone="warning" message={draftError} /> : null}
      {draftReady && !draftError && (report || recordingUri) && !sent && !queued ? <Notice message="Unsent draft saved on this device. You can return to finish it." /> : null}
      {recordingError ? <Notice tone="error" message={recordingError} /> : null}
      {microphoneReady === false
        ? <Notice message='Microphone access is off. Enable it in device settings or type the report below.' />
        : null}
      {sent
        ? (
          <>
            <Notice tone='success' message='Report received. Keep your radio available and follow local safety procedures.' />
            <Button title='Report another incident' onPress={() => {
              setSent(false); setQueued(null); setReport(''); setRecordingUri(null); setAssignmentId(undefined);
              setRequestId(randomUUID()); setAttempted(false);
            }} />
            <Button title='Back to my event' secondary onPress={() => router.back()} />
          </>
        )
        : queued ? <>
          <Notice tone='warning' message='Saved on this device and queued for sending. Receipt is not yet confirmed. Ground Control will retry when connected; supported mobile builds can also retry in the background. For urgent help, use your radio or local safety procedures.' />
          {queued.error ? <Notice tone={queued.status === 'blocked' ? 'error' : 'warning'} message={queued.error} /> : null}
          <Button title='Retry sending now' disabled={s.pending} onPress={() => { void s.run(async () => {
            await retryQueuedIncident(session!.user.id, requestId); await flushIncidentOutbox();
          }); }} />
          <Button title='Back to my event' secondary onPress={() => router.back()} />
          <Button title='View pending reports' secondary onPress={() => router.push('/notifications')} />
          <Button title='Report another incident' secondary onPress={() => {
            setQueued(null); setReport(''); setRecordingUri(null); setAssignmentId(undefined);
            setRequestId(randomUUID()); setAttempted(false);
          }} />
        </> : (
          <>
            {s.data?.assignments.length
              ? (
                <>
                  <Disclosure title={reportingFrom ? `Reporting from ${reportingFrom.location} · ${reportingFrom.post}` : 'Add your shift (optional)'}>
                  <Notice message='Choose the shift linked to this report. You can also send without a shift.' />
                  {s.data.assignments.map((assignment) => (
                    <Button
                      key={assignment.assignment_id}
                      title={`${assignment.location} · ${assignment.post}`}
                      secondary={selectedAssignment !== assignment.assignment_id}
                      compact
                      selected={selectedAssignment === assignment.assignment_id}
                      disabled={s.pending || attempted}
                      onPress={() => setAssignmentId(assignment.assignment_id)}
                    />
                  ))}
                  </Disclosure>
                </>
              )
              : null}
            <Button
              title={recorderState.isRecording ? 'Stop recording' : 'Record voice report'}
              disabled={s.pending || attempted || !draftReady}
              onPress={() => { void (recorder.isRecording ? stopRecording() : startRecording()); }}
            />
            {microphoneReady ? <Disclosure title='Hold-to-talk option'>
              <Button title='Hold to record; release to stop' secondary disabled={s.pending || attempted} onPressIn={() => { void startRecording(); }} onPressOut={() => { void stopRecording(); }} />
            </Disclosure> : null}
            {recorderState.isRecording
              ? <Notice tone='warning' message='Recording… Speak location, what happened and anything urgent.' />
              : recordingUri
                ? <Notice message='Voice report ready. Send it when you are safe.' />
                : null}
            <Field
              label={recordingUri ? 'Optional written context' : 'Or type the report'}
              value={report}
              onChangeText={(value) => setReport(value.slice(0, 4000))}
              multiline
              placeholder='Add location or urgent details if voice is not practical…'
              editable={!s.pending && !attempted && !recorderState.isRecording}
            />
            <Button
              title={s.pending ? 'Sending…' : 'Send report'}
              disabled={!draftReady || s.pending || recorderState.isRecording || (!report.trim() && !recordingUri)}
              onPress={() => {
                void s.run(async () => {
                  setAttempted(true);
                  const saved = await queueIncident({ userId: session!.user.id, eventId: id, recordingUri, assignmentId: selectedAssignment, report, requestId });
                  setQueued(saved);
                  await saveDraft(draftKey, null);
                  await flushIncidentOutbox();
                });
              }}
            />
            {attempted && !s.pending
              ? <Notice message='If receipt was interrupted, send again to confirm the same report. Check your recent reports before starting another.' />
              : null}
            <Button title='Back to event · keep draft' secondary disabled={s.pending || recorderState.isRecording} onPress={() => router.back()} />
            {report || recordingUri ? <Button title='Discard unsent draft' secondary compact disabled={s.pending || recorderState.isRecording} onPress={() => confirmAction('Discard this draft?', 'This removes the unsent text and recording from this device. Received reports remain in history.', () => {
              setReport(''); setRecordingUri(null); setAssignmentId(undefined); setAttempted(false); setRequestId(randomUUID());
              try { localStorage.removeItem(draftKey); } catch { /* Existing storage warning remains visible. */ }
            }, true)} /> : null}
          </>
        )}
      <Disclosure title='Your recent reports'>
        {s.data?.reports.map((incident) => (
          <Section key={incident.id} title={new Date(incident.created_at).toLocaleString()}>
            <Notice message={incident.raw_report} />
            <Notice message={incidentProcessingLabel(incident)} />
            {incident.processing_error ? <Notice tone="error" message={incident.processing_error} /> : null}
            {incident.processing_status === 'failed' && incident.status !== 'resolved'
              ? <Button title='Retry processing' secondary disabled={s.pending}
                  onPress={() => { void s.run(() => retryIncidentProcessing(incident.id)); }} />
              : null}
          </Section>
        ))}
        <Button title='Refresh report receipts' secondary disabled={s.pending}
          onPress={() => { void s.refresh(); }} />
      </Disclosure>
    </Page>
  );
}
