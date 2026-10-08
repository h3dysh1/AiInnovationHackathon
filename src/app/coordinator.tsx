import { signOut } from '@/services/sign-out';
import { AppText as Text } from '@/components/app-text';
import { colors } from '@/theme';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button, Disclosure, Loading, Notice, Page, Section, Title } from '@/components/ui';
import type { Event } from '@/domain/event';
import { useNavigationContext } from '@/hooks/navigation';
import { useAuth } from '@/hooks/auth';
import { listEvents } from '@/services/events';

export default function CoordinatorHome() {
  const { profile, session } = useAuth();
  const { setMode } = useNavigationContext();
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
        if (active) setEvents([...result].sort((a,b) => Number(b.status === 'live') - Number(a.status === 'live') || Number(a.status === 'completed') - Number(b.status === 'completed') || a.start_date.localeCompare(b.start_date)));
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
    <Button title="Create event" secondary={events.some(e => e.status === 'live')} onPress={() => router.push('/events/new')} />
    {loading || error || !events.length ? <Section title="Your events">
    {loading ? <Loading label="Loading events…" /> : null}
    {error ? <Notice tone="error" message={error} /> : null}
    {!loading && !error && events.length === 0 ? <Notice message="No events yet. Create your first event to get started." /> : null}
    </Section> : null}
    {([{ title: 'Live now', items: events.filter(e => e.status === 'live') }, { title: 'Preparing next', items: events.filter(e => !['live', 'completed'].includes(e.status)) }, { title: 'Past events', items: events.filter(e => e.status === 'completed') }]).filter(group => group.items.length).map(group => {
      const rows = group.items.map(event => <Pressable key={event.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/events/[id]', params: { id: event.id } })} style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.accentSoft }]}>
      <Text style={styles.eventName}>{event.name}</Text>
      <View style={styles.cardBottom}><Text style={styles.eventMeta}>{event.start_date} – {event.end_date}</Text><Text style={styles.status}>{event.status.toUpperCase()}</Text></View>
    </Pressable>);
      return group.title === 'Past events'
        ? <Disclosure key={group.title} title={`Past events (${group.items.length})`}>{rows}</Disclosure>
        : <Section key={group.title} title={group.title} count={group.items.length}>{rows}</Section>;
    })}
    <Disclosure title="Account and profile">
      <Button title="My volunteer participation" secondary compact onPress={()=>{setMode('volunteer');router.replace({ pathname: '/volunteer', params: { mainSection: 'true' } });}}/>
      <Button title="My profile" secondary compact onPress={() => { setMode('coordinator'); router.push('/profile'); }} />
      <Button title="Sign out" secondary compact onPress={() => { void signOut(); }} />
    </Disclosure>
  </Page>;
}

const styles = StyleSheet.create({
  card: { paddingVertical: 20, gap: 10, borderBottomWidth: 0.5, borderColor: colors.border },
  eventName: { color: colors.text, fontSize: 20, lineHeight: 28, letterSpacing: -0.4, fontWeight: '600' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  eventMeta: { color: colors.secondary, fontSize: 13, flexShrink: 1 },
  status: { color: colors.accent, backgroundColor: colors.accentSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, fontWeight: '600' },
});
