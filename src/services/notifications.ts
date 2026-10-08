import { setupRpc } from './planning';

export type OperationalNotification = {
  id: string; event_id: string; event_name: string; audience: 'manager' | 'volunteer';
  kind: string; source_id: string; title: string; body: string;
  urgent: boolean; read_at: string | null; created_at: string;
};
export const myNotifications = (before: string | null = null) => setupRpc<OperationalNotification[]>('my_notifications', { p_before: before });
export const notificationCount = () => setupRpc<number>('my_notification_count');
export const readNotification = (id: string | null) => setupRpc<void>('read_notification', { p_id: id });
export const disablePushDevice = (id: string) => setupRpc<void>('disable_push_device', { p_id: id });
export type PushTest = { notificationId: string; deliveryCount: number };
export type PushTestDelivery = { status: 'queued' | 'sending' | 'ticketed' | 'forwarded' | 'failed' | 'cancelled'; error: string | null; updatedAt: string };
export const requestPushTest = (eventId: string) => setupRpc<PushTest>('request_push_test', { p_event_id: eventId });
export const pushTestStatus = (notificationId: string) => setupRpc<PushTestDelivery[]>('push_test_status', { p_notification_id: notificationId });

export function notificationDestination(notification: Pick<OperationalNotification, 'kind' | 'audience' | 'event_id'>) {
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(notification.event_id)) return null;
  return {
    pathname: notification.kind === 'certificate' && notification.audience === 'manager' ? '/events/[id]/qualifications' as const
      : notification.kind === 'roster' ? '/events/[id]/schedule' as const
      : notification.audience === 'manager' ? '/events/[id]/live' as const : '/events/[id]' as const,
    params: { id: notification.event_id },
  };
}
