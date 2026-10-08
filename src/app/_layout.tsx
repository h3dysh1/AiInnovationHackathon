import { View } from 'react-native';
import { MainNavigation } from '@/components/main-navigation';
import { NavigationProvider } from '@/hooks/navigation';
import { colors } from '@/theme';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useReducedMotion } from 'react-native-reanimated';
import { Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/hooks/auth';
import { OperationsProvider } from '@/hooks/operations';

function Routes() {
  const reducedMotion = useReducedMotion();
  const { session, role, loading, needsProfileSetup } = useAuth();
  if (loading) return <Loading label='Opening Ground Control…' />;
  return (
    <View style={{ flex: 1 }}>
    <Stack screenOptions={{ headerShown: true, headerBackButtonDisplayMode: 'minimal', headerTintColor: colors.text, headerStyle: { backgroundColor: colors.canvas }, headerShadowVisible: false, headerTitleStyle: { fontFamily: 'DMSansMedium', fontSize: 16 }, animation: reducedMotion ? 'fade' : 'default', contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name='index' options={{ headerShown: false }} />
      <Stack.Protected guard={!session}>
        <Stack.Screen name='sign-in' options={{ headerShown: false }} />
        <Stack.Screen name='sign-up' options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session && role && needsProfileSetup)}>
        <Stack.Screen name='profile-onboarding' options={{ headerShown: false, gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session && role && !needsProfileSetup)}>
        <Stack.Screen name='notifications' options={{ title: 'Notifications' }} />
        <Stack.Screen name='crew' options={{ title: 'Crew' }} />
        <Stack.Screen name='alerts' options={{ title: 'Alerts' }} />
        <Stack.Screen name='more' options={{ title: 'More' }} />
        <Stack.Screen name='my-events' options={{ title: 'My events' }} />
        <Stack.Screen name='my-shifts' options={{ title: 'My shifts' }} />
        <Stack.Screen name='choose-event' options={{ title: 'Choose event' }} />
        <Stack.Screen name='profile' options={{ title: 'My profile' }} />
        <Stack.Screen name='certificates' options={{ title: 'Certificates' }} />
        <Stack.Screen name='events/[id]/availability' options={{ title: 'Availability' }} />
        <Stack.Screen name='events/[id]/onboarding' options={{ headerShown: false }} />
        <Stack.Screen name='events/[id]/schedule' options={{ title: 'My shifts' }} />
        <Stack.Screen name='events/[id]/incident' options={{ title: 'Report incident' }} />
        <Stack.Screen name='events/[id]/qualifications' options={{ title: 'Crew qualifications' }} />
        <Stack.Screen name='events/[id]/roster' options={{ title: 'Crew and roster' }} />
        <Stack.Screen name='volunteer' options={{ title: 'Home' }} />
        <Stack.Screen name='join' options={{ title: 'Join event' }} />
        <Stack.Screen name='events/[id]' options={{ title: 'Event overview' }} />
        <Stack.Screen name='events/[id]/setup' options={{ title: 'Event setup' }} />
        <Stack.Screen name='events/[id]/map' options={{ title: 'Site map' }} />
        <Stack.Screen name='events/[id]/site' options={{ title: 'Locations and posts' }} />
        <Stack.Screen name='events/[id]/documents' options={{ title: 'Event documents' }} />
        <Stack.Screen name='events/[id]/assistant' options={{ title: 'Describe your event' }} />
        <Stack.Screen name='events/[id]/review' options={{ title: 'Review operating plan' }} />
        <Stack.Screen name='events/[id]/operations' options={{ title: 'Staffing requirements' }} />
        <Stack.Screen name='events/[id]/publish' options={{ title: 'Recruitment' }} />
        <Stack.Screen name='events/[id]/team' options={{ title: 'Team permissions' }} />
       <Stack.Screen name='events/[id]/live' options={{ title: 'Alerts' }} />
       <Stack.Screen name='events/[id]/crowd' options={{ title: 'Crowd control' }} />
       <Stack.Screen name='events/[id]/more' options={{ title: 'Event tools' }} />
       <Stack.Screen name='events/[id]/signals' options={{ title: 'Event signals' }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session && role === 'coordinator')}>
        <Stack.Screen name='coordinator' options={{ title: 'Home' }} />
        <Stack.Screen name='events/new' options={{ title: 'Create event' }} />
      </Stack.Protected>
    </Stack>
    <MainNavigation />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSansRegular: require('../../assets/fonts/DMSans-Regular.ttf'),
    DMSansMedium: require('../../assets/fonts/DMSans-Medium.ttf'),
    DMSansSemiBold: require('../../assets/fonts/DMSans-SemiBold.ttf'),
  });
  if (!fontsLoaded && !fontError) return <Loading />;
  return (
    <AuthProvider>
      <StatusBar style='dark' />
      <NavigationProvider><OperationsProvider><Routes /></OperationsProvider></NavigationProvider>
    </AuthProvider>
  );
}
