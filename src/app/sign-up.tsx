import { useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Button, Field, Notice, Page, Title } from '@/components/ui';
import { supabase } from '@/services/supabase';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (!supabase) return;
    setPending(true);
    setMessage(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    setMessage(error?.message ?? (data.session ? 'Account created.' : 'Open the link in your email to confirm your account, then return to this app and sign in.'));
    setPending(false);
  }

  return <Page>
    <Title subtitle="Create your volunteer account. After you confirm your email, Ground Control will guide you through your profile and certificates.">Join the crew</Title>
    {message ? <Notice message={message} /> : null}
    <Field label="Name" value={name} onChangeText={setName} autoComplete="name" />
    <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
    <Field label="Password (at least 6 characters)" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
    <Button title={pending ? 'Creating…' : 'Create account'} disabled={pending || !name.trim() || !email.trim() || password.length < 6} onPress={() => { void submit(); }} />
    <Link href="/sign-in" style={styles.link}>Already have an account? Sign in</Link>
  </Page>;
}

const styles = StyleSheet.create({ link: { color: '#126B79', fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 10 } });
