import { Redirect, router } from 'expo-router';
import { Button, Loading, Notice, Page, Title } from './ui';
import { useNavigationContext } from '@/hooks/navigation';
import { useAuth } from '@/hooks/auth';
export function EventDestination({ destination }: { destination: 'crew' | 'alerts' | 'more' | 'shifts' }) {
  const { selected, loading, error, refresh } = useNavigationContext();
  const { role } = useAuth();
  const title = { crew: 'Crew', alerts: 'Alerts', more: 'More', shifts: 'My shifts' }[destination];
  if (loading) return <Loading label='Loading your events…' />;
  if (error) return <Page><Title>{title}</Title><Notice tone='error' message={error} /><Button title='Try again' onPress={refresh} /><Button title='My profile' secondary onPress={() => router.push('/profile')} /></Page>;
  if (selected) return <Redirect href={{ pathname: { crew: '/events/[id]/roster', alerts: '/events/[id]/live', more: '/events/[id]/more', shifts: '/events/[id]/schedule' }[destination] as '/events/[id]/roster', params: { id: selected.id, mainSection: 'true' } }} />;
  return <Page><Title subtitle={destination === 'shifts' ? 'Join an event to see your published assignments.' : 'Choose an event to open its workspace.'}>{title}</Title>
    <Button title='Choose an event' onPress={() => router.push({ pathname: '/choose-event', params: { destination } })} />
    <Button title={role === 'coordinator' ? 'Create an event' : 'Join an event'} secondary onPress={() => router.push(role === 'coordinator' ? '/events/new' : '/join')} />
    {destination === 'more' ? <Button title='My profile' secondary onPress={() => router.push('/profile')} /> : null}
  </Page>;
}
