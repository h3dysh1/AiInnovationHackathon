import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Button, Loading, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { useStaffing } from '@/hooks/staffing';
import { mySchedule } from '@/services/staffing';
import { getEvent } from '@/services/events';
export default function Schedule() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(
    async () => ({ schedule: await mySchedule(id), event: await getEvent(id) }),
    [id],
  );
  const s = useStaffing(load);
  if (s.loading) return <Loading />;
  return (
    <Page>
      <Title subtitle={s.data ? `${s.data.event.name} · ${s.data.event.timezone}` : undefined}>
        My shifts
      </Title>
      {s.error && <Notice message={s.error} />}
      {s.data && s.data.event.model_status !== 'verified' && (
        <Notice message='The operating plan is being reviewed. These are your last published assignments; check with your coordinator for changes.' />
      )}
      {s.data && !s.data.schedule.published && (
        <Notice message='The coordinator has not published the roster yet.' />
      )}
      {s.data?.schedule.published && !s.data.schedule.shifts.length && (
        <Notice message='The roster is published. You do not have assigned shifts yet. Contact your coordinator if you expected an assignment.' />
      )}
      {s.data?.schedule.shifts.map((x) => (
        <PlanCard key={x.id}>
          <Text style={planStyles.heading}>{x.post}</Text>
          <Text>{x.location}</Text>
          <Text>
            {new Date(x.starts_at).toLocaleString('en-AU', { timeZone: s.data!.event.timezone })} –
            {' '}
            {new Date(x.ends_at).toLocaleString('en-AU', { timeZone: s.data!.event.timezone })}
          </Text>
          {x.instructions && <Text>{x.instructions}</Text>}
          <Text>
            Supervisor: {x.supervisor ?? 'Ask coordinator'} · Escalation:{' '}
            {x.escalation ?? 'Ask coordinator'}
          </Text>
        </PlanCard>
      ))}
      <Button
        title='Refresh'
        secondary
        onPress={() => {
          void s.refresh();
        }}
      />
      <Button title='Back' secondary onPress={() => router.back()} />
    </Page>
  );
}
