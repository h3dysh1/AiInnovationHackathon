import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Button, Field, Notice, Page, Section, Title } from '@/components/ui';
import { incidentProcessingLabel } from '@/domain/live';
import { useStaffing } from '@/hooks/staffing';
import { myIncidentReports, myLiveAssignments, reportIncident, reportVoiceIncident, retryIncidentProcessing } from '@/services/staffing';

export default function IncidentReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useStaffing(useCallback(async () => {
    const [assignments, reports] = await Promise.all([myLiveAssignments(id), myIncidentReports(id)]);
    return { assignments, reports };
  }, [id]));
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [report, setReport] = useState('');
  const [assignmentId, setAssignmentId] = useState<string | undefined>();
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [microphoneReady, setMicrophoneReady] = useState<boolean | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [requestId, setRequestId] = useState(randomUUID);
  const [attempted, setAttempted] = useState(false);
  const recordingHeld = useRef(false);
  const preparingRecording = useRef(false);
  const { refresh } = s;
  useEffect(() => {
    if (!sent) return;
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [sent, refresh]);
  useEffect(() => {
    void AudioModule.requestRecordingPermissionsAsync().then(async (permission) => {
      setMicrophoneReady(permission.granted);
      if (permission.granted) await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    }).catch(() => {
      setMicrophoneReady(false);
      setRecordingError('Microphone unavailable. You can type your report.');
    });
  }, []);
  const startRecording = async () => {
    if (!microphoneReady) return;
    if (preparingRecording.current || recorder.isRecording) return;
    recordingHeld.current = true;
    preparingRecording.current = true;
    setRecordingError(null);
    try {
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
      setRecordingUri(recorder.uri ?? null);
    } catch {
      setRecordingError('Could not finish recording. Please type your report.');
    }
  };
  return (
    <Page>
      <Title subtitle='Hold the radio button, speak clearly, then send. Your report is saved immediately.'>
        Report an incident
      </Title>
      {s.error ? <Notice message={s.error} /> : null}
      {recordingError ? <Notice message={recordingError} /> : null}
      {microphoneReady === false
        ? <Notice message='Microphone access is off. Enable it in device settings or type the report below.' />
        : null}
      {sent
        ? (
          <>
            <Notice message='Report received. Keep your radio available and follow local safety procedures.' />
            <Button title='Report another incident' onPress={() => {
              setSent(false); setReport(''); setRecordingUri(null); setAssignmentId(undefined);
              setRequestId(randomUUID()); setAttempted(false);
            }} />
            <Button title='Back to my event' secondary onPress={() => router.back()} />
          </>
        )
        : (
          <>
            {s.data?.assignments.length
              ? (
                <>
                  <Notice message='Which shift are you reporting from? This helps your coordinator locate the report.' />
                  {s.data.assignments.map((assignment) => (
                    <Button
                      key={assignment.assignment_id}
                      title={`${assignment.location} · ${assignment.post}`}
                      secondary={!assignmentId || assignmentId !== assignment.assignment_id}
                      compact
                      disabled={s.pending || attempted}
                      onPress={() => setAssignmentId(assignment.assignment_id)}
                    />
                  ))}
                </>
              )
              : null}
            <Button
              title={recorderState.isRecording ? 'Release to stop recording' : 'Hold to record voice'}
              disabled={s.pending || attempted || microphoneReady !== true}
              onPressIn={() => { void startRecording(); }}
              onPressOut={() => { void stopRecording(); }}
            />
            {recorderState.isRecording
              ? <Notice message='Recording… Speak location, what happened and anything urgent.' />
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
              disabled={s.pending || recorderState.isRecording || (!report.trim() && !recordingUri)}
              onPress={() => {
                void s.run(async () => {
                  setAttempted(true);
                  if (recordingUri) await reportVoiceIncident(id, recordingUri, assignmentId, report, requestId);
                  else await reportIncident(id, report, assignmentId, requestId);
                  setSent(true);
                });
              }}
            />
            {attempted && !s.pending
              ? <Notice message='If receipt was interrupted, send again to confirm the same report. Check your recent reports before starting another.' />
              : null}
            <Button title='Cancel' secondary disabled={s.pending} onPress={() => router.back()} />
          </>
        )}
      <Section title='Your recent reports'>
        {s.data?.reports.map((incident) => (
          <Section key={incident.id} title={new Date(incident.created_at).toLocaleString()}>
            <Notice message={incident.raw_report} />
            <Notice message={incidentProcessingLabel(incident)} />
            {incident.processing_error ? <Notice message={incident.processing_error} /> : null}
            {incident.processing_status === 'failed' && incident.status !== 'resolved'
              ? <Button title='Retry processing' secondary disabled={s.pending}
                  onPress={() => { void s.run(() => retryIncidentProcessing(incident.id)); }} />
              : null}
          </Section>
        ))}
        <Button title='Refresh report receipts' secondary disabled={s.pending}
          onPress={() => { void s.refresh(); }} />
      </Section>
    </Page>
  );
}
