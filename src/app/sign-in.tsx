import { useState } from 'react';
import { router, Link } from 'expo-router';
import { Button, Field, Notice } from '@/components/ui';
import { OnboardingPage } from '@/components/onboarding-ui';
import { supabase } from '@/services/supabase';
import { colors } from '@/theme';

export default function SignIn() {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (!supabase) { setError('Account service is unavailable. Try again shortly.'); return; }
    setPending(true); setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not log in. Your details are still here; try again.'); }
    finally { setPending(false); }
  }
  return <OnboardingPage step={step} total={2} title={step === 0 ? 'Welcome back.' : 'Your password?'} subtitle={step === 0 ? 'Start with the email you use for Ground Control.' : email.trim()} onBack={() => { if (pending) return; setError(null); if (step) setStep(0); else router.replace('/'); }}>
    {error ? <Notice tone='error' message={error} /> : null}
    {step === 0 ? <Field label='Email' value={email} onChangeText={setEmail} keyboardType='email-address' autoCapitalize='none' autoComplete='email' /> : <Field label='Password' value={password} onChangeText={setPassword} secureTextEntry autoCapitalize='none' autoComplete='password' />}
    <Button title={pending ? 'Logging in…' : step === 0 ? 'Continue' : 'Log in'} disabled={pending || (step === 0 ? !email.trim() : !password)} onPress={() => { if (step) void submit(); else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) setError('Enter a valid email address.'); else { setError(null); setStep(1); } }} />
    {step === 0 ? <Link href='/sign-up' style={{ color: colors.secondary, textAlign: 'center', fontFamily: 'DMSansRegular', fontSize: 15 }}>New here? Create an account</Link> : null}
  </OnboardingPage>;
}
