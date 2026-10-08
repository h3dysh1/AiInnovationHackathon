import { router, usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from './app-text';
import { colors } from '@/theme';
import { useAuth } from '@/hooks/auth';
import { useNavigationContext } from '@/hooks/navigation';
import { useOperations } from '@/hooks/operations';

export function MainNavigation() {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const { session, role, needsProfileSetup } = useAuth();
  const { mode, selected, setMode } = useNavigationContext();
  const { unread, queued, error } = useOperations();
  const focused = ['/', '/sign-in', '/sign-up', '/profile-onboarding', '/join', '/events/new', '/choose-event'].includes(path) || /\/(onboarding|incident|assistant|review|availability)$/.test(path);
  if (!session || !role || needsProfileSetup || focused) return null;
  const manager = mode === 'coordinator';
  const active = manager ? /\/(roster|qualifications)$/.test(path) || path === '/crew' ? 'Crew' : path.endsWith('/live') || path === '/alerts' ? 'Alerts' : path === '/coordinator' || /^\/events\/[^/]+$/.test(path) ? 'Home' : 'More' : path === '/profile' || path === '/certificates' ? 'Profile' : path.endsWith('/schedule') || path === '/my-shifts' ? 'My shifts' : path === '/my-events' || path.startsWith('/events/') ? 'Events' : 'Home';
  const destinations = manager ? [
    { label: 'Home', route: role === 'coordinator' ? '/coordinator' : '/volunteer', icon: { ios: 'house', android: 'home', web: 'home' } },
    { label: 'Crew', route: '/crew', icon: { ios: 'person.2', android: 'group', web: 'group' } },
    { label: 'Alerts', route: '/alerts', icon: { ios: 'exclamationmark.bubble', android: 'report', web: 'report' } },
    { label: 'More', route: '/more', icon: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' } },
  ] as const : [
    { label: 'Home', route: '/volunteer', icon: { ios: 'house', android: 'home', web: 'home' } },
    { label: 'Events', route: '/my-events', icon: { ios: 'calendar', android: 'event', web: 'event' } },
    { label: 'My shifts', route: '/my-shifts', icon: { ios: 'clock', android: 'schedule', web: 'schedule' } },
    { label: 'Profile', route: '/profile', icon: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' } },
  ] as const;
  const destination = manager ? active === 'Crew' ? 'crew' : active === 'Alerts' ? 'alerts' : active === 'More' ? 'more' : 'home' : active === 'My shifts' ? 'shifts' : active === 'Events' ? 'events' : active === 'Profile' ? 'profile' : 'home';
  return <View style={{ backgroundColor: colors.surface, paddingBottom: insets.bottom, borderTopWidth: 1, borderColor: colors.border }}>
    <View style={{ width: '100%', maxWidth: 800, alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderColor: colors.border }}>
      <Pressable accessibilityRole='button' accessibilityLabel={`Choose event. ${selected?.name ?? 'No event selected'}`} onPress={() => { setMode(mode); router.push({ pathname: '/choose-event', params: { destination } }); }} style={({ pressed }) => ({ flex: 1, paddingLeft: 24, paddingRight: 12, paddingVertical: 10, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ flex: 1, fontSize: 13, lineHeight: 20, color: colors.secondary }}>Selected event · <Text style={{ color: colors.text, fontWeight: '500' }}>{selected?.name ?? 'Choose an event'}</Text></Text>
        <SymbolView accessible={false} name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={18} tintColor={colors.secondary} />
      </Pressable>
      <Pressable accessibilityRole='button' accessibilityLabel={`Notifications. ${unread} unread updates. ${queued} reports waiting to send.${error ? ' Updates unavailable.' : ''}`} onPress={() => router.push('/notifications')} style={({ pressed }) => ({ minWidth: 64, minHeight: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <SymbolView accessible={false} name={{ ios: 'bell', android: 'notifications', web: 'notifications' }} size={20} tintColor={colors.text} />
        {unread || queued || error ? <Text style={{ fontSize: 11, lineHeight: 15, color: colors.text }}>{queued ? `${queued} unsent` : unread ? `${unread} new` : 'Offline'}</Text> : null}
      </Pressable>
      </View>
      <View style={{ flexDirection: 'row', paddingTop: 4 }}>{destinations.map(item => <Pressable key={item.label} accessibilityRole='button' accessibilityLabel={`${item.label}, main navigation`} accessibilityState={{ selected: active === item.label }} onPress={() => { setMode(mode); router.navigate(item.route); }} style={({ pressed }) => ({ flex: 1, minHeight: 64, padding: 8, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
        <SymbolView accessible={false} name={item.icon} size={23} tintColor={active === item.label ? colors.text : colors.secondary} />
        <Text style={{ fontSize: 12, lineHeight: 18, fontWeight: active === item.label ? '600' : '500', color: active === item.label ? colors.text : colors.secondary }}>{item.label}</Text>
        <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: active === item.label ? colors.text : 'transparent' }} />
      </Pressable>)}</View>
    </View>
  </View>;
}
