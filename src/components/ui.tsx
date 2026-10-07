import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export function Page({ children }: PropsWithChildren) {
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export function Title({ children, subtitle }: PropsWithChildren<{ subtitle?: string }>) {
  return <View style={styles.heading}><Text style={styles.title}>{children}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
}

export function Field({ label, value, onChangeText, ...props }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoComplete?: 'email' | 'name' | 'tel' | 'username' | 'password' | 'new-password';
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  secureTextEntry?: boolean;
  multiline?: boolean;
  editable?: boolean;
}) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChangeText} placeholderTextColor="#789" {...props} /></View>;
}

export function Button({ title, onPress, onPressIn, onPressOut, disabled, secondary, compact }: {
  title: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  compact?: boolean;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={[styles.button, secondary && styles.secondaryButton, compact && styles.compactButton, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText, compact && styles.compactText]}>{title}</Text></Pressable>;
}

export function Notice({ message }: { message: string }) {
  return <View style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View>;
}

export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <View style={styles.loading}><ActivityIndicator color="#123B53" /><Text style={styles.subtitle}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: '#F4F7F7', padding: 24, paddingTop: 72, gap: 16 },
  heading: { gap: 8, marginBottom: 10 },
  title: { fontSize: 32, fontWeight: '800', color: '#123B53' },
  subtitle: { fontSize: 16, color: '#45616E', lineHeight: 22 },
  field: { gap: 7 },
  label: { fontSize: 14, fontWeight: '700', color: '#234759' },
  input: { borderWidth: 1, borderColor: '#B9CDD3', borderRadius: 12, backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 13, fontSize: 16, color: '#123B53' },
  button: { backgroundColor: '#126B79', borderRadius: 12, padding: 15, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  secondaryButton: { backgroundColor: '#E4EFF1' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  secondaryText: { color: '#123B53' },
  compactButton: { minHeight: 40, paddingVertical: 10, paddingHorizontal: 12, alignSelf: 'flex-start' },
  compactText: { fontSize: 14 },
  section: { gap: 10 },
  sectionTitle: { color: '#123B53', fontSize: 18, fontWeight: '800' },
  notice: { backgroundColor: '#FFF2D6', borderRadius: 12, padding: 14 },
  noticeText: { color: '#594318', fontSize: 14, lineHeight: 20 },
  loading: { flex: 1, backgroundColor: '#F4F7F7', alignItems: 'center', justifyContent: 'center', gap: 12 },
});
