import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { setupRpc } from './planning';
import { loadDraft, saveDraft } from './draft-storage';
import { supabase } from './supabase';

const deviceKey = 'ground-control:push-installation';
const ownerKey = 'ground-control:push-owner';
const supported = () => Constants.executionEnvironment !== 'storeClient';
const projectId = () => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

// No notification APIs requiring a custom runtime are invoked in Expo Go.
if (supported()) Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});
export async function enablePush(): Promise<string> {
  if (!supported()) return 'Your in-app inbox works in Expo Go. Phone push notifications require a development or installed build.';
  if (!projectId()) return 'Your in-app inbox works. Phone push is unavailable because this build has no EAS project configured.';
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('operations', {
    name: 'Event operations', importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return 'Phone notification permission is off. You can still use your in-app inbox.';
  await registerDevice();
  return 'Phone notifications enabled for this account on this device.';
}
async function registerDevice() {
  const { data } = await supabase!.auth.getSession();
  if (!data.session) return;
  const id = await loadDraft(deviceKey) ?? randomUUID();
  const token = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  const actualId = await setupRpc<string>('register_push_device', { p_id: id, p_token: token.data });
  await saveDraft(deviceKey, actualId);
  await saveDraft(ownerKey, data.session.user.id);
}
export async function restorePush() {
  if (!supported() || !projectId() || !supabase) return;
  const { data } = await supabase.auth.getSession();
  const owner = await loadDraft(ownerKey);
  // Enabling is explicit for each account; never enroll the next account silently.
  if (owner !== data.session?.user.id) return;
  if ((await Notifications.getPermissionsAsync()).granted) await registerDevice();
  else await revokePush();
}
export async function revokePush() {
  const id = await loadDraft(deviceKey);
  if (id && supabase) await setupRpc<void>('disable_push_device', { p_id: id });
  await saveDraft(ownerKey, null);
}
export function subscribePush(listener: (notificationId: string) => void) {
  if (!supported()) return () => {};
  const handle = (response: Notifications.NotificationResponse) => {
    const id: unknown = response.notification.request.content.data?.notificationId;
    if (typeof id === 'string' && /^[\da-f-]{36}$/i.test(id)) listener(id);
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  const initial = Notifications.getLastNotificationResponse();
  if (initial) { handle(initial); void Notifications.clearLastNotificationResponseAsync(); }
  return () => subscription.remove();
}
