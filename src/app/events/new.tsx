import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EventFields } from '@/components/event-fields';
import { Button, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { emptyEventDraft, validateEventDraft, type EventDraft, type Organisation } from '@/domain/event';
import { useAuth } from '@/hooks/auth';
import { createEvent, createOrganisation, listOrganisations } from '@/services/events';

type Step = 0 | 1 | 2 | 3;

export default function NewEvent() {
  const { session } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [organisationName, setOrganisationName] = useState('');
  const [draft, setDraft] = useState<EventDraft>(emptyEventDraft);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void listOrganisations(session.user.id).then(items => {
      if (active) setOrganisations(items);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load organisations.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);

  async function addOrganisation() {
    if (!session) return;
    setPending(true);
    setError(null);
    try {
      const item = await createOrganisation(session.user.id, organisationName);
      setOrganisations(previous => [...previous, item].sort((a, b) => a.name.localeCompare(b.name)));
      setOrganisationId(item.id);
      setOrganisationName('');
      setStep(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create organisation.');
    } finally {
      setPending(false);
    }
  }

  function next() {
    setError(null);
    if (step === 0) {
      if (!organisationId) return setError('Choose or create an organisation.');
      setStep(1);
    } else if (step === 1) {
      if (!draft.name.trim() || !draft.venueName.trim()) return setError('Enter an event name and venue.');
      setStep(2);
    } else if (step === 2) {
      const validationError = validateEventDraft(draft);
      if (validationError) return setError(validationError);
      setStep(3);
    }
  }

  function back() {
    setError(null);
    if (step === 0) router.back();
    else setStep((step - 1) as Step);
  }

  async function submit() {
    if (!session || !organisationId) return;
    setPending(true);
    setError(null);
    try {
      const event = await createEvent(session.user.id, organisationId, draft);
      router.replace({ pathname: '/events/[id]/setup', params: { id: event.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create event.');
    } finally {
      setPending(false);
    }
  }

  if (loading) return <Loading label="Loading organisations…" />;
  const chosenOrganisation = organisations.find(item => item.id === organisationId);
  return <Page>
    <Title subtitle={`Step ${step + 1} of 4`}>Create event</Title>
    {error ? <Notice message={error} /> : null}
    {step === 0 ? <>
      <Text style={styles.section}>Organisation</Text>
      <Text style={styles.help}>Choose the organisation running this event.</Text>
      {organisations.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: organisationId === item.id }} onPress={() => setOrganisationId(item.id)} style={[styles.choice, organisationId === item.id && styles.selected]}><Text style={styles.choiceText}>{item.name}</Text></Pressable>)}
      <Field label="Or create a new organisation" value={organisationName} onChangeText={setOrganisationName} placeholder="Fieldday" />
      <Button title={pending ? 'Creating…' : 'Create organisation'} disabled={pending || !organisationName.trim()} onPress={() => { void addOrganisation(); }} />
      {organisations.length > 0 ? <Button title="Next: event details" secondary onPress={next} /> : null}
    </> : null}
    {step === 1 ? <>
      <Text style={styles.section}>Event details</Text>
      <Text style={styles.help}>Organisation: {chosenOrganisation?.name}</Text>
      <EventFields value={draft} onChange={setDraft} section="basics" />
      <Button title="Next: dates and hours" onPress={next} />
    </> : null}
    {step === 2 ? <>
      <Text style={styles.section}>Dates and hours</Text>
      <Text style={styles.help}>Enter local dates and daily operating hours for the event.</Text>
      <EventFields value={draft} onChange={setDraft} section="schedule" />
      <Button title="Review event" onPress={next} />
    </> : null}
    {step === 3 ? <>
      <Text style={styles.section}>Review</Text>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{draft.name.trim()}</Text>
        <Text style={styles.summaryText}>{chosenOrganisation?.name} · {draft.venueName.trim()}</Text>
        <Text style={styles.summaryText}>{draft.startDate} to {draft.endDate}</Text>
        <Text style={styles.summaryText}>{draft.operatingStartTime}–{draft.operatingEndTime} · {draft.timezone.trim()}</Text>
        <Text style={styles.summaryText}>Status: Draft</Text>
      </View>
      <Button title={pending ? 'Creating event…' : 'Create draft event'} disabled={pending} onPress={() => { void submit(); }} />
    </> : null}
    <Button title={step === 0 ? 'Cancel' : 'Back'} secondary disabled={pending} onPress={back} />
  </Page>;
}

const styles = StyleSheet.create({
  section: { color: '#123B53', fontSize: 20, fontWeight: '800' },
  help: { color: '#45616E', fontSize: 14, lineHeight: 20 },
  choice: { backgroundColor: '#FFF', borderColor: '#B9CDD3', borderWidth: 1, borderRadius: 12, padding: 16 },
  selected: { borderColor: '#126B79', borderWidth: 2, backgroundColor: '#E4EFF1' },
  choiceText: { color: '#123B53', fontSize: 16, fontWeight: '700' },
  summary: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 8 },
  summaryTitle: { color: '#123B53', fontSize: 20, fontWeight: '800' },
  summaryText: { color: '#45616E', fontSize: 15 },
});
