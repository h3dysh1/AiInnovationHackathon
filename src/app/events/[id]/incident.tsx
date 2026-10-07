import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Button, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { useStaffing } from '@/hooks/staffing';
import { myLiveAssignments, reportIncident, reportVoiceIncident, startIncidentAnalysis } from '@/services/staffing';

export default function IncidentReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useStaffing(() => myLiveAssignments(id));
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [report, setReport] = useState('');
  const [assignmentId, setAssignmentId] = useState<string | undefined>();
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [microphoneReady, setMicrophoneReady] = useState<boolean | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    void AudioModule.requestRecordingPermissionsAsync().then((permission) => {
      setMicrophoneReady(permission.granted);
      if (permission.granted) void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    });
  }, []);
  const startRecording = async () => {
    if (!microphoneReady) return;
    setRecordingUri(null);
    await recorder.prepareToRecordAsync();
    recorder.record();
  };
  const stopRecording = async () => {
    if (!recorderState.isRecording) return;
    await recorder.stop();
    setRecordingUri(recorder.uri ?? null);
  };
  if (s.loading) return <Loading label='Opening incident report…' />;
  return (
    <Page>
      <Title subtitle='Hold the radio button, speak clearly, then send. Your report is saved immediately.'>
        Report an incident
      </Title>
      {s.error ? <Notice message={s.error} /> : null}
      {microphoneReady === false
        ? <Notice message='Microphone access is off. Enable it in device settings or type the report below.' />
        : null}
      {sent
        ? (
          <>
            <Notice message='Report received. Keep your radio available and follow local safety procedures.' />
            <Button title='Report another incident' onPress={() => { setSent(false); setReport(''); }} />
            <Button title='Back to my event' secondary onPress={() => router.back()} />
          </>
        )
        : (
          <>
            {s.data?.length
              ? (
                <>
                  <Notice message='Which shift are you reporting from? This helps your coordinator locate the report.' />
                  {s.data.map((assignment) => (
                    <Button
                      key={assignment.assignment_id}
                      title={`${assignment.location} · ${assignment.post}`}
                      secondary={!assignmentId || assignmentId !== assignment.assignment_id}
                      compact
                      onPress={() => setAssignmentId(assignment.assignment_id)}
                    />
                  ))}
                </>
              )
              : null}
            <Button
              title={recorderState.isRecording ? 'Release to stop recording' : 'Hold to record voice'}
              disabled={s.pending || microphoneReady !== true}
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
              onChangeText={setReport}
              multiline
              placeholder='Add location or urgent details if voice is not practical…'
              editable={!s.pending && !recorderState.isRecording}
            />
            <Button
              title={s.pending ? 'Sending…' : 'Send report'}
              disabled={s.pending || recorderState.isRecording || (!report.trim() && !recordingUri)}
              onPress={() => {
                void s.run(async () => {
                  const saved = recordingUri
                    ? await reportVoiceIncident(id, recordingUri, assignmentId)
                    : await reportIncident(id, report, assignmentId);
                  void startIncidentAnalysis(saved.id);
                  setSent(true);
                });
              }}
            />
            <Button title='Cancel' secondary disabled={s.pending} onPress={() => router.back()} />
          </>
        )}
    </Page>
  );
}
