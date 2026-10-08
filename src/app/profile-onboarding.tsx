import { signOut } from '@/services/sign-out';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Button, Field, Loading, Notice, Page } from '@/components/ui';
import { Choice, OnboardingPage } from '@/components/onboarding-ui';
import { AppText as Text } from '@/components/app-text';
import { useAuth } from '@/hooks/auth';
import { getVolunteerProfile, saveUserProfile, saveVolunteerProfile } from '@/services/profile';
import { completeVolunteerRegistration } from '@/services/registration';

export default function ProfileOnboarding() {
  const { session, profile, reload } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [experience, setExperience] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    let active = true;
    void getVolunteerProfile(session.user.id).then(p => { if (active) { setLoadFailed(false); setEmergencyName(p?.emergency_contact_name ?? ''); setEmergencyPhone(p?.emergency_contact_phone ?? ''); setExperience(p?.experience_level ?? ''); } }).catch(() => { if (active) { setLoadFailed(true); setError('Could not restore your profile. Retry before editing.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session, attempt]);
  async function next() {
    if (!session) return;
    setError(null); setPending(true);
    try {
      if (step < 2) await saveUserProfile(session.user.id, { display_name: name.trim(), phone: phone.trim() || null });
      else if (step < 4) await saveVolunteerProfile(session.user.id, { emergency_contact_name: emergencyName.trim() || null, emergency_contact_phone: emergencyPhone.trim() || null, experience_level: experience || null });
      if (step === 4) { await completeVolunteerRegistration(session.user.id, { name, phone, emergencyName, emergencyPhone, experience }); await reload(); router.replace('/'); }
      else setStep(step + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your details are still here.'); }
    finally { setPending(false); }
  }
  if (loading) return <Loading label='Preparing your profile…' />;
  if (loadFailed) return <Page><Notice tone='error' message={error!} /><Button title='Try again' onPress={() => { setLoading(true); setAttempt(attempt + 1); }} /><Button title='Sign out' secondary onPress={() => { void signOut(); }} /></Page>;
  const valid = step === 0 ? Boolean(name.trim()) : step === 1 ? phone.replace(/\D/g, '').length >= 6 : step === 2 ? Boolean(emergencyName.trim()) && emergencyPhone.replace(/\D/g, '').length >= 6 : step === 3 ? Boolean(experience) : true;
  const titles = ['What should we call you?', 'How can we reach you?', 'Who should we call?', 'Have you crewed before?', 'You’re part of the crew.'];
  const subtitles = ['Use the name your coordinator will recognise.', 'Your coordinator may need to contact you during an event.', 'Add an emergency contact before your first event.', 'This helps coordinators find the right fit. No experience is needed to get started.', 'Your profile is ready. Each event will ask for its own availability and qualifications.'];
  return <OnboardingPage step={step} total={5} title={titles[step]} subtitle={subtitles[step]} onBack={() => { if (!pending) { setError(null); if (step) setStep(step - 1); } }}>
    {error ? <Notice tone='error' message={error} /> : null}
    {step === 0 ? <Field label='Name' value={name} onChangeText={setName} autoComplete='name' /> : null}
    {step === 1 ? <Field label='Phone' value={phone} onChangeText={setPhone} keyboardType='phone-pad' autoComplete='tel' /> : null}
    {step === 2 ? <><Field label='Emergency contact name' value={emergencyName} onChangeText={setEmergencyName} /><Field label='Emergency contact phone' value={emergencyPhone} onChangeText={setEmergencyPhone} keyboardType='phone-pad' /></> : null}
    {step === 3 ? ['My first event', 'A few events', 'Experienced crew'].map(title => <Choice key={title} title={title} selected={experience === title} onPress={() => setExperience(title)} />) : null}
    {step === 4 ? <><Text>{name} · {phone}</Text><Text>Emergency contact: {emergencyName} · {emergencyPhone}</Text><Text>{experience}</Text></> : null}
    <Button title={pending ? 'Saving…' : step === 4 ? 'Find my first event' : 'Continue'} disabled={pending || !valid} onPress={() => { void next(); }} />
    <Button title='Finish later · sign out' secondary disabled={pending} onPress={() => { void signOut(); }} />
  </OnboardingPage>;
}
