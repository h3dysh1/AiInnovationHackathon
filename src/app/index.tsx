import { signOut } from '@/services/sign-out';
import { Redirect } from 'expo-router';
import { Button, Notice, Page, Title } from '@/components/ui';
import { useAuth } from '@/hooks/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import { Welcome } from '@/components/welcome';

export default function Index() {
  const { session, role, error, reload, needsProfileSetup } = useAuth();
  if (!isSupabaseConfigured) {
    return <Page><Title subtitle="Connect the app to your Supabase project to begin.">Ground Control</Title><Notice message="Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart Expo." /></Page>;
  }
  if (!session) return <Welcome />;
  if (needsProfileSetup) return <Redirect href='/profile-onboarding' />;
  if (role === 'coordinator') return <Redirect href="/coordinator" />;
  if (role === 'volunteer') return <Redirect href="/volunteer" />;
  return <Page><Title>Account unavailable</Title><Notice message={error ?? 'Your account is not ready yet.'} /><Button title="Try again" onPress={() => { void reload(); }} /><Button title="Sign out" secondary onPress={() => { void signOut(); }} /></Page>;
}
