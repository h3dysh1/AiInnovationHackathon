import { AppText as Text } from '@/components/app-text';
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { EventManagerGate } from '@/components/event-manager-gate';
import { Button, Disclosure, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import type { Membership } from '@/domain/planning';
import { usePlanning } from '@/hooks/planning';
import { useAuth } from '@/hooks/auth';
import { confirmAction } from '@/services/confirm-action';
import { errorMessage } from '@/domain/errors';
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
  const [filter, setFilter] = useState('');
  const [teamError, setTeamError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const result = await setupRpc<(Membership & { display_name: string })[]>('list_event_team', { p_event_id: id });
    setMembers(result); setTeamError(null);
  }, [id]);
  useEffect(() => { let active = true;
    setupRpc<(Membership & { display_name: string })[]>('list_event_team', { p_event_id: id }).then(result => { if (active) setMembers(result); }).catch(error => { if (active) setTeamError(errorMessage(error, 'Could not load the team. Refresh to retry.')); });
    return () => { active = false; };
  }, [id]);
  if (s.loading) return <Loading />;
  const owner = s.data?.event.created_by === session?.user.id;
  return (
    <Page>
      <Title>Event team</Title>
      {s.error ? <Notice tone="error" message={s.error} /> : null}
      {teamError ? <Notice tone="error" message={teamError} /> : null}
      {members === null && !teamError ? <Loading label="Loading team…" /> : null}
      {members?.length === 0 ? <Notice message="No team members yet." /> : null}
      <Field label="Find a team member" value={filter} onChangeText={setFilter} />
      <Text style={planStyles.help}>
        Event roles apply to this event only. Only its owner can assign coordinator or safety lead
        access.
      </Text>
      <Button
        title='Refresh team'
        secondary
        compact
        disabled={s.pending}
        onPress={() => {
          void s.run(load);
        }}
      />
      {members?.filter(m => m.display_name.toLowerCase().includes(filter.toLowerCase())).map((m) => (
        <PlanCard key={m.id}>
          <Text style={planStyles.heading}>
            {m.user_id === session?.user.id ? `${m.display_name} (you)` : m.display_name}
          </Text>
          <Text style={planStyles.badge}>
            {m.event_role.replaceAll('_', ' ').toUpperCase()} · {m.status}
          </Text>
          {owner && m.user_id !== s.data?.event.created_by
            ? <Disclosure title='Change event permissions'>{(['volunteer', 'safety_lead', 'coordinator'] as const).map((role) => (
              <Button
                key={role}
                title={`Set role: ${role.replaceAll('_', ' ')}`}
                secondary
                disabled={s.pending || m.event_role === role}
                onPress={() => {
                  confirmAction('Change event permissions?', `${m.display_name} will become ${role.replaceAll('_', ' ')} for this event. ${role === 'volunteer' ? 'They will no longer have management access.' : 'They will have access to manage staffing and safety operations.'}`, () => { void s.run(async () => {
                    await setupRpc('set_event_member_role', {
                      p_membership_id: m.id,
                      p_role: role,
                    });
                    await load();
                  }); });
                }}
              />
            ))}</Disclosure>
            : null}
        </PlanCard>
      ))}
      <Button title='Back' secondary disabled={s.pending} onPress={() => router.back()} />
    </Page>
  );
}
