import { Field } from '@/components/ui';
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
      <Field label="Description (optional)" value={value.description} onChangeText={text => set('description', text)} placeholder="Three-day riverfront festival" multiline />
      <Field label="Venue name" value={value.venueName} onChangeText={text => set('venueName', text)} placeholder="Riverside Park" />
      <Field label="Address (optional)" value={value.address} onChangeText={text => set('address', text)} placeholder="Street address" />
      <Field label="Expected attendance (optional)" value={value.expectedAttendance} onChangeText={text => set('expectedAttendance', text)} keyboardType="number-pad" placeholder="300" />
    </>;
  }
  return <>
    <Field label="Start date (YYYY-MM-DD)" value={value.startDate} onChangeText={text => set('startDate', text)} placeholder="2026-12-12" />
    <Field label="End date (YYYY-MM-DD)" value={value.endDate} onChangeText={text => set('endDate', text)} placeholder="2026-12-14" />
    <Field label="Daily opening time (HH:MM)" value={value.operatingStartTime} onChangeText={text => set('operatingStartTime', text)} placeholder="09:00" />
    <Field label="Daily closing time (HH:MM)" value={value.operatingEndTime} onChangeText={text => set('operatingEndTime', text)} placeholder="22:00" />
    <Field label="Timezone" value={value.timezone} onChangeText={text => set('timezone', text)} placeholder="Australia/Melbourne" autoCapitalize="none" />
  </>;
}
