import { setupRpc } from '@/services/planning';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Button, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { useAuth } from '@/hooks/auth';
import { getVolunteerProfile, saveUserProfile, saveVolunteerProfile } from '@/services/profile';

export default function ProfileScreen() {
  const { session, role, profile, reload } = useAuth();
  const [organisation,setOrganisation]=useState('');
  const [name, setName] = useState(profile?.display_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [experience, setExperience] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void getVolunteerProfile(session.user.id).then((data) => {
      if (!active) return;
      setEmergencyName(data?.emergency_contact_name ?? '');
      setEmergencyPhone(data?.emergency_contact_phone ?? '');
      setExperience(data?.experience_level ?? '');
    }).catch((cause) => {
      if (active) {
        setMessage(cause instanceof Error ? cause.message : 'Could not load volunteer details.');
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [session, role]);

  async function save() {
    if (!session) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveUserProfile(session.user.id, {
        display_name: name.trim(),
        phone: phone.trim() || null,
      });
      if (session) {
        await saveVolunteerProfile(session.user.id, {
          emergency_contact_name: emergencyName.trim() || null,
          emergency_contact_phone: emergencyPhone.trim() || null,
          experience_level: experience.trim() || null,
        });
      }
      await reload();
      setMessage('Profile saved.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label='Loading profile…' />;
  return (
    <Page>
      <Title
        subtitle={role === 'volunteer'
          ? 'Keep your contact and experience details up to date.'
          : 'Your coordinator account details.'}
      >
        My profile
      </Title>
      {message ? <Notice message={message} /> : null}
      {role==='volunteer'?<>
        <Field label='Organisation (to manage your own events)' value={organisation} onChangeText={setOrganisation}/>
        <Button title='Create my coordinator workspace' disabled={saving||!organisation.trim()} onPress={()=>{setSaving(true);void setupRpc('become_coordinator',{p_organisation_name:organisation}).then(async()=>{await reload();router.replace('/coordinator');}).catch(cause=>setMessage(cause instanceof Error?cause.message:'Could not create workspace.')).finally(()=>setSaving(false));}}/>
      </>:null}
      <Field label='Name' value={name} onChangeText={setName} autoComplete='name' />
      <Field
        label='Phone'
        value={phone}
        onChangeText={setPhone}
        keyboardType='phone-pad'
        autoComplete='tel'
      />
      {
        <>
          <Field
            label='Emergency contact name'
            value={emergencyName}
            onChangeText={setEmergencyName}
          />
          <Field
            label='Emergency contact phone'
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            keyboardType='phone-pad'
          />
          <Field
            label='Experience'
            value={experience}
            onChangeText={setExperience}
            placeholder='e.g. First event, experienced'
          />
        </>
      }
      <Button
        title={saving ? 'Saving…' : 'Save profile'}
        disabled={saving || !name.trim()}
        onPress={() => {
          void save();
        }}
      />
      {role === 'volunteer'
        ? <Button title='My certificates' secondary onPress={() => router.push('/certificates')} />
        : null}
      <Button title='Back' secondary onPress={() => router.back()} />
    </Page>
  );
}
