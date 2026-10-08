import { View } from 'react-native';
import { errorMessage } from '@/domain/errors';
import { type PropsWithChildren, useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/hooks/auth';
import { getMembership, managerRole } from '@/services/planning';
import { Button, Loading, Notice, Page, Title } from './ui';

export function EventManagerGate({ id, children }: PropsWithChildren<{ id: string }>) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [decision, setDecision] = useState<
    { eventId: string; allowed: boolean; error: string | null } | null
  >(null);
  const [loading, setLoading] = useState(true);
  const check = useCallback(async (active: () => boolean = () => true) => {
    setLoading(true);
    try {
      const membership = userId ? await getMembership(id, userId) : null;
      if (active()) setDecision({ eventId: id, allowed: managerRole(membership), error: null });
    } catch (error) {
      if (active()) {
        const failed = { eventId: id, allowed: false, error: errorMessage(error, 'Could not check event access.') };
        // A dropped connection during a re-check is not a loss of access; the
        // server still authorises every read and write on the screen.
        setDecision(previous => previous?.eventId === id && previous.allowed ? previous : failed);
      }
    } finally {
      if (active()) setLoading(false);
    }
  }, [id, userId]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void check(() => active);
    return () => {
      active = false;
    };
  }, [check]));
  // Returning to the screen re-checks access in place; replacing an allowed
  // screen with a spinner would discard whatever the manager was typing.
  if (decision?.eventId !== id || loading && !decision.allowed) return <Loading label='Checking event access…' />;
  if (!decision.allowed) {
    return (
      <Page>
        <Title>Event access</Title>
        <Notice
          message={decision.error ??
            'Only this event’s coordinator or safety lead can manage its operating plan.'}
        />
        <Button
          title='Retry'
          onPress={() => {
            void check();
          }}
        />
        <Button title='Back' secondary onPress={() => router.back()} />
      </Page>
    );
  }
  return <View style={{ flex: 1 }}><View style={{ flex: 1 }}>{children}</View></View>;
}
