import { errorMessage } from '@/domain/errors';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Text } from 'react-native';
import { Button, Notice, Page, Section, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import type { JoinedEvent } from '@/domain/planning';
import { useAuth } from '@/hooks/auth';
import { joinedEvents } from '@/services/planning';
import { certificates } from '@/services/staffing';
import { supabase } from '@/services/supabase';
export default function VolunteerHome() {
  const { profile, role, session } = useAuth();
  const [events, setEvents] = useState<JoinedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [certificateCount, setCertificateCount] = useState(0);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const refresh = useCallback(async (active: () => boolean = () => true) => {
    try {
      const events = await joinedEvents();
      if (active()) {
        setEvents(events);
        try {
          if (session) setCertificateCount((await certificates(session.user.id)).length);
          setOnboardingError(null);
        } catch (cause) {
          setOnboardingError(errorMessage(cause, 'Could not load your certificate checklist.'));
        }
        setError(null);
      }
    } catch (e) {
      if (active()) setError(errorMessage(e, 'Could not load your events.'));
    } finally {
      if (active()) setLoading(false);
    }
  }, [session]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void refresh(() => active);
    return () => {
      active = false;
    };
  }, [refresh]));

  return (
    <Page>
      <Title subtitle={`Welcome, ${profile?.display_name ?? 'volunteer'}.`}>My events</Title>
      {error ? <Notice message={error} /> : null}
      {onboardingError ? <Notice message={onboardingError} /> : null}
      <PlanCard>
        <Text style={planStyles.heading}>Get ready before joining shifts</Text>
        <Text style={planStyles.text}>
          Complete your profile and upload every certificate you already hold. Ground Control will
          use them when coordinators build event rosters.
        </Text>
        <Text style={planStyles.badge}>
          Profile · {profile?.display_name?.trim() ? 'Complete' : 'Needs your name'}
          {'\n'}Certificates · {certificateCount ? `${certificateCount} uploaded` : 'None uploaded yet'}
        </Text>
        <Button title='Complete my profile' onPress={() => router.push('/profile')} />
        <Button title='Add my certificates' secondary onPress={() => router.push('/certificates')} />
      </PlanCard>
      <Button title='Join an event' onPress={() => router.push('/join')} />
      {loading
        ? <Text style={planStyles.text}>Loading your events…</Text>
        : !events.length
        ? <Notice message='Enter your coordinator’s join code to join your first event.' />
        : null}
      {events.length ? <Section title='Your events'>{events.map((e) => (
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
      ))}</Section> : null}
      <Section title='Account'>
        <Button title='My profile' secondary compact onPress={() => router.push('/profile')} />
        <Button title='Sign out' secondary compact onPress={() => { void supabase?.auth.signOut(); }} />
      </Section>
      {role === 'coordinator'
        ? <Button title='Coordinator home' secondary compact onPress={() => router.push('/coordinator')} />
        : null}
      {events.length ? <Button title='Refresh events' secondary compact onPress={() => { void refresh(); }} /> : null}
    </Page>
  );
}
