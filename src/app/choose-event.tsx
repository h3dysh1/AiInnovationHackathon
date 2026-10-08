import { router, useLocalSearchParams } from 'expo-router';
import { Button, Loading, NavigationRow, Notice, Page, Section, Title } from '@/components/ui';
import { useNavigationContext } from '@/hooks/navigation';
import { useAuth } from '@/hooks/auth';
import type { JoinedEvent } from '@/domain/planning';
export default function ChooseEvent() {
  const { destination } = useLocalSearchParams<{ destination?: string }>();
  const { events, selected, mode, choose, loading, error, refresh } = useNavigationContext();
  const { role } = useAuth();
  const select = (event: JoinedEvent) => {
    choose(event);
    if (destination === 'crew' || destination === 'alerts' || destination === 'more' || destination === 'shifts') {
      const pathname = { crew: '/events/[id]/roster', alerts: '/events/[id]/live', more: '/events/[id]/more', shifts: '/events/[id]/schedule' }[destination] as '/events/[id]/roster';
      router.replace({ pathname, params: { id: event.id } });
    } else router.replace(destination === 'profile' ? '/profile' : destination === 'events' ? '/my-events' : mode === 'coordinator' && role === 'coordinator' ? '/coordinator' : '/volunteer');
  };
  return <Page><Title subtitle={mode === 'coordinator' ? 'Crew and Alerts will use the event you choose.' : 'Choose the event for your shifts and preparation.'}>Choose event</Title>
    {loading ? <Loading label='Loading your events…' /> : null}
    {error ? <><Notice tone='error' message={error} /><Button title='Try again' onPress={refresh} /></> : null}
    {!loading && !error && !events.length ? <Notice message={mode === 'coordinator' ? 'You have no events to manage yet.' : 'You haven’t joined an event as a volunteer yet.'} /> : null}
    {events.length ? <Section title={mode === 'coordinator' ? 'Events you manage' : 'Your volunteer events'}>{events.map(event => <NavigationRow key={event.id} title={`${event.name}${selected?.id === event.id ? ' · Selected' : ''}\n${event.status.toUpperCase()} · ${event.start_date}`} onPress={() => select(event)} />)}</Section> : null}
    <Button title={mode === 'coordinator' && role === 'coordinator' ? 'Create an event' : 'Join an event'} secondary onPress={() => router.push(mode === 'coordinator' && role === 'coordinator' ? '/events/new' : '/join')} />
    <Button title='Cancel' secondary onPress={() => router.back()} />
  </Page>;
}
