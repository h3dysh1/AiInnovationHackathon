import { AppText as Text } from '@/components/app-text';
import { colors, fonts, radius, space } from '@/theme';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { useState, type PropsWithChildren } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

export function Page({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const path = usePathname();
  const headerHidden = path === '/' || path === '/sign-in' || path === '/sign-up' || path === '/profile-onboarding' || path.endsWith('/onboarding');
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <ScrollView contentContainerStyle={[styles.page, { paddingHorizontal: width >= 768 ? space.xxl : space.xl, paddingTop: headerHidden ? insets.top + space.xxxl : space.xl, paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
      <View style={[styles.content, path === '/sign-in' && styles.authContent]}>{children}</View>
    </ScrollView>
  </View>;
}

export function Title({ children, subtitle }: PropsWithChildren<{ subtitle?: string }>) {
  return <View style={styles.heading}><Text accessibilityRole="header" maxFontSizeMultiplier={1.8} style={styles.title}>{children}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
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
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} selectionColor={colors.accent} accessibilityLabel={label} style={[styles.input, focused && styles.inputFocused, props.editable === false && styles.disabled, props.multiline && { minHeight: 110, textAlignVertical: 'top' }]} value={value} onChangeText={onChangeText} placeholderTextColor={colors.placeholder} {...props} /></View>;
}

export function Button({ title, onPress, onPressIn, onPressOut, disabled, secondary, compact, selected, busy }: {
  title: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  compact?: boolean;
  selected?: boolean;
  busy?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const reducedMotion = useReducedMotion();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled), selected, busy }} disabled={disabled} onPress={onPress} onPressIn={() => { setPressed(true); onPressIn?.(); }} onPressOut={() => { setPressed(false); onPressOut?.(); }} pressRetentionOffset={16} style={compact ? { alignSelf: 'flex-start', maxWidth: '100%' } : undefined}>
    <Animated.View style={[styles.button, secondary && styles.secondaryButton, compact && styles.compactButton, selected && styles.selectedButton, { transform: [{ scale: pressed && !reducedMotion ? 0.98 : 1 }], opacity: disabled ? 0.45 : pressed ? 0.82 : 1, transitionProperty: ['transform', 'opacity'], transitionDuration: '120ms', transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1) }]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText, compact && styles.compactText, selected && { color: colors.accent }]}>{title}</Text>
    </Animated.View>
  </Pressable>;
}

export function Notice({ message, tone = 'info' }: { message: string; tone?: 'info' | 'success' | 'warning' | 'error' }) {
  const urgent = tone === 'error' || tone === 'warning';
  return <View accessibilityRole={urgent ? 'alert' : undefined} accessibilityLiveRegion={urgent ? 'assertive' : 'polite'} style={[styles.notice, tone === 'info' && { backgroundColor: colors.accentSoft }, tone === 'success' && { backgroundColor: colors.successSoft }, tone === 'error' && { backgroundColor: colors.errorSoft }]}><Text style={[styles.noticeText, tone === 'info' && { color: colors.text }, tone === 'success' && { color: colors.success }, tone === 'error' && { color: colors.error }]}>{message}</Text></View>;
}

// Keep children mounted so disclosure never discards an in-progress editor.
export function Disclosure({ title, children, initiallyOpen = false }: PropsWithChildren<{ title: string; initiallyOpen?: boolean }>) {
  const [open, setOpen] = useState(initiallyOpen);
  const [opened, setOpened] = useState(initiallyOpen);
  const reducedMotion = useReducedMotion();
  return <View style={styles.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => { setOpened(true); setOpen(!open); }} style={styles.disclosure}>
      <Text style={[styles.sectionTitle, { flex: 1 }]}>{title}</Text><Animated.View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }], transitionProperty: 'transform', transitionDuration: reducedMotion ? '0ms' : '180ms', transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1) }}><SymbolView accessible={false} name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} tintColor={colors.secondary} size={18} /></Animated.View>
    </Pressable>
    <View style={!open ? { display: 'none' } : { gap: 16 }} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>{opened ? children : null}</View>
  </View>;
}

export function Section({ title, children, description, count }: PropsWithChildren<{ title: string; description?: string; count?: number }>) {
  return <View style={styles.contentSection}>
    <View style={styles.sectionHeader}><View style={{ flex: 1, gap: 4 }}><Text accessibilityRole="header" style={styles.groupTitle}>{title}</Text>{description ? <Text style={styles.subtitle}>{description}</Text> : null}</View>{count !== undefined ? <Text accessibilityLabel={`${count} items`} style={styles.sectionCount}>{count}</Text> : null}</View>
    <View style={{ gap: 12 }}>{children}</View>
  </View>;
}

export function NavigationRow({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable accessibilityRole='button' onPress={onPress} style={({ pressed }) => ({ minHeight: 56, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, opacity: pressed ? 0.6 : 1 })}>
    <Text style={{ flex: 1, fontSize: 16, lineHeight: 24 }}>{title}</Text><SymbolView accessible={false} name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} tintColor={colors.secondary} />
  </Pressable>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <View style={styles.loading}><ActivityIndicator color={colors.text} /><Text style={styles.subtitle}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: colors.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', gap: space.xl },
  authContent: { maxWidth: 420, marginVertical: 'auto', paddingVertical: space.xxl },
  disclosure: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  heading: { gap: space.sm, marginBottom: space.sm },
  title: { fontSize: 34, lineHeight: 41, letterSpacing: -0.8, fontWeight: '500', color: colors.text },
  subtitle: { fontSize: 15, color: colors.secondary, lineHeight: 23 },
  field: { gap: 7 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: { borderWidth: 0, borderBottomWidth: 1, borderColor: colors.fieldBorder, borderRadius: 0, backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 15, minHeight: 54, fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  inputFocused: { borderColor: colors.accent },
  button: { backgroundColor: colors.accent, borderRadius: radius.control, padding: 17, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  selectedButton: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.onAccent, fontWeight: '500', fontSize: 16 },
  secondaryText: { color: colors.text },
  compactButton: { minHeight: 48, paddingVertical: space.md, paddingHorizontal: space.lg },
  compactText: { fontSize: 14 },
  section: { gap: space.md },
  contentSection: { gap: space.lg, borderTopWidth: 1, borderColor: colors.border, paddingTop: space.xl, marginTop: space.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  groupTitle: { color: colors.text, fontSize: 23, lineHeight: 30, fontWeight: '500', letterSpacing: -0.4 },
  sectionCount: { fontSize: 14, lineHeight: 22, fontWeight: '500', color: colors.text, backgroundColor: colors.accentSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, overflow: 'hidden' },
  sectionTitle: { color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: '600', letterSpacing: -0.3 },
  notice: { backgroundColor: colors.warningSoft, borderRadius: 4, padding: 14 },
  noticeText: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  loading: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
