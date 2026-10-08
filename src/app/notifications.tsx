import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { Button, Disclosure, Notice, Page, Section, Title } from '@/components/ui';
import { AppText as Text } from '@/components/app-text';
import { useAuth } from '@/hooks/auth';
import { usePolling } from '@/hooks/polling';
import { useStaffing } from '@/hooks/staffing';
import { useOperations } from '@/hooks/operations';
import { myNotifications, notificationDestination, readNotification } from '@/services/notifications';
import { enablePush, revokePush } from '@/services/push';
import { readOutbox, retryQueuedIncident, flushIncidentOutbox } from '@/services/incident-outbox';
import { planStyles } from '@/components/plan-ui';

export default function NotificationsInbox() {
  const { session } = useAuth();
  const { refresh: refreshCount } = useOperations();
  const userId = session!.user.id;
  const s = useStaffing(useCallback(async () => ({ notifications: await myNotifications(), reports: await readOutbox(userId) }), [userId]));
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const { refresh } = s;
  usePolling(refresh, 15000);
  return <Page>
    <Title subtitle='Reports, instructions and updates across your events.'>Notifications</Title>
    {s.error ? <Notice tone='error' message={s.error} /> : null}
    {s.data?.reports.filter(q => q.status !== 'received').length ? <Section title='Reports waiting to send'>
      <Notice tone='warning' message='These reports are saved on this device. Ground Control has not confirmed receipt. For urgent help, use your event radio or local safety procedure.' />
      {s.data.reports.filter(q => q.status !== 'received').map(q => <Section key={q.requestId} title={q.recordingUri ? 'Voice report' : 'Written report'}>
        <Text style={planStyles.text}>{q.report || 'Audio recording saved'}</Text>
        <Text style={planStyles.help}>{new Date(q.createdAt).toLocaleString()} · {q.status === 'blocked' ? 'Needs attention' : 'Will retry when connected'}</Text>
        {q.error ? <Notice tone={q.status === 'blocked' ? 'error' : 'warning'} message={q.error} /> : null}
        <Button title='Retry this report' secondary disabled={s.pending} onPress={() => { void s.run(async () => { await retryQueuedIncident(userId, q.requestId); await flushIncidentOutbox(); refreshCount(); }); }} />
        <Button title='Open report form' secondary compact onPress={() => router.push({ pathname: '/events/[id]/incident', params: { id: q.eventId } })} />
      </Section>)}
    </Section> : null}
    <Section title='Event updates' count={s.data?.notifications.filter(n => !n.read_at).length}>
      {!s.data?.notifications.length ? <Notice message={s.loading ? 'Loading event updates…' : 'No notifications yet. New reports and approved instructions will appear here.'} /> : null}
      {s.data?.notifications.map(n => <Section key={n.id} title={`${n.urgent ? 'Urgent · ' : ''}${n.title}`} description={`${n.event_name} · ${new Date(n.created_at).toLocaleString()}${n.read_at ? ' · Read' : ' · Unread'}`}>
        <Text style={planStyles.text}>{n.body}</Text>
        <Button title='Open event' secondary={Boolean(n.read_at)} onPress={() => {
          const destination = notificationDestination(n);
          if (destination) router.push(destination);
          void readNotification(n.id).then(refreshCount).catch(() => { /* A receipt failure must not block investigation. It remains unread for retry. */ });
        }} />
      </Section>)}
      <Button title='Mark all as read' secondary disabled={s.pending} onPress={() => { void s.run(async () => { await readNotification(null); refreshCount(); }); }} />
      <Button title='Refresh notifications' secondary disabled={s.pending} onPress={() => { void refresh(); refreshCount(); }} />
    </Section>
    <Disclosure title='Phone notifications'>
      <Notice message='Enable phone alerts for this account. Push delivery needs a configured installed build. Saved report retries run while the app is open; supported mobile builds also request background retries, whose timing is controlled by your phone.' />
      {permissionMessage ? <Notice message={permissionMessage} /> : null}
      <Button title='Enable phone notifications' secondary disabled={s.pending} onPress={() => { void s.run(async () => setPermissionMessage(await enablePush())); }} />
      <Button title='Disable phone notifications' secondary disabled={s.pending} onPress={() => { void s.run(async () => { await revokePush(); setPermissionMessage('Phone notifications disabled on this device.'); }); }} />
    </Disclosure>
  </Page>;
}
