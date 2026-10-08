import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button, Loading, Notice, Page, Section, Title } from '@/components/ui';
import type { Event } from '@/domain/event';
import { useAuth } from '@/hooks/auth';
import { listEvents } from '@/services/events';
import { supabase } from '@/services/supabase';

export default function CoordinatorHome() {
  const { profile, session } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!session) return;
    let active = true;
    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listEvents(session.user.id);
        if (active) setEvents(result);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load events.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchEvents();
    return () => { active = false; };
  }, [session]));

  return <Page>
    <Title subtitle={`Welcome, ${profile?.display_name ?? 'coordinator'}.`}>Ground Control</Title>
    <Button title="Create event" onPress={() => router.push('/events/new')} />
    <Section title="Your events">
    {loading ? <Loading label="Loading events…" /> : null}
    {error ? <Notice message={error} /> : null}
    {!loading && !error && events.length === 0 ? <Notice message="No events yet. Create Riverside to get started." /> : null}
    {events.map(event => <Pressable key={event.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/events/[id]', params: { id: event.id } })} style={styles.card}>
      <Text style={styles.eventName}>{event.name}</Text>
      <View style={styles.cardBottom}><Text style={styles.eventMeta}>{event.start_date} – {event.end_date}</Text><Text style={styles.status}>{event.status.toUpperCase()}</Text></View>
    </Pressable>)}
    </Section>
    <Section title="Account">
      <Button title="My volunteer participation" secondary compact onPress={()=>router.push('/volunteer')}/>
      <Button title="My profile" secondary compact onPress={() => router.push('/profile')} />
      <Button title="Sign out" secondary compact onPress={() => { void supabase?.auth.signOut(); }} />
    </Section>
  </Page>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: '#D6E3E6' },
  eventName: { color: '#123B53', fontSize: 19, fontWeight: '800' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  eventMeta: { color: '#45616E', fontSize: 13, flexShrink: 1 },
  status: { color: '#126B79', fontSize: 11, fontWeight: '800' },
});
