import { signOut } from '@/services/sign-out';
import { AppText as Text } from '@/components/app-text';
import { errorMessage } from '@/domain/errors';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';

import { Button, Disclosure, Notice, Page, Section, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import type { JoinedEvent } from '@/domain/planning';
import { useNavigationContext } from '@/hooks/navigation';
import { useAuth } from '@/hooks/auth';
import { joinedEvents } from '@/services/planning';
import type { LiveAssignment } from '@/domain/live';
import { myLiveAssignments } from '@/services/staffing';
export default function VolunteerHome({ eventsOnly = false }: { eventsOnly?: boolean }) {
  const { profile, role, session } = useAuth();
  const { setMode } = useNavigationContext();
  const [assignments, setAssignments] = useState<(LiveAssignment & { eventId: string; eventName: string; timezone: string })[]>([]);
  const [events, setEvents] = useState<JoinedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const refresh = useCallback(async (active: () => boolean = () => true) => {
    try {
      const events = await joinedEvents();
      if (active()) {
        setEvents([...events].sort((a,b) => Number(b.status === 'live') - Number(a.status === 'live') || Number(a.status === 'completed') - Number(b.status === 'completed') || a.start_date.localeCompare(b.start_date)));
        try {
          if (session && !eventsOnly) {
            const shifts = await Promise.all(events.filter(e => e.status !== 'completed' && e.event_role === 'volunteer').map(async e => (await myLiveAssignments(e.id)).map(a => ({ ...a, eventId: e.id, eventName: e.name, timezone: e.timezone }))));
            if (!active()) return;
            setAssignments(shifts.flat().filter(a => Date.parse(a.ends_at) > Date.now() && a.status !== 'completed').sort((a,b) => Number(b.status === 'checked_in') - Number(a.status === 'checked_in') || Date.parse(a.starts_at) - Date.parse(b.starts_at)));
          }
          setOnboardingError(null);
        } catch (cause) {
          setOnboardingError(errorMessage(cause, 'Could not load your assignments.'));
        }
        setError(null);
      }
    } catch (e) {
      if (active()) setError(errorMessage(e, 'Could not load your events.'));
    } finally {
      if (active()) setLoading(false);
    }
  }, [session, eventsOnly]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void refresh(() => active);
    return () => {
      active = false;
    };
  }, [refresh]));

  return (
    <Page>
      <Title subtitle={`Welcome, ${profile?.display_name ?? 'volunteer'}.`}>{eventsOnly ? 'My events' : 'Home'}</Title>
      {error ? <Notice tone="error" message={error} /> : null}
      {onboardingError ? <Notice tone="error" message={onboardingError} /> : null}
      {!eventsOnly && assignments[0] ? <Section title={assignments[0].status === 'checked_in' ? 'Your current assignment' : 'Your next assignment'}>
        <PlanCard>
          <Text style={planStyles.heading}>{assignments[0].post}</Text>
          <Text style={planStyles.text}>{assignments[0].eventName} · {assignments[0].location}</Text>
          <Text style={planStyles.text}>{new Date(assignments[0].starts_at).toLocaleString('en-AU', { timeZone: assignments[0].timezone })} · {assignments[0].status.replaceAll('_', ' ')}</Text>
          {assignments[0].instructions ? <Text style={planStyles.text}>{assignments[0].instructions}</Text> : null}
          <Button title='Open assignment and check-in' onPress={() => router.push({ pathname: '/events/[id]', params: { id: assignments[0].eventId } })} />
          <Button title='Report an incident' secondary onPress={() => router.push({ pathname: '/events/[id]/incident', params: { id: assignments[0].eventId } })} />
        </PlanCard>
      </Section> : null}
      <Button title='Join an event' secondary={events.length > 0} onPress={() => router.push('/join')} />
      {loading
        ? <Text style={planStyles.text}>Loading your events…</Text>
        : !events.length
        ? <Notice message='Enter your coordinator’s join code to join your first event.' />
        : null}
      {([{ title: 'Your active events', items: events.filter(e => e.status !== 'completed') }, { title: 'Past events', items: events.filter(e => e.status === 'completed') }]).filter(group => group.items.length).map(group => {
        const rows = group.items.map((e) => (
        <PlanCard key={e.id}>
          <Text style={planStyles.heading}>{e.name}</Text>
          <Text style={planStyles.text}>
            {e.venue_name} · {e.start_date}
            {'\n'}Your role: {e.event_role.replaceAll('_', ' ')}
          </Text>
          <Button
            title='Open event'
            onPress={() => router.push({ pathname: '/events/[id]', params: { id: e.id } })}
          />
        </PlanCard>
      ));
        return group.title === 'Past events'
          ? <Disclosure key={group.title} title={`Past events (${group.items.length})`}>{rows}</Disclosure>
          : <Section key={group.title} title={group.title} count={group.items.length}>{rows}</Section>;
      })}
      {!eventsOnly ? <Disclosure title='Account and profile'>
        <Button title='Certificate library' secondary compact onPress={() => { setMode('volunteer'); router.push('/certificates'); }} />
        <Button title='My profile' secondary compact onPress={() => { setMode('volunteer'); router.push('/profile'); }} />
        <Button title='Sign out' secondary compact onPress={() => { void signOut(); }} />
      </Disclosure> : null}
      {role === 'coordinator'
        ? <Button title='Coordinator home' secondary compact onPress={() => { setMode('coordinator'); router.replace({ pathname: '/coordinator', params: { mainSection: 'true' } }); }} />
        : null}
      {events.length ? <Button title='Refresh events' secondary compact onPress={() => { void refresh(); }} /> : null}
    </Page>
  );
}
