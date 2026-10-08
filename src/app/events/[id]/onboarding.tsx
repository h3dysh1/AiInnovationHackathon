import { loadDraft, saveDraft } from '@/services/draft-storage';
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { AppText as Text } from '@/components/app-text';
import { OnboardingPage, Choice } from '@/components/onboarding-ui';
import { Button, Disclosure, Field, Loading, Notice, Page } from '@/components/ui';
import { TemporalField } from '@/components/temporal-field';
import { QualificationUpload } from '@/components/qualification-upload';
import { useAuth } from '@/hooks/auth';
import { useStaffing } from '@/hooks/staffing';
import { certificates, onboardingContext, invokeStaffing } from '@/services/staffing';
import { getEvent } from '@/services/events';
import { setupRpc } from '@/services/planning';
import { eventQualifications, eventQualificationStatus, parseEventOnboardingDraft } from '@/domain/event-onboarding';
import { colors } from '@/theme';

type Window = { startDate: string; endDate: string; startTime: string; endTime: string };
type Briefing = { revision: number; acknowledged: boolean; procedures: { title: string; content: string }[] };
function wallClock(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (key: string) => parts.find(p => p.type === key)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}
export default function EventOnboarding() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const loader = useCallback(async () => {
    if (!session) throw new Error('Log in to prepare for this event.');
    const [event, context, owned, briefing] = await Promise.all([getEvent(id), onboardingContext(id), certificates(session.user.id), setupRpc<Briefing>('event_briefing', { p_event_id: id })]);
    return { event, context, owned, briefing };
  }, [id, session]);
  const s = useStaffing(loader);
  if (s.loading) return <Loading label='Getting your event ready…' />;
  if (!s.data || !session) return <Page><Notice tone='error' message={s.error ?? 'Join this event before starting onboarding.'} /><Button title='Try again' onPress={() => { void s.refresh(); }} /><Button title='My events' secondary onPress={() => router.replace('/volunteer')} /></Page>;
  return <EventSteps id={id} userId={session.user.id} data={s.data} refresh={s.refresh} />;
}
function EventSteps({ id, userId, data, refresh }: { id: string; userId: string; data: { event: Awaited<ReturnType<typeof getEvent>>; context: Awaited<ReturnType<typeof onboardingContext>>; owned: Awaited<ReturnType<typeof certificates>>; briefing: Briefing }; refresh: () => Promise<void> }) {
  const [requestedStep, setStep] = useState(0);
  const qualifications = eventQualifications(data.context.requirements);
  const certificateStart = 3, briefingStep = certificateStart + qualifications.length, finishStep = briefingStep + 1;
  const [windows, setWindows] = useState<Window[]>(() => data.context.availability.map(a => { const start = wallClock(a.starts_at, data.event.timezone), end = wallClock(a.ends_at, data.event.timezone); return { startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time }; }));
  const [editingWindow, setEditingWindow] = useState(-1);
  const preferences = data.context.preferences;
  const [submitted, setSubmitted] = useState(Boolean(preferences?.submitted_at));
  const [hours, setHours] = useState(String(preferences?.desired_hours ?? 8));
  const [maximum, setMaximum] = useState(String(preferences?.maximum_hours ?? 40));
  const [daily, setDaily] = useState(String(preferences?.maximum_daily_hours ?? 8));
  const [preferred, setPreferred] = useState(preferences?.preferred_posts ?? []);
  const [procedurePosition, setProcedurePosition] = useState({ revision: data.briefing.revision, index: 0 });
  const procedureIndex = procedurePosition.revision === data.briefing.revision ? procedurePosition.index : 0;
  const setProcedureIndex = (index: number) => setProcedurePosition({ revision: data.briefing.revision, index });
  const [ackRevision, setAckRevision] = useState<number | null>(data.briefing.acknowledged ? data.briefing.revision : null);
  const acknowledged = data.briefing.acknowledged || ackRevision === data.briefing.revision;
  const step = requestedStep === finishStep && !acknowledged ? briefingStep : requestedStep;
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftKey = `ground-control:event-onboarding:${userId}:${id}`;
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    let active = true;
    void loadDraft(draftKey).then(raw => {
      if (!active) return;
      const draft = parseEventOnboardingDraft(raw);
      if (draft) {
        setWindows(draft.windows); setHours(draft.hours); setMaximum(draft.maximum); setDaily(draft.daily);
        setPreferred(draft.preferred.filter(p => data.context.posts.some(post => post.id === p)));
        setStep(draft.revision === data.event.setup_revision ? Math.min(draft.step, data.context.preferences ? data.briefing.acknowledged ? finishStep : briefingStep : 2) : 0);
      }
    }).catch(() => { if (active) setDraftError('Local resume is unavailable. Keep this screen open until your availability is saved.'); }).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
    // Restore once per user/event; refreshes must never overwrite an in-progress form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => {
    if (!draftReady || finished) return;
    void saveDraft(draftKey, JSON.stringify({ revision: data.event.setup_revision, step, windows, hours, maximum, daily, preferred })).then(() => setDraftError(null)).catch(() => setDraftError('Could not keep your draft on this device. Stay here until you save successfully.'));
  }, [draftReady, finished, draftKey, data.event.setup_revision, step, windows, hours, maximum, daily, preferred]);
  const qualification = step >= certificateStart && step < briefingStep ? qualifications[step - certificateStart] : null;
  const status = qualification ? eventQualificationStatus(data.owned, qualification.type, data.event.start_date, data.event.end_date) : null;
  const run = async (action: () => Promise<void>) => { setPending(true); setError(null); try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your details are still here; try again.'); } finally { setPending(false); } };
  async function next() {
    if (step === 1 && !windows.length) { setError('Add at least one time when you can volunteer.'); return; }
    if (step === 2) {
      await run(async () => {
        if ([hours, maximum, daily].some(v => !v.trim() || !Number.isFinite(Number(v)) || Number(v) <= 0)) throw new Error('Enter positive hours for each limit.');
        await setupRpc('save_event_onboarding', { p_event_id: id, p_windows: windows, p_preferences: { preferredPosts: preferred, avoidedPosts: (preferences?.avoided_posts ?? []).filter(p => !preferred.includes(p)), preferredStart: preferences?.preferred_start?.slice(0, 5) ?? '', preferredEnd: preferences?.preferred_end?.slice(0, 5) ?? '', desiredHours: Number(hours), maximumHours: Number(maximum), maximumDailyHours: Number(daily), experienceTags: preferences?.experience_tags ?? [] } });
        setSubmitted(true); setStep(step + 1);
      });
      return;
    }
    if (step === briefingStep && !acknowledged) {
      if (procedureIndex < data.briefing.procedures.length - 1) { setProcedureIndex(procedureIndex + 1); return; }
      await run(async () => { await setupRpc('acknowledge_event_briefing', { p_event_id: id, p_revision: data.briefing.revision }); setAckRevision(data.briefing.revision); setStep(finishStep); });
      return;
    }
    if (step === finishStep) { if (!submitted || !acknowledged) { setStep(!submitted ? 2 : briefingStep); setError('Complete availability and the current briefing before finishing.'); return; } setFinished(true); await saveDraft(draftKey, null).catch(() => {}); router.replace({ pathname: '/events/[id]', params: { id } }); return; }
    setError(null); setStep(step + 1);
  }
  const title = step === 0 ? `You’re joining ${data.event.name}.` : step === 1 ? 'When can you help?' : step === 2 ? 'Find your fit.' : qualification ? `Do you hold ${qualification.type}?` : step === briefingStep ? 'Before you arrive.' : 'You’re getting ready.';
  const subtitle = step === 0 ? 'A few steps to help your coordinator place you in the crew.' : step === 1 ? `Add your available times. All times are in ${data.event.timezone}.` : step === 2 ? 'Choose your hours and, if you like, the roles that interest you.' : qualification ? `Used at ${qualification.posts.join(', ')}. It is not required for every volunteer role.` : step === briefingStep ? 'Read the event’s current instructions. Acknowledge them when you’re ready.' : 'Your availability has been submitted. Your coordinator will publish your assignments here.';
  const pendingQualifications = qualifications.filter(q => eventQualificationStatus(data.owned, q.type, data.event.start_date, data.event.end_date).state !== 'valid').length;
  if (!draftReady) return <Loading label='Restoring your progress…' />;
  return <OnboardingPage step={step} total={finishStep + 1} title={title} subtitle={subtitle} onBack={() => { if (pending || uploading) return; setError(null); if (step > 0) setStep(step - 1); else router.replace('/volunteer'); }}>
    {error ? <Notice tone='error' message={error} /> : null}
    {draftError ? <Notice tone='warning' message={draftError} /> : null}
    {step === 0 ? <><Text>{data.event.venue_name}{'\n'}{data.event.start_date} – {data.event.end_date}</Text><Text>Availability → relevant qualifications → event briefing</Text><Text style={{ color: colors.secondary }}>Your reusable profile is already with you. Any valid certificates you have saved will be used automatically.</Text></> : null}
    {step === 1 ? <>
      {windows.map((w, i) => editingWindow === i ? <View key={i} style={{ gap: 20 }}>
        <Text accessibilityRole='header'>Availability window {i + 1}</Text>
        {(['startDate', 'startTime', 'endDate', 'endTime'] as const).map(key => <TemporalField key={key} mode={key.includes('Date') ? 'date' : 'time'} label={key.replace(/[A-Z]/g, c => ' ' + c.toLowerCase())} value={w[key]} onChangeText={value => setWindows(windows.map((item, index) => index === i ? { ...item, [key]: value } : item))} />)}
        <Button title='Done editing this time' secondary onPress={() => setEditingWindow(-1)} />
        <Button title='Remove this time' secondary onPress={() => { setWindows(windows.filter((_, index) => index !== i)); setEditingWindow(-1); }} />
      </View> : <Button secondary key={i} title={`${w.startDate} · ${w.startTime} → ${w.endDate} · ${w.endTime} · Edit`} onPress={() => setEditingWindow(i)} />)}
      <Button title='Add a time I can volunteer' secondary disabled={editingWindow >= 0 || windows.length >= 100} onPress={() => { setWindows([...windows, { startDate: data.event.start_date, endDate: data.event.start_date, startTime: data.event.operating_start_time.slice(0, 5), endTime: data.event.operating_end_time.slice(0, 5) }]); setEditingWindow(windows.length); }} />
    </> : null}
    {step === 2 ? <><Field label='Hours I’d like to volunteer' value={hours} onChangeText={setHours} keyboardType='decimal-pad' /><Disclosure title='My maximum hours'><Field label='Maximum across the event' value={maximum} onChangeText={setMaximum} keyboardType='decimal-pad' /><Field label='Maximum in one day' value={daily} onChangeText={setDaily} keyboardType='decimal-pad' /></Disclosure><Disclosure title='Roles I’m interested in (optional)'>{data.context.posts.map(post => <Choice multiple key={post.id} title={post.name} description={post.location_name} selected={preferred.includes(post.id)} onPress={() => setPreferred(preferred.includes(post.id) ? preferred.filter(p => p !== post.id) : [...preferred, post.id])} />)}</Disclosure><Text style={{ color: colors.secondary }}>Preferences guide the roster. Maximum hours and qualification requirements remain enforced.</Text></> : null}
    {qualification && status ? <>
      <Notice tone={status.state === 'valid' ? 'success' : status.state === 'pending' ? 'info' : 'warning'} message={status.message} />
      {status.certificate ? <Text>{status.certificate.title} · {status.certificate.status.replaceAll('_', ' ')}</Text> : null}
      {status.state !== 'valid' ? <QualificationUpload key={qualification.type} type={qualification.type} userId={userId} onSaved={refresh} onBusy={setUploading} /> : null}
      {status.certificate && ['uploaded', 'processing', 'requires_review', 'failed'].includes(status.certificate.status) ? <Button title='Check / retry processing' secondary disabled={pending || uploading} onPress={() => { void run(async () => { await invokeStaffing('certificate-ai', { certificateId: status.certificate!.id }); await refresh(); }); }} /> : null}
      <Text style={{ color: colors.secondary }}>The original stays in your private certificate library for future events. Uploading does not automatically verify it.</Text>
    </> : null}
    {step === briefingStep ? <>
      {data.briefing.procedures.length ? <><Text style={{ color: colors.secondary }}>Procedure {procedureIndex + 1} of {data.briefing.procedures.length}</Text><Text accessibilityRole='header' style={{ fontSize: 22, lineHeight: 30 }}>{data.briefing.procedures[procedureIndex]?.title}</Text><Text>{data.briefing.procedures[procedureIndex]?.content}</Text></> : <Text>No procedures have been shared yet. Follow your coordinator’s instructions; new procedures may require another acknowledgement.</Text>}
      {acknowledged ? <Notice tone='success' message='You have already acknowledged this version.' /> : null}
      {error ? <Button title='Load updated briefing' secondary disabled={pending} onPress={() => { void refresh().then(() => { setProcedureIndex(0); setAckRevision(null); }); }} /> : null}
    </> : null}
    {step === finishStep ? <><Text>Availability · submitted</Text><Text>Event briefing · acknowledged</Text><Notice tone={pendingQualifications ? 'warning' : 'success'} message={pendingQualifications ? `${pendingQualifications} qualification${pendingQualifications === 1 ? '' : 's'} still missing or awaiting verification. You can be considered for other eligible roles; your coordinator reviews staffing eligibility.` : qualifications.length ? 'Your saved qualifications are valid for this event’s listed requirements.' : 'No specialist qualifications have been requested for this event’s posts.'} /></> : null}
    <Button title={pending ? 'Saving…' : step === 0 ? 'Let’s get ready' : step === finishStep ? 'Go to my event' : step === briefingStep && !acknowledged ? procedureIndex < data.briefing.procedures.length - 1 ? 'Next procedure' : 'I’ve read and acknowledge these instructions' : qualification && status?.state !== 'valid' ? 'Continue without a verified certificate' : 'Continue'} disabled={pending || uploading || (step === 1 && (!windows.length || editingWindow >= 0))} onPress={() => { void next(); }} />
    <Button title='Finish later · back to my events' secondary disabled={pending || uploading} onPress={() => router.replace('/volunteer')} />
  </OnboardingPage>;
}
