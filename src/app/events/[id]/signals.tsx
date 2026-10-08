import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EventManagerGate } from '@/components/event-manager-gate';
import { Button, Disclosure, Field, Notice, Page, Section, Title } from '@/components/ui';
import { AppText as Text } from '@/components/app-text';
import { planStyles } from '@/components/plan-ui';
import { useStaffing } from '@/hooks/staffing';
import { eventSignals, importDemoSocial, refreshWeather } from '@/services/event-signals';
import { setupRpc } from '@/services/planning';
import { weatherDescription } from '@/domain/external-signals';
import { validVenuePoint } from '@/domain/site-geometry';
import VenuePicker from '@/components/venue-picker';
import { mockPosts } from '@/social/mockPosts';
import { processSocialPosts } from '@/social/socialProcessor';

export default function EventSignals() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventManagerGate id={id}><Signals eventId={id} /></EventManagerGate>;
}
function Signals({ eventId }: { eventId: string }) {
  const s = useStaffing(useCallback(() => eventSignals(eventId), [eventId]));
  const [latitudeEdit, setLatitude] = useState<string | null>(null), [longitudeEdit, setLongitude] = useState<string | null>(null);
  const [heatEdit, setHeat] = useState<string | null>(null), [gustEdit, setGust] = useState<string | null>(null);
  // Disabling weather clears its coordinates, so fall back to the saved venue.
  const point = s.data?.settings?.latitude != null ? s.data.settings : s.data?.venue;
  const latitude = latitudeEdit ?? (point ? String(point.latitude) : '');
  const longitude = longitudeEdit ?? (point ? String(point.longitude) : '');
  const heat = heatEdit ?? String(s.data?.settings?.heat_threshold ?? 35), gust = gustEdit ?? String(s.data?.settings?.gust_threshold ?? 60);
  const picked = { latitude: Number(latitude), longitude: Number(longitude) };
  const { refresh } = s;
  useEffect(() => {
    const timer = setInterval(() => { void refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  return <Page>
    <Title subtitle='Advisory context for human operational decisions.'>Event signals</Title>
    {s.error ? <Notice tone='error' message={s.error} /> : null}
    <Section title='Weather'>
      {s.data?.settings?.weather_reading ? <>
        <Text style={planStyles.text}>{weatherDescription(s.data.settings.weather_reading)}</Text>
        <Text style={planStyles.help}>Model time: {new Date(s.data.settings.weather_reading.observedAt).toLocaleString()}{(s.updatedAt?.getTime() ?? 0) - Date.parse(s.data.settings.weather_reading.observedAt) > 3600000 ? ' · Stale — check current site conditions' : ''}</Text>
      </> : <Notice message={s.data?.settings?.weather_enabled ? 'Waiting for weather data. Refresh to check progress.' : 'Weather is off. Configure the venue coordinates to enable it.'} />}
      {s.data?.settings?.last_error ? <Notice tone='warning' message={s.data.settings.last_error} /> : null}
      <Text style={planStyles.help}>Modelled conditions from Open-Meteo. This is not an official emergency warning service. Live events refresh about every 15 minutes; you can also request a check before the event.</Text>
      <Button title='Check weather' secondary disabled={s.pending || !s.data?.settings?.weather_enabled} onPress={() => { void s.run(() => refreshWeather(eventId)); }} />
      <Disclosure title='Weather location and advisory thresholds'>
        <VenuePicker value={latitude.trim() && longitude.trim() && validVenuePoint(picked) ? picked : null} disabled={s.pending} onChange={next => { setLatitude(String(next.latitude)); setLongitude(String(next.longitude)); }} />
        <Field label='Venue latitude (−90 to 90)' value={latitude} onChangeText={setLatitude} />
        <Field label='Venue longitude (−180 to 180)' value={longitude} onChangeText={setLongitude} />
        <Field label='Heat advisory threshold (°C)' value={heat} onChangeText={setHeat} keyboardType='decimal-pad' />
        <Field label='Wind gust advisory threshold (km/h)' value={gust} onChangeText={setGust} keyboardType='decimal-pad' />
        <Button title='Enable weather with these settings' disabled={s.pending} onPress={() => { void s.run(async () => {
          const values = [latitude, longitude, heat, gust].map(v => v.trim() ? Number(v) : NaN);
          if (values.some(v => !Number.isFinite(v))) throw new Error('Enter valid coordinates and thresholds.');
          await setupRpc('configure_event_weather', { p_event_id: eventId, p_enabled: true, p_latitude: values[0], p_longitude: values[1], p_heat: values[2], p_gust: values[3] });
          await refreshWeather(eventId);
        }); }} />
        <Button title='Disable weather' secondary disabled={s.pending || !s.data?.settings?.weather_enabled} onPress={() => { void s.run(() => setupRpc('configure_event_weather', { p_event_id: eventId, p_enabled: false, p_latitude: null, p_longitude: null })); }} />
      </Disclosure>
    </Section>
    <Section title='Demo social feed' description='Hardcoded tweets, retained as a synthetic source.'>
      <Notice message='These posts are demo data. Their claims and location text are unverified. Importing them retains the originals and adds advisory observations; it does not create confirmed incidents or move crew.' />
      {processSocialPosts().map(signal => <Section key={signal.id} title={signal.category} description={`Unverified location: ${signal.zone ?? 'Unknown'}`}><Text style={planStyles.text}>{signal.summary}</Text></Section>)}
      <Button title='Import demo social signals for review' disabled={s.pending} onPress={() => { void s.run(() => importDemoSocial(eventId)); }} />
      <Disclosure title='Original demo tweets'>{mockPosts.map(post => <Text key={post.id} style={planStyles.text}>{post.timestamp} · {post.text}</Text>)}</Disclosure>
    </Section>
    <Disclosure title='Saved signal history'>
      {s.data?.signals.map(signal => <Section key={signal.id} title={`${signal.synthetic ? 'Demo · ' : ''}${signal.title}`} description={new Date(signal.observed_at).toLocaleString()}><Text style={planStyles.text}>{signal.detail}</Text></Section>)}
    </Disclosure>
  </Page>;
}
