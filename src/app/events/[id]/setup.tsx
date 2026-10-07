import { errorMessage } from '@/domain/errors';
import { EventManagerGate } from '@/components/event-manager-gate';
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Loading, Notice, Page, Section, Title } from '@/components/ui';
import { SiteMapUpload } from '@/components/site-map-upload';
import type { Event } from '@/domain/event';
import type { SetupSession } from '@/domain/setup';
import { useAuth } from '@/hooks/auth';
import { useSiteMap } from '@/hooks/site-map';
import { getEvent } from '@/services/events';
import { getSetupSession, markSetupNotesReviewed, saveSetupDescription } from '@/services/setup';
import { getSetupDraft, keepSetupDraft, removeSetupDraft } from '@/services/setup-drafts';

function SetupWorkspace() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const siteMap = useSiteMap(id);
  const [event, setEvent] = useState<Event | null>(null);
  const [setup, setSetup] = useState<SetupSession | null>(null);
  const [description, setDescription] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const userId = session?.user.id;

  useEffect(() => {
    if (!id || !userId) return;
    let active = true;
    void Promise.all([getEvent(id), getSetupSession(id)]).then(([nextEvent, nextSetup]) => {
      if (!active) return;
      setEvent(nextEvent);
      setSetup(nextSetup);
      setDescription(nextSetup?.description ?? '');
      try {
        const draft = getSetupDraft(id, userId);
        if (draft !== null && draft.trim() !== (nextSetup?.description ?? '')) {
          setDescription(draft);
          setMessage('Restored your unsaved description from this device. Save it to add it to the event.');
        }
      } catch {
        setDraftError('Could not restore a local draft.');
      }
    }).catch(cause => {
      if (active) setError(errorMessage(cause, 'Could not load setup.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, userId, loadAttempt]);

  function changeDescription(value: string) {
    setDescription(value);
    setMessage(null);
    if (!id || !userId) return;
    try {
      keepSetupDraft(id, userId, value);
      setDraftError(null);
    } catch {
      setDraftError('Could not keep a draft on this device. Keep this screen open until you save successfully.');
    }
  }

  function discardChanges() {
    if (!id || !userId) return;
    setDescription(setup?.description ?? '');
    setError(null);
    setMessage(null);
    try { removeSetupDraft(id, userId); setDraftError(null); }
    catch { setDraftError('Could not remove the old local draft.'); }
  }

  async function save() {
    if (!id || !session) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveSetupDescription(id, session.user.id, description);
      setSetup(saved);
      setDescription(saved.description);
      try { removeSetupDraft(id, session.user.id); setDraftError(null); }
      catch { setDraftError('Saved to the event, but could not remove the local draft.'); }
      setMessage('Description saved. You can return and add more detail at any time.');
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save your description. Your text is still here; try saving again.'));
    } finally {
      setPending(false);
    }
  }

  async function reviewNotes() {
    if (!id || !session || !setup) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      setSetup(await markSetupNotesReviewed(id, session.user.id, setup.updated_at));
      setMessage('Setup notes reviewed. Your operating plan still needs to be generated and checked.');
    } catch (cause) {
      setError(errorMessage(cause, 'Could not record the review. Try again.'));
    } finally {
      setPending(false);
    }
  }

  if (loading) return <Loading label="Opening setup…" />;
  if (!event) return <Page>
    <Title>Setup unavailable</Title>
    <Notice message={error ?? 'Could not load this event.'} />
    <Button title="Try again" onPress={() => { setLoading(true); setError(null); setLoadAttempt(value => value + 1); }} />
    <Button title="Back to event" secondary onPress={() => router.dismissTo({ pathname: '/events/[id]', params: { id } })} />
  </Page>;

  const dirty = description.trim() !== (setup?.description ?? '');
  const completedSteps = setup ? (setup.notes_reviewed_at ? 2 : 1) : 0;

  return <Page>
    <Title subtitle={reviewing ? 'Review setup notes' : 'Build your operating plan'}>Set up {event.name}</Title>
    {error ? <Notice message={error} /> : null}
    {message ? <Notice message={message} /> : null}
    {draftError ? <Notice message={draftError} /> : null}
    <View style={styles.card}>
      <Text style={styles.section}>Setup context · {completedSteps} of 2 steps</Text>
      <Text style={styles.info}>{setup ? '✓' : '○'} Describe how the event works{setup ? ' — saved' : ''}</Text>
      <Text style={styles.info}>{setup?.notes_reviewed_at ? '✓' : '○'} Review your setup notes{setup?.notes_reviewed_at ? ' — reviewed' : ''}</Text>
      <Text style={styles.help}>These steps capture your knowledge. Open the assistant to generate a candidate, then review and verify its operational requirements.</Text>
    </View>

    {reviewing && setup ? <>
      <Text style={styles.section}>What you told Ground Control</Text>
      <View style={styles.card}><Text selectable style={styles.description}>{setup.description}</Text></View>
      <Text style={styles.help}>Check that this describes the event accurately. Ground Control can turn these saved notes into a candidate plan for you to review.</Text>
      {!setup.notes_reviewed_at ? <Button title={pending ? 'Saving review…' : 'Mark notes reviewed'} disabled={pending} onPress={() => { void reviewNotes(); }} /> : null}
      <Button title="Edit description" secondary disabled={pending} onPress={() => { setReviewing(false); setMessage(null); setError(null); }} />
    </> : <>
      <Text style={styles.section}>Tell us how the event works</Text>
      <Text style={styles.help}>Describe the areas, what volunteers do, how many you need, when they work, and any qualifications or responsibilities. Start with what you know.</Text>
      <TextInput
        accessibilityLabel="Event setup description"
        style={styles.input}
        value={description}
        onChangeText={changeDescription}
        multiline
        textAlignVertical="top"
        editable={!pending}
        placeholder="Riverside has Lawn, Riverside and Entry areas. Water Station B needs four volunteers while gates are open, including one with First Aid…"
        placeholderTextColor="#789"
      />
      <Text style={styles.help}>{description.length.toLocaleString()} / 20,000 characters · {dirty ? (draftError ? 'Unsaved changes' : 'Draft kept on this device') : setup ? 'Saved to this event' : 'No description saved yet'}</Text>
      <Button title={pending ? 'Saving…' : 'Save description'} disabled={pending || !dirty} onPress={() => { void save(); }} />
      {error && dirty ? <Text style={styles.help}>Your text is still here. Keep this screen open and retry saving when the connection is available.</Text> : null}
      <Button title="Review setup notes" secondary disabled={pending || !setup || dirty} onPress={() => { setReviewing(true); setMessage(null); setError(null); }} />
      {dirty ? <Text style={styles.help}>Save your changes before reviewing or leaving this screen.</Text> : null}
      {dirty ? <Button title="Discard unsaved changes" secondary disabled={pending} onPress={discardChanges} /> : null}
    </>}

    <Section title="Continue setup">
      <Button title="Generate plan / answer questions" disabled={pending || dirty} onPress={() => router.push({ pathname: '/events/[id]/assistant', params: { id } })} />
      <Button title="Review items needing attention" secondary disabled={pending || dirty} onPress={() => router.push({ pathname: '/events/[id]/review', params: { id } })} />
    </Section>
    <Section title="Add supporting material">
      <Text style={styles.help}>Ground Control can use your existing plans and site map. These are optional; add them when they are ready.</Text>
      <Button title="Upload documents" secondary compact disabled={pending || dirty} onPress={() => router.push({ pathname: '/events/[id]/documents', params: { id } })} />
      <SiteMapUpload state={siteMap} disabled={pending} />
    </Section>
    <Section title="Correct details manually">
      <Text style={styles.help}>Use these tools only when the generated plan needs a direct correction.</Text>
      <Button title="Edit areas, posts & qualifications" secondary compact disabled={pending || dirty || siteMap.uploading} onPress={() => router.push({ pathname: '/events/[id]/site', params: { id: event.id } })} />
      <Button title="Edit map positions" secondary compact disabled={pending || dirty || siteMap.uploading} onPress={() => router.push({ pathname: '/events/[id]/map', params: { id: event.id } })} />
      <Button title="Edit hours & procedures" secondary compact disabled={pending || dirty} onPress={() => router.push({ pathname: '/events/[id]/operations', params: { id } })} />
    </Section>
    <Button title="Back to event" secondary disabled={pending || dirty || siteMap.uploading} onPress={() => router.dismissTo({ pathname: '/events/[id]', params: { id: event.id } })} />
  </Page>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 18, gap: 12, borderWidth: 1, borderColor: '#D6E3E6' },
  section: { color: '#123B53', fontSize: 19, fontWeight: '800' },
  info: { color: '#234759', fontSize: 15, lineHeight: 22 },
  help: { color: '#45616E', fontSize: 14, lineHeight: 21 },
  description: { color: '#234759', fontSize: 16, lineHeight: 25 },
  input: { minHeight: 220, borderWidth: 1, borderColor: '#B9CDD3', borderRadius: 12, backgroundColor: '#FFF', padding: 15, fontSize: 16, lineHeight: 24, color: '#123B53' },
});

export default function GuardedRoute() { const { id } = useLocalSearchParams<{ id: string }>(); return <EventManagerGate id={id}><SetupWorkspace /></EventManagerGate>; }
