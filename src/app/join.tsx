import { errorMessage } from '@/domain/errors';
import { useState } from 'react';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { Button, Field, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import type { JoinPreview } from '@/domain/planning';
import { joinEvent, previewJoin } from '@/services/planning';
export default function JoinScreen() {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function show() {
    setPending(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await previewJoin(code));
    } catch (e) {
      setError(errorMessage(e, 'Could not preview the event.'));
    } finally {
      setPending(false);
    }
  }
  async function join() {
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      const id = await joinEvent(code, preview.id);
      router.replace({ pathname: '/events/[id]', params: { id } });
    } catch (e) {
      setError(
        errorMessage(
          e,
          'Could not confirm joining. Retry with the same code; your membership will not be duplicated.',
        ),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Page>
      <Title subtitle='Enter the code your coordinator shared.'>Join an event</Title>
      {error ? <Notice message={error} /> : null}
      <Field
        label='Event join code'
        value={code}
        autoCapitalize='words'
        onChangeText={(v) => {
          setCode(v.toUpperCase());
          setPreview(null);
        }}
        placeholder='RIVERSIDE26'
        editable={!pending}
      />
      <Button
        title={pending ? 'Checking…' : 'Preview event'}
        disabled={pending || !code.trim()}
        onPress={() => {
          void show();
        }}
      />
      {preview
        ? (
          <PlanCard>
            <Text style={planStyles.heading}>{preview.name}</Text>
            <Text style={planStyles.text}>
              {preview.venue_name}
              {'\n'}
              {preview.start_date}–{preview.end_date}
              {'\n'}
              {preview.timezone}
            </Text>
            {preview.description
              ? <Text style={planStyles.text}>{preview.description}</Text>
              : null}
            <Button
              title='Confirm & join event'
              disabled={pending}
              onPress={() => {
                void join();
              }}
            />
          </PlanCard>
        )
        : null}
      <Button title='Back' secondary disabled={pending} onPress={() => router.back()} />
    </Page>
  );
}
