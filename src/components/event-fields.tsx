import { TemporalField } from './temporal-field';
import { Disclosure, Field } from '@/components/ui';
import type { EventDraft } from '@/domain/event';

type Props = {
  value: EventDraft;
  onChange: (next: EventDraft) => void;
  section: 'basics' | 'schedule';
};

export function EventFields({ value, onChange, section }: Props) {
  function set<K extends keyof EventDraft>(key: K, next: EventDraft[K]) {
    onChange({ ...value, [key]: next });
  }

  if (section === 'basics') {
    return <>
      <Field label="Event name" value={value.name} onChangeText={text => set('name', text)} placeholder="Riverside 2026" />
      <Field label="Venue name" value={value.venueName} onChangeText={text => set('venueName', text)} placeholder="Riverside Park" />
      <Disclosure title='Optional event details'>
      <Field label="Description (optional)" value={value.description} onChangeText={text => set('description', text)} placeholder="Three-day riverfront festival" multiline />
      <Field label="Address (optional)" value={value.address} onChangeText={text => set('address', text)} placeholder="Street address" />
      <Field label="Approximate workforce (optional)" value={value.approximateWorkforce??''} onChangeText={text=>set('approximateWorkforce',text)} keyboardType="number-pad"/>
      <Field label="Expected attendance (optional)" value={value.expectedAttendance} onChangeText={text => set('expectedAttendance', text)} keyboardType="number-pad" placeholder="300" />
      </Disclosure>
    </>;
  }
  return <>
    <TemporalField mode="date" label="Start date" value={value.startDate} onChangeText={text => set('startDate', text)} />
    <TemporalField mode="date" label="End date" value={value.endDate} onChangeText={text => set('endDate', text)} />
    <TemporalField mode="time" label="Daily opening time" value={value.operatingStartTime} onChangeText={text => set('operatingStartTime', text)} />
    <TemporalField mode="time" label="Daily closing time" value={value.operatingEndTime} onChangeText={text => set('operatingEndTime', text)} />
    <Field label="Timezone" value={value.timezone} onChangeText={text => set('timezone', text)} placeholder="Australia/Melbourne" autoCapitalize="none" />
  </>;
}
