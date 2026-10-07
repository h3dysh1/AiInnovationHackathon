import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { EventManagerGate } from '@/components/event-manager-gate';
import { Button, Loading, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import type { Membership } from '@/domain/planning';
import { usePlanning } from '@/hooks/planning';
import { useAuth } from '@/hooks/auth';
import { setupRpc } from '@/services/planning';
export default function TeamRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EventManagerGate id={id}>
      <Team id={id} />
    </EventManagerGate>
  );
}
function Team({ id }: { id: string }) {
  const s = usePlanning(id);
  const { session } = useAuth();
  const [members, setMembers] = useState<(Membership & { display_name: string })[] | null>(null);
  async function load() {
    setMembers(
      await setupRpc<(Membership & { display_name: string })[]>('list_event_team', {
        p_event_id: id,
      }),
    );
  }
  if (s.loading) return <Loading />;
  const owner = s.data?.event.created_by === session?.user.id;
  return (
    <Page>
      <Title>Event team</Title>
      {s.error ? <Notice message={s.error} /> : null}
      <Text style={planStyles.help}>
        Event roles apply to this event only. Only its owner can assign coordinator or safety lead
        access.
      </Text>
      <Button
        title='Load / refresh team'
        disabled={s.pending}
        onPress={() => {
          void s.run(load);
        }}
      />
      {members?.map((m) => (
        <PlanCard key={m.id}>
          <Text style={planStyles.heading}>
            {m.user_id === session?.user.id ? `${m.display_name} (you)` : m.display_name}
          </Text>
          <Text style={planStyles.badge}>
            {m.event_role.replaceAll('_', ' ').toUpperCase()} · {m.status}
          </Text>
          {owner && m.user_id !== s.data?.event.created_by
            ? (['volunteer', 'safety_lead', 'coordinator'] as const).map((role) => (
              <Button
                key={role}
                title={`Set role: ${role.replaceAll('_', ' ')}`}
                secondary
                disabled={s.pending || m.event_role === role}
                onPress={() => {
                  void s.run(async () => {
                    await setupRpc('set_event_member_role', {
                      p_membership_id: m.id,
                      p_role: role,
                    });
                    await load();
                  });
                }}
              />
            ))
            : null}
        </PlanCard>
      ))}
      <Button title='Back' secondary disabled={s.pending} onPress={() => router.back()} />
    </Page>
  );
}
