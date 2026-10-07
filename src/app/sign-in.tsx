import { useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Button, Field, Notice, Page, Title } from '@/components/ui';
import { supabase } from '@/services/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!supabase) return;
    setPending(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) setError(authError.message);
    setPending(false);
  }

  return <Page>
    <Title subtitle="Sign in to your event crew account.">Ground Control</Title>
    {error ? <Notice message={error} /> : null}
    <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
    <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="password" />
    <Button title={pending ? 'Signing in…' : 'Sign in'} disabled={pending || !email.trim() || !password} onPress={() => { void submit(); }} />
    <Link href="/sign-up" style={styles.link}>New here? Create an account</Link>
  </Page>;
}

const styles = StyleSheet.create({ link: { color: '#126B79', fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 10 } });
