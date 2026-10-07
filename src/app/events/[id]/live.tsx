import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Text } from 'react-native';
import { Button, Field, Loading, Notice, Page, Section, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { EventManagerGate } from '@/components/event-manager-gate';
import { useStaffing } from '@/hooks/staffing';
import { analyzeIncident, approveResponse, closeEvent, correlateIncident, detectRisk, incidentAudioUrl, intelligenceSnapshot, liveSnapshot, proposeResponse, resolveIncident } from '@/services/staffing';

export default function LiveRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventManagerGate id={id}><LiveDashboard id={id} /></EventManagerGate>;
}

function LiveDashboard({ id }: { id: string }) {
  const s = useStaffing(useCallback(async () => ({
    live: await liveSnapshot(id),
    intelligence: await intelligenceSnapshot(id),
  }), [id]));
  const [resolution, setResolution] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [instruction, setInstruction] = useState('');
  const { refresh } = s;
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [refresh]);
  if (s.loading) return <Loading label='Loading live operations…' />;
  const snapshot = s.data?.live;
  const intelligence = s.data?.intelligence;
  return (
    <Page>
      <Title subtitle={snapshot?.event.name}>Live operations</Title>
      {s.error ? <Notice message={s.error} /> : null}
      {snapshot
        ? (
          <>
            <PlanCard>
              <Text style={planStyles.badge}>EVENT STATUS · {snapshot.event.status.toUpperCase()}</Text>
              <Text style={planStyles.heading}>
                {snapshot.staffing.checked_in} checked in · {snapshot.staffing.missing} missing
              </Text>
              <Text style={planStyles.text}>
                {snapshot.staffing.assigned} assigned · {snapshot.staffing.late} late · {snapshot.staffing.completed} completed
              </Text>
            </PlanCard>
            <Section title='Coverage now'>
              {!snapshot.coverage.length
                ? <Notice message='No published shifts are active right now.' />
                : snapshot.coverage.map((coverage) => (
                  <PlanCard key={`${coverage.location}-${coverage.post}`}>
                    <Text style={planStyles.heading}>{coverage.post}</Text>
                    <Text style={planStyles.text}>{coverage.location} · {coverage.checked_in} / {coverage.required} checked in</Text>
                    {coverage.missing > 0
                      ? <Notice message={`${coverage.missing} assigned volunteer${coverage.missing === 1 ? '' : 's'} missing.`} />
                      : null}
                  </PlanCard>
                ))}
            </Section>
            <Section title={`Incident intelligence · ${intelligence?.incidents.length ?? 0}`}>
              {!intelligence?.incidents.length
                ? <Notice message='No unresolved incidents.' />
                : [...intelligence.incidents].sort((a, b) =>
                  (b.severity === 'critical' ? 1 : 0) - (a.severity === 'critical' ? 1 : 0)
                ).map((incident) => (
                  <PlanCard key={incident.id}>
                    {incident.severity === 'critical'
                      ? <Notice message='CRITICAL INCIDENT · Review immediately' />
                      : null}
                    <Text style={planStyles.badge}>{(incident.severity ?? incident.status).toUpperCase()}</Text>
                    <Text style={planStyles.text}>{incident.summary ?? incident.raw_report}</Text>
                    <Text style={planStyles.help}>{incident.category ?? 'Unclassified'} · {incident.status}</Text>
                    <Text style={planStyles.help}>{new Date(incident.created_at).toLocaleString()}</Text>
                    {incident.audio_path ? <IncidentAudio path={incident.audio_path} /> : null}
                    <Button title={incident.analyzed_at ? 'Re-check related reports' : 'Analyze report'} secondary compact onPress={() => {
                      void s.run(async () => { await analyzeIncident(incident.id); await correlateIncident(incident.id); });
                    }} />
                    <Button title='Draft response' secondary compact onPress={() => { void s.run(() => proposeResponse(incident.id)); }} />
                    {resolution === incident.id
                      ? (
                        <>
                          <Field label='Resolution notes' value={notes} onChangeText={setNotes} multiline />
                          <Button title='Resolve incident' disabled={!notes.trim() || s.pending} compact onPress={() => {
                            void s.run(async () => { await resolveIncident(incident.id, notes); setResolution(null); setNotes(''); });
                          }} />
                        </>
                      )
                      : <Button title='Resolve' secondary compact onPress={() => { setResolution(incident.id); setNotes(''); }} />}
                  </PlanCard>
                ))}
            </Section>
            <Section title={`Risk alerts · ${intelligence?.risks.length ?? 0}`}>
              {intelligence?.risks.map((risk) => (
                <PlanCard key={risk.id}>
                  <Text style={planStyles.badge}>{risk.severity.toUpperCase()} · {risk.title}</Text>
                  <Text style={planStyles.text}>{risk.explanation}</Text>
                  <Button title='Draft response' secondary compact onPress={() => { void s.run(() => proposeResponse(undefined, risk.id)); }} />
                </PlanCard>
              ))}
              <Button title='Check for emerging risks' secondary compact onPress={() => { void s.run(() => detectRisk(id)); }} />
            </Section>
            <Section title='Approved responses'>
              {intelligence?.responses.map((response) => (
                <PlanCard key={response.id}>
                  <Text style={planStyles.heading}>{response.title}</Text>
                  <Text style={planStyles.text}>{response.rationale}</Text>
                  <Text style={planStyles.badge}>{response.status.toUpperCase()}</Text>
                  {response.status === 'proposed'
                    ? (
                      <>
                        <Field label='Approved instruction' value={instruction} onChangeText={setInstruction} multiline placeholder='Where should the volunteer report, and what should they do?' />
                        <Button title='Approve and dispatch' disabled={!instruction.trim() || s.pending} onPress={() => {
                          void s.run(() => approveResponse(response.id, instruction));
                        }} />
                      </>
                    )
                    : null}
                </PlanCard>
              ))}
            </Section>
            <Section title='Event procedures'>
              {intelligence?.procedures.map((procedure) => (
                <Text key={procedure.id} style={planStyles.text}>{procedure.title} · {procedure.document_type.replaceAll('_', ' ')}</Text>
              ))}
            </Section>
          </>
        )
        : <Notice message='Live operations are unavailable until a roster is published.' />}
      <Button title='Refresh live status' onPress={() => { void s.refresh(); }} />
      {snapshot?.event.status === 'live'
        ? <Button title='Close event' secondary onPress={() => { void s.run(() => closeEvent(id, 'Event operations completed.')); }} />
        : null}
      <Button title='Back to event' secondary onPress={() => router.back()} />
    </Page>
  );
}

function IncidentAudio({ path }: { path: string }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const play = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    setLoading(true);
    try {
      const nextUrl = url ?? await incidentAudioUrl(path);
      if (!url) {
        setUrl(nextUrl);
        player.replace(nextUrl);
      }
      player.play();
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button
      title={loading ? 'Loading voice report…' : status.playing ? 'Pause voice report' : 'Play voice report'}
      secondary
      compact
      disabled={loading}
      onPress={() => { void play(); }}
    />
  );
}
