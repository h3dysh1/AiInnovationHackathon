import { AppText as Text } from '@/components/app-text';
import { colors } from '@/theme';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import NativeDateTimePicker from '@expo/ui/community/datetime-picker';
import { Button, Field } from './ui';

type Props = { label: string; value: string; onChangeText: (value: string) => void; mode: 'date' | 'time' };
// These values are calendar dates / wall-clock times in the event timezone,
// not instants. Using the device calendar here avoids a UTC day conversion.
export function TemporalField({ label, value, onChangeText, mode }: Props) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const date = mode === 'date' ? new Date(`${value}T12:00:00`) : new Date(`2000-01-01T${value || '09:00'}:00`);
  const selected = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (n: number) => String(n).padStart(2, '0');
  return <View style={{ gap: 8 }}>
    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    <Button title={value || `Choose ${mode}`} secondary onPress={() => setOpen(!open)} />
    {open ? <NativeDateTimePicker value={selected} mode={mode} is24Hour display={Platform.OS === 'ios' ? 'compact' : 'default'} onDismiss={() => setOpen(false)} onValueChange={(_event, next) => {
      onChangeText(mode === 'date' ? `${next.getFullYear()}-${pad(next.getMonth()+1)}-${pad(next.getDate())}` : `${pad(next.getHours())}:${pad(next.getMinutes())}`);
      if (Platform.OS === 'android') setOpen(false);
    }} /> : null}
    <Button title={manual ? 'Hide manual entry' : `Enter ${mode} manually`} secondary compact onPress={() => setManual(!manual)} />
    {manual ? <Field label={`${label} (${mode === 'date' ? 'YYYY-MM-DD' : 'HH:MM'})`} value={value} onChangeText={onChangeText} /> : null}
  </View>;
}
