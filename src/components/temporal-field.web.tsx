import { AppText as Text } from '@/components/app-text';
import { colors } from '@/theme';
import { View } from 'react-native';
export function TemporalField({ label, value, onChangeText, mode }: { label: string; value: string; onChangeText: (value: string) => void; mode: 'date' | 'time' }) {
  return <View style={{ gap: 8 }}><Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    <input aria-label={label} type={mode} value={value} onChange={event => onChangeText(event.target.value)} style={{ minHeight: 54, boxSizing: 'border-box', width: '100%', border: 0, borderBottom: `1px solid ${colors.fieldBorder}`, borderRadius: 0, padding: '15px 0', color: colors.text, background: 'transparent', fontFamily: 'DMSansRegular, sans-serif', fontSize: 16 }} />
  </View>;
}
