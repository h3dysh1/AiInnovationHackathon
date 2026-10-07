import { errorMessage } from '@/domain/errors';
import { type PropsWithChildren, useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/hooks/auth';
import { getMembership, managerRole } from '@/services/planning';
import { Button, Loading, Notice, Page, Title } from './ui';

export function EventManagerGate({ id, children }: PropsWithChildren<{ id: string }>) {
  const { session } = useAuth();
  const [decision, setDecision] = useState<
    { eventId: string; allowed: boolean; error: string | null } | null
  >(null);
  const [loading, setLoading] = useState(true);
  const check = useCallback(async (active: () => boolean = () => true) => {
    setLoading(true);
    try {
      const membership = session ? await getMembership(id, session.user.id) : null;
      if (active()) setDecision({ eventId: id, allowed: managerRole(membership), error: null });
    } catch (error) {
      if (active()) {
        setDecision({
          eventId: id,
          allowed: false,
          error: errorMessage(error, 'Could not check event access.'),
        });
      }
    } finally {
      if (active()) setLoading(false);
    }
  }, [id, session]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void check(() => active);
    return () => {
      active = false;
    };
  }, [check]));
  if (loading || decision?.eventId !== id) return <Loading label='Checking event access…' />;
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
  return children;
}
