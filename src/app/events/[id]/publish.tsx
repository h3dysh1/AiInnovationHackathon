import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { EventManagerGate } from '@/components/event-manager-gate';
import { Button, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { usePlanning } from '@/hooks/planning';
import { publishRecruitment } from '@/services/planning';
export default function PublishRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EventManagerGate id={id}>
      <Publish id={id} />
    </EventManagerGate>
  );
}
function Publish({ id }: { id: string }) {
  const s = usePlanning(id);
  const [editedCode, setCode] = useState<string | null>(null);
  const code = editedCode ?? s.data?.event.join_code ?? '';
  if (s.loading) return <Loading />;
  const ready = s.data?.readiness.modelStatus === 'verified' &&
    s.data.readiness.issues.length === 0;
  return (
    <Page>
      <Title subtitle={s.data?.event.name}>Open volunteer recruitment</Title>
      {s.error ? <Notice message={s.error} /> : null}
      <Notice message='Publishing allows signed-in volunteers to preview the event and join. It does not publish a roster or start live operations.' />
      {s.data?.event.status === 'recruiting'
        ? (
          <PlanCard>
            <Text style={planStyles.heading}>Recruitment published</Text>
            <Text selectable style={planStyles.heading}>{s.data.event.join_code}</Text>
            <Text style={planStyles.help}>
              {ready
                ? 'Share this code with your volunteers.'
                : 'New joins are paused until the changed operating plan is verified again.'}
            </Text>
          </PlanCard>
        )
        : null}
      {!ready
        ? (
          <Notice message='Verify the latest operating plan before publishing or changing its join code.' />
        )
        : null}
      <Field
        label='Join code (6–20 letters or numbers)'
        value={code}
        autoCapitalize='words'
        onChangeText={(v) => setCode(v.toUpperCase().replace(/\s/g, ''))}
        placeholder='RIVERSIDE26'
      />
      <Button
        title={s.pending ? 'Publishing…' : 'Publish recruitment with this code'}
        disabled={s.pending || !ready || !/^[A-Z0-9]{6,20}$/.test(code)}
        onPress={() => {
          void s.run(() => publishRecruitment(id, code, s.data!.readiness.revision));
        }}
      />
      <Button title='Back to review' secondary disabled={s.pending} onPress={() => router.back()} />
    </Page>
  );
}
