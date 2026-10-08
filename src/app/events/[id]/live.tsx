import { AppText as Text } from '@/components/app-text';
import { IncidentReview } from '@/components/incident-review';
import { setupRpc } from '@/services/planning';
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { Button, Disclosure, Field, Loading, Notice, Page, Section, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { EventManagerGate } from '@/components/event-manager-gate';
import { useStaffing } from '@/hooks/staffing';
import { ResponseReview } from '@/components/response-review';
import { incidentProcessingLabel } from '@/domain/live';
import { closeEvent, detectRisk, incidentAudioUrl, intelligenceSnapshot, liveSnapshot, proposeResponse, resolveIncident, retryIncidentProcessing, startEvent, recordObservation } from '@/services/staffing';

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
  const [observation,setObservation]=useState('');
  const [restart,setRestart]=useState(false);
  const [closeout,setCloseout]=useState('');
  const [grace,setGrace]=useState('30');
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
      <Title subtitle={snapshot?.event.name}>Alerts</Title>
      {s.updatedAt ? <Text style={planStyles.help}>Last successful update · {s.updatedAt.toLocaleTimeString()} · refreshes every 10 seconds</Text> : null}
      {s.error && s.data ? <Notice tone='warning' message='Live data may be out of date. The last successful snapshot remains visible; refresh to retry.' /> : null}
      {s.error ? <Notice tone="error" message={s.error} /> : null}
      {snapshot
        ? (
          <>
            <Text style={planStyles.help}>{snapshot.event.status.toUpperCase()} · {snapshot.staffing.checked_in} checked in · {snapshot.staffing.missing} missing · {snapshot.staffing.late} late</Text>
            <Section title="Active incidents" count={intelligence?.incidents.length ?? 0} description="Most urgent first. Review reports and decide the next action.">
              {!intelligence?.incidents.length
                ? <Notice message='No unresolved incidents.' />
                : [...intelligence.incidents].sort((a, b) =>
                  ['critical','high','medium','low'].indexOf(a.severity??'low')-['critical','high','medium','low'].indexOf(b.severity??'low')
                ).map((incident) => (
                  <PlanCard key={incident.id}>
                    {incident.severity === 'critical'
                      ? <Notice tone='error' message='CRITICAL INCIDENT · Review immediately' />
                      : null}
                    <Text style={planStyles.badge}>{(incident.severity ?? incident.status).toUpperCase()}</Text>
                    <Text style={planStyles.heading}>{incident.summary ?? incident.raw_report}</Text>
                    <Text style={planStyles.text}>{intelligence.locations.find(l => l.id === incident.location_id)?.name ?? 'Location not confirmed'} · {new Date(incident.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    <Text style={planStyles.help}>{incidentProcessingLabel(incident)}</Text>
                    <Disclosure title='Review incident and actions'>
                    {incident.processing_error ? <Notice tone="error" message={incident.processing_error} /> : null}
                    <Disclosure title='Original report and transcript'>
                    {incident.summary ? <Text style={planStyles.text}>Original report: {incident.raw_report}</Text> : null}
                    {incident.transcript ? <Text style={planStyles.text}>Voice transcript: {incident.transcript}</Text> : null}
                    </Disclosure>
                    <Text style={planStyles.help}>{incident.category ?? 'Unclassified'} · {incident.status}</Text>
                    <Text style={planStyles.help}>{new Date(incident.created_at).toLocaleString()}</Text>
                    {incident.ai_evidence?<Text style={planStyles.help}>Evidence: {incident.ai_evidence}</Text>:null}
                    {intelligence.relations.filter(r=>r.incident_id===incident.id).map(r=><Text key={r.related_incident_id} style={planStyles.help}>Related report: {intelligence.incidents.find(i=>i.id===r.related_incident_id)?.summary??'Original retained'} · {r.relation_type.replaceAll('_',' ')}</Text>)}
                    {incident.audio_path ? <IncidentAudio path={incident.audio_path} /> : null}
                    <Button title={incident.processing_status === 'failed' ? 'Retry processing' : 'Request processing'} secondary compact
                      disabled={s.pending || incident.processing_status === 'processing' || incident.processing_status === 'queued'} onPress={() => {
                      void s.run(() => retryIncidentProcessing(incident.id));
                    }} />
                    <Button title='Draft response' secondary compact onPress={() => { void s.run(() => proposeResponse(incident.id)); }} />
                    <IncidentReview key={`${incident.id}:${incident.analyzed_at}`} incident={incident} locations={intelligence.locations} pending={s.pending} run={s.run}/>
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
                    </Disclosure>
                  </PlanCard>
                ))}
            </Section>
            <Section title="Emerging risks" count={intelligence?.risks.length ?? 0} description="Patterns needing human assessment, with supporting evidence.">
              {!intelligence?.risks.length ? <Text style={planStyles.help}>No emerging risks identified in this snapshot.</Text> : null}
              {intelligence?.risks.map((risk) => (
                <PlanCard key={risk.id}>
                  <Text style={planStyles.badge}>{risk.severity.toUpperCase()} · {risk.title}</Text>
                  <Text style={planStyles.text}>{risk.explanation}</Text>
                  <Disclosure title='Evidence and response options'>
                  {risk.evidence?.incidentIds?.map(id=><Text key={id} style={planStyles.help}>Report: {intelligence?.incidents.find(i=>i.id===id)?.summary??'Original report retained in history'}</Text>)}
                  {risk.evidence?.observationIds?.map(id=><Text key={id} style={planStyles.help}>Observation: {intelligence?.observations.find(o=>o.id===id)?.value??'Observation retained in history'}</Text>)}
                  {risk.evidence?.shiftIds?.map(id=>{const c=intelligence?.coverage.find(c=>c.shift_id===id);return c?<Text key={id} style={planStyles.help}>Coverage: {c.post} · {c.checked_in}/{c.required} checked in</Text>:null;})}
                  <Button title='Draft response' secondary compact onPress={() => { void s.run(() => proposeResponse(undefined, risk.id)); }} />
                  {['dismissed','resolved'].map(status=><Button key={status} title={status==='dismissed'?'Dismiss unsupported risk':'Confirm risk resolved'} secondary compact disabled={s.pending} onPress={()=>{void s.run(()=>setupRpc('set_risk_status',{p_id:risk.id,p_status:status}));}}/>)}
                  </Disclosure>
                </PlanCard>
              ))}
              <Button title='Check for emerging risks' secondary compact onPress={() => { void s.run(() => detectRisk(id)); }} />
            </Section>
            <Section title='Responses' count={intelligence?.responses.length ?? 0} description='Human review, approvals and response tracking.'>
              {!intelligence?.responses.length ? <Text style={planStyles.help}>No response drafts yet. Open an incident or risk to draft a response.</Text> : null}
              {intelligence?.responses.map(response=><ResponseReview key={`${response.id}:${response.revision}:${response.processing_status}`} response={response} snapshot={intelligence} pending={s.pending} run={s.run}/>)}
            </Section>
            <Section title='Coverage gaps' description='Staffing and qualification shortfalls that need attention.'>
              {!intelligence?.coverage.some(c => c.checked_in < c.required || c.qualifications.some(q => q.actual < q.required))
                ? <Notice message='No current coverage gaps.' />
                : intelligence?.coverage.filter(c => c.checked_in < c.required || c.qualifications.some(q => q.actual < q.required)).map((coverage) => (
                  <PlanCard key={coverage.shift_id}>
                    <Text style={planStyles.heading}>{coverage.post}</Text>
                    <Text style={planStyles.text}>{coverage.checked_in} / {coverage.required} checked in</Text>
                    {coverage.qualifications.map((q,index)=><Text key={index} style={planStyles.help}>{q.label} · {q.actual}/{q.required} checked in {q.actual<q.required?'· COVERAGE GAP':''}</Text>)}
                  </PlanCard>
                ))}
            </Section>
            <Disclosure title='All active post coverage'>
              {!intelligence?.coverage.length ? <Text style={planStyles.help}>No published shifts are active right now.</Text> : intelligence.coverage.map(c => <Text key={c.shift_id} style={planStyles.text}>{c.post} · {c.checked_in}/{c.required} checked in{c.qualifications.some(q => q.actual < q.required) ? ' · qualification gap' : ''}</Text>)}
            </Disclosure>
            <Disclosure title='Event procedures'>
              {intelligence?.procedures.map((procedure) => (
                <Disclosure key={procedure.id} title={procedure.title}><Text style={planStyles.text}>{procedure.content ?? 'Procedure content is not available in this snapshot.'}</Text></Disclosure>
              ))}
            </Disclosure>
          </>
        )
        : <Notice message='Live operations are unavailable until a roster is published.' />}
      {intelligence?<>
        <Section title='Event operations' description='Readiness, observations and operational history.'>
        <Button title='Weather and social signals' secondary onPress={() => router.push({ pathname: '/events/[id]/signals', params: { id } })} />
        <Disclosure title='Operational readiness' initiallyOpen={snapshot?.event.status === 'published'}>
          <Text style={planStyles.text}>{intelligence.readiness.pendingCertificates} certificates need attention · {intelligence.readiness.onboardingMissing} volunteers missing onboarding · {intelligence.readiness.missingAcknowledgements} briefings to acknowledge · {intelligence.readiness.safetyProcedures} procedures</Text>
          {snapshot?.event.status==='published'?<><Field label='No-show grace period (minutes)' value={grace} onChangeText={setGrace}/><Button title='Start live operations' disabled={s.pending||!/^\d+$/.test(grace)||Number(grace)>120} onPress={()=>{void s.run(()=>startEvent(id,Number(grace)));}}/></>:null}
        </Disclosure>
        <Disclosure title='Manual operational observations'>
          <Field label='Observation (include location and measured facts)' value={observation} onChangeText={setObservation} multiline/>
          <Button title='Record observation and reassess risks' disabled={s.pending||!observation.trim()} onPress={()=>{void s.run(async()=>{await recordObservation(id,'other',observation,null);setObservation('');});}}/>
          {intelligence.observations.map(o=><Text key={o.id} style={planStyles.text}>{new Date(o.observed_at).toLocaleTimeString()} · {o.value}</Text>)}
        </Disclosure>
        <Disclosure title='Operational timeline'>{intelligence.timeline.map(t=><Text key={t.id} style={planStyles.text}>{new Date(t.created_at).toLocaleTimeString()} · {t.event_type.replaceAll('_',' ')} · {t.detail.startsWith('{')?'Assignment updated; see response tracking for the crew instruction.':t.detail}</Text>)}</Disclosure>
        <Disclosure title='Attendance totals'><Text style={planStyles.text}>{snapshot?.staffing.assigned ?? 0} assigned · {snapshot?.staffing.checked_in ?? 0} checked in · {snapshot?.staffing.late ?? 0} late · {snapshot?.staffing.missing ?? 0} missing · {snapshot?.staffing.completed ?? 0} completed</Text></Disclosure>
        </Section>
      </>:null}
      {snapshot?.event.is_demo&&(id==='d1000000-0000-4000-8000-000000000001'||snapshot.event.demo_source_id==='d1000000-0000-4000-8000-000000000001')?<Disclosure title='Live demo'>
        <Button title='Start a fresh live demo' secondary disabled={s.pending} onPress={()=>setRestart(!restart)}/>
        {restart?<><Notice message='This ends this synthetic scenario and prepares fresh active shifts, initial check-ins and reserves. Its reports and decisions stay in history.'/><Button title='End this demo and prepare a fresh scenario' disabled={s.pending} onPress={()=>{void s.run(async()=>{const next=await setupRpc<string>('restart_riverside_demo',{p_event_id:id});router.replace({pathname:'/events/[id]/live',params:{id:next}});});}}/></>:null}
      </Disclosure>:null}
      <Button title='Refresh live status' secondary disabled={s.pending} onPress={() => { void s.refresh(); }} />
      {snapshot?.event.status === 'live'
        ? <Disclosure title='Reviewed closeout'>
          <Button title='Generate event summary draft' secondary disabled={s.pending} onPress={()=>{void s.run(()=>setupRpc('request_event_summary',{p_event_id:id}));}}/>
          <Text style={planStyles.help}>AI summary: {intelligence?.summary.status??'Not requested'}</Text>
          {intelligence?.summary.error?<Notice message={intelligence.summary.error}/>:null}
          {intelligence?.summary.summary?<Button title='Use generated draft for review' secondary disabled={s.pending} onPress={()=>setCloseout(intelligence.summary.summary??'')}/>:null}
          <Field label='Review and edit event summary' value={closeout} onChangeText={setCloseout} multiline/>
          <Button title='Confirm summary and close event' disabled={s.pending||!closeout.trim()} onPress={()=>{void s.run(()=>closeEvent(id,closeout));}}/>
        </Disclosure>
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
  const [error, setError] = useState<string | null>(null);
  const play = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextUrl = url ?? await incidentAudioUrl(path);
      if (!url) {
        setUrl(nextUrl);
        player.replace(nextUrl);
      }
      player.play();
    } catch {
      setUrl(null);
      setError('Could not play the saved recording. Try again.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
    {error ? <Notice tone="error" message={error} /> : null}
    <Button
      title={loading ? 'Loading voice report…' : status.playing ? 'Pause voice report' : 'Play voice report'}
      secondary
      compact
      disabled={loading}
      onPress={() => { void play(); }}
    />
    </>
  );
}
