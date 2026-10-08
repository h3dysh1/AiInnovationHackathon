import { router, useLocalSearchParams } from 'expo-router';
import { EventManagerGate } from '@/components/event-manager-gate';
import { NavigationRow, Page, Section, Title } from '@/components/ui';
import { useNavigationContext } from '@/hooks/navigation';
import { useAuth } from '@/hooks/auth';

export default function EventTools() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role } = useAuth();
  const { setMode } = useNavigationContext();
  const open = (pathname: '/events/[id]/setup' | '/events/[id]/assistant' | '/events/[id]/review' | '/events/[id]/map' | '/events/[id]/site' | '/events/[id]/operations' | '/events/[id]/documents' | '/events/[id]/publish' | '/events/[id]/team' | '/events/[id]/crowd') => router.push({ pathname, params: { id } });
  return <EventManagerGate id={id}><Page>
    <Title subtitle='Preparation and administration, separate from live alerts.'>Event tools</Title>
    <Section title='Plan the event' description='Describe, review and maintain your operating plan.'>
      <NavigationRow title='Event setup and readiness' onPress={() => open('/events/[id]/setup')} />
      <NavigationRow title='Describe your event with AI' onPress={() => open('/events/[id]/assistant')} />
      <NavigationRow title='Review the operating plan' onPress={() => open('/events/[id]/review')} />
    </Section>
    <Section title='Site and resources' description='Locations, posts, staffing rules and source documents.'>
      <NavigationRow title='Site map' onPress={() => open('/events/[id]/map')} />
      <NavigationRow title='Locations and posts' onPress={() => open('/events/[id]/site')} />
      <NavigationRow title='Staffing requirements' onPress={() => open('/events/[id]/operations')} />
      <NavigationRow title='Documents and procedures' onPress={() => open('/events/[id]/documents')} />
    </Section>
    <Section title='Recruitment and access'>
      <NavigationRow title='Recruitment and join code' onPress={() => open('/events/[id]/publish')} />
      <NavigationRow title='Team and permissions' onPress={() => open('/events/[id]/team')} />
    </Section>
    <Section title='Operational signals'>
      <NavigationRow title='Crowd control' onPress={() => open('/events/[id]/crowd')} />
      <NavigationRow title='Weather and demo social feed' onPress={() => router.push({ pathname: '/events/[id]/signals', params: { id } })} />
    </Section>
    <Section title='Account'><NavigationRow title='My profile' onPress={() => router.push('/profile')} />{role === 'coordinator' ? <NavigationRow title='My volunteer participation' onPress={() => { setMode('volunteer'); router.replace({ pathname: '/volunteer', params: { mainSection: 'true' } }); }} /> : null}</Section>
  </Page></EventManagerGate>;
}
