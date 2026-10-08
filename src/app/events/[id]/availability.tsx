import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Button, Field, Loading, Notice, Page, Section, Title } from '@/components/ui';
import { PlanCard } from '@/components/plan-ui';
import { useStaffing } from '@/hooks/staffing';
import { onboardingContext } from '@/services/staffing';
import { getEvent } from '@/services/events';
import { setupRpc } from '@/services/planning';
type Window = { startDate: string; endDate: string; startTime: string; endTime: string };
function local(iso: string, tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const v = (k: string) => parts.find((p) => p.type === k)?.value;
  return { date: `${v('year')}-${v('month')}-${v('day')}`, time: `${v('hour')}:${v('minute')}` };
}
export default function Availability() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(
    async () => ({ context: await onboardingContext(id), event: await getEvent(id),briefing:await setupRpc<{revision:number;acknowledged:boolean;procedures:{title:string;content:string}[]}>('event_briefing',{p_event_id:id}) }),
    [id],
  );
  const s = useStaffing(load);
  if (s.loading) return <Loading />;
  if (!s.data) {
    return (
      <Page>
        <Notice message={s.error ?? 'Event unavailable'} />
        <Button
          title='Retry'
          onPress={() => {
            void s.refresh();
          }}
        />
        <Button title='Back' onPress={() => router.back()} />
      </Page>
    );
  }
  return <AvailabilityForm id={id} s={s} data={s.data} />;
}
function AvailabilityForm({
  id,
  s,
  data,
}: {
  id: string;
  s: {error:string|null;pending:boolean;run:(operation:()=>Promise<unknown>)=>Promise<unknown>};
  data: {context:Awaited<ReturnType<typeof onboardingContext>>;event:Awaited<ReturnType<typeof getEvent>>;briefing:{revision:number;acknowledged:boolean;procedures:{title:string;content:string}[]}};

}) {
  const p = data.context.preferences;
  const [windows, setWindows] = useState<Window[]>(() =>
    data.context.availability.map((a) => {
      const x = local(a.starts_at, data.event.timezone), y = local(a.ends_at, data.event.timezone);
      return { startDate: x.date, endDate: y.date, startTime: x.time, endTime: y.time };
    })
  );
  const [preferred, setPreferred] = useState<string[]>(p?.preferred_posts ?? []);
  const [avoided, setAvoided] = useState<string[]>(p?.avoided_posts ?? []);
  const [hours, setHours] = useState(String(p?.desired_hours ?? 8));
  const [max, setMax] = useState(String(p?.maximum_hours ?? 40));
  const [daily, setDaily] = useState(String(p?.maximum_daily_hours ?? 8));
  const [start, setStart] = useState(p?.preferred_start?.slice(0, 5) ?? '');
  const [end, setEnd] = useState(p?.preferred_end?.slice(0, 5) ?? '');
  const [tags, setTags] = useState(p?.experience_tags.join(', ') ?? '');
  const [saved, setSaved] = useState(false);
  const toggle = (list: string[], post: string) =>
    list.includes(post) ? list.filter((x) => x !== post) : [...list, post];
  return (
    <Page>
      <Title subtitle={`${data.event.name} · All times in ${data.event.timezone}`}>
        Availability & preferences
      </Title>
      {s.error && <Notice message={s.error} />}
      {saved && (
        <Notice message='Availability saved. The coordinator can now include you in the roster.' />
      )}
      <Notice message='Only shifts fully within your availability can be assigned. Preferences guide the roster; maximum hours are enforced.' />
      <Section title='When can you help?'>
      {windows.map((w, i) => (
        <PlanCard key={i}>
          {(['startDate', 'startTime', 'endDate', 'endTime'] as const).map((k) => (
            <Field
              key={k}
              label={k.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase())}
              value={w[k]}
              placeholder={k.includes('Date') ? 'YYYY-MM-DD' : 'HH:MM'}
              onChangeText={(v) => {
                setSaved(false);
                setWindows(windows.map((x, n) => n === i ? { ...x, [k]: v } : x));
              }}
            />
          ))}
          <Button
            title='Remove window'
            secondary
            compact
            onPress={() => setWindows(windows.filter((_, n) => n !== i))}
          />
        </PlanCard>
      ))}
      <Button
        title='Add availability window'
        secondary
        compact
        onPress={() =>
          setWindows([...windows, {
            startDate: data.event.start_date,
            endDate: data.event.start_date,
            startTime: data.event.operating_start_time.slice(0, 5),
            endTime: data.event.operating_end_time.slice(0, 5),
          }])}
      />
      </Section>
      <Section title='How much would you like to work?'>
      <Field
        label='Desired total hours'
        value={hours}
        onChangeText={setHours}
        keyboardType='decimal-pad'
      />
      <Field
        label='Maximum total hours'
        value={max}
        onChangeText={setMax}
        keyboardType='decimal-pad'
      />
      <Field
        label='Maximum daily hours'
        value={daily}
        onChangeText={setDaily}
        keyboardType='decimal-pad'
      />
      </Section>
      <Section title='Optional preferences'>
      <Field
        label='Preferred start time (optional)'
        value={start}
        onChangeText={setStart}
        placeholder='HH:MM'
      />
      <Field
        label='Preferred end time (optional)'
        value={end}
        onChangeText={setEnd}
        placeholder='HH:MM'
      />
      <Field
        label='Experience labels (comma separated)'
        value={tags}
        onChangeText={setTags}
        placeholder='e.g. crowd management'
      />
      <Text>Experience requirements count only after a manager reviews them.</Text>
      {data.context.posts.map((p) => (
        <PlanCard key={p.id}>
          <Text>{p.location_name} · {p.name}</Text>
          <Button
            title={preferred.includes(p.id) ? '✓ Preferred' : 'Prefer this post'}
            secondary
            compact
            onPress={() => {
              setPreferred(toggle(preferred, p.id));
              setAvoided(avoided.filter((x) => x !== p.id));
            }}
          />
          <Button
            title={avoided.includes(p.id) ? '✓ Prefer to avoid' : 'Prefer to avoid this post'}
            secondary
            compact
            onPress={() => {
              setAvoided(toggle(avoided, p.id));
              setPreferred(preferred.filter((x) => x !== p.id));
            }}
          />
        </PlanCard>
      ))}
      </Section>
      <Section title='Event briefing'>
        {data.briefing.procedures.map(p=><PlanCard key={p.title}><Text>{p.title}</Text><Text>{p.content}</Text></PlanCard>)}
        <Button title={data.briefing.acknowledged?'✓ Current briefing acknowledged':'I have read the event procedures and will follow coordinator instructions'} secondary disabled={s.pending||data.briefing.acknowledged} onPress={()=>{void s.run(()=>setupRpc('acknowledge_event_briefing',{p_event_id:id,p_revision:data.briefing.revision}));}}/>
      </Section>
      <Button
        title={s.pending ? 'Saving…' : 'Save availability'}
        disabled={s.pending}
        onPress={() => {
          void s.run(async () => {
            if (
              [hours, max, daily].some((v) => !v.trim() || !Number.isFinite(Number(v)))
            ) throw new Error('Enter valid hours.');
            await setupRpc('save_event_onboarding', {
              p_event_id: id,
              p_windows: windows,
              p_preferences: {
                preferredPosts: preferred,
                avoidedPosts: avoided,
                preferredStart: start,
                preferredEnd: end,
                desiredHours: Number(hours),
                maximumHours: Number(max),
                maximumDailyHours: Number(daily),
                experienceTags: tags.split(',').map((x) => x.trim()).filter(Boolean),
              },
            });
            setSaved(true);
          });
        }}
      />
      <Button title='My certificates' secondary onPress={() => router.push('/certificates')} />
      <Button title='Back' secondary onPress={() => router.back()} />
    </Page>
  );
}
