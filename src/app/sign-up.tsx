import { useState } from 'react';
import { router, Link } from 'expo-router';
import { Button, Field, Notice } from '@/components/ui';
import { OnboardingPage } from '@/components/onboarding-ui';
import { supabase } from '@/services/supabase';
import { colors } from '@/theme';

export default function SignUp() {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  async function submit() {
    if (!supabase) { setError('Account service is unavailable. Try again shortly.'); return; }
    setPending(true); setError(null);
    try {
      const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { profile_onboarding_required: true } } });
      if (authError) throw authError;
      if (!data.session) { setConfirmation(true); setPassword(''); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create your account. Try again.'); }
    finally { setPending(false); }
  }
  return <OnboardingPage step={confirmation ? 1 : step} total={2} title={confirmation ? 'Check your inbox.' : step === 0 ? 'Join the crew.' : 'Make it yours.'} subtitle={confirmation ? `We sent a confirmation link to ${email.trim()}. Confirm your email, then log in here to finish your volunteer profile before entering the app.` : step === 0 ? 'First, what’s your email?' : 'Choose a password. Next, we’ll get to know you.'} onBack={() => { if (pending) return; setError(null); if (confirmation) router.replace('/'); else if (step) setStep(0); else router.replace('/'); }}>
    {error ? <Notice tone='error' message={error} /> : null}
    {confirmation ? <Button title='Continue to log in' onPress={() => router.replace('/sign-in')} /> : <>
      {step === 0 ? <Field label='Email' value={email} onChangeText={setEmail} keyboardType='email-address' autoCapitalize='none' autoComplete='email' /> : <Field label='Password (at least 6 characters)' value={password} onChangeText={setPassword} secureTextEntry autoCapitalize='none' autoComplete='new-password' />}
      <Button title={pending ? 'Creating account…' : step === 0 ? 'Continue' : 'Create account'} disabled={pending || (step === 0 ? !email.trim() : password.length < 6)} onPress={() => { if (step) void submit(); else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) setError('Enter a valid email address.'); else { setError(null); setStep(1); } }} />
      {step === 0 ? <Link href='/sign-in' style={{ color: colors.secondary, textAlign: 'center', fontFamily: 'DMSansRegular', fontSize: 15 }}>Already part of the crew? Log in</Link> : null}
    </>}
  </OnboardingPage>;
}
