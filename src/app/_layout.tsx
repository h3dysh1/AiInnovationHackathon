import { Stack } from 'expo-router';
import { Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/hooks/auth';

function Routes() {
  const { session, role, loading } = useAuth();
  if (loading) return <Loading label='Opening Ground Control…' />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name='index' />
      <Stack.Protected guard={!session}>
        <Stack.Screen name='sign-in' />
        <Stack.Screen name='sign-up' />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session && role)}>
        <Stack.Screen name='profile' />
        <Stack.Screen name='certificates' />
        <Stack.Screen name='events/[id]/availability' />
        <Stack.Screen name='events/[id]/schedule' />
        <Stack.Screen name='events/[id]/incident' />
        <Stack.Screen name='events/[id]/qualifications' />
        <Stack.Screen name='events/[id]/roster' />
        <Stack.Screen name='volunteer' />
        <Stack.Screen name='join' />
        <Stack.Screen name='events/[id]' />
        <Stack.Screen name='events/[id]/setup' />
        <Stack.Screen name='events/[id]/map' />
        <Stack.Screen name='events/[id]/site' />
        <Stack.Screen name='events/[id]/documents' />
        <Stack.Screen name='events/[id]/assistant' />
        <Stack.Screen name='events/[id]/review' />
        <Stack.Screen name='events/[id]/operations' />
        <Stack.Screen name='events/[id]/publish' />
        <Stack.Screen name='events/[id]/team' />
        <Stack.Screen name='events/[id]/live' />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session && role === 'coordinator')}>
        <Stack.Screen name='coordinator' />
        <Stack.Screen name='events/new' />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}
