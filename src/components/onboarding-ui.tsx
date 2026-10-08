import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInRight, useReducedMotion } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { AppText as Text } from './app-text';
import { Page } from './ui';
import { colors } from '@/theme';

export function StepTransition({ step, children }: PropsWithChildren<{ step: string | number }>) {
  const reduced = useReducedMotion();
  return <Animated.View key={step} collapsable={false} entering={reduced ? FadeIn.duration(100) : FadeInRight.duration(240)} style={{ gap: 24 }}>{children}</Animated.View>;
}
export function OnboardingPage({ step, total, title, subtitle, onBack, children, footer }: PropsWithChildren<{ step: number; total: number; title: string; subtitle?: string; onBack: () => void; footer?: ReactNode }>) {
  return <Page>
    <View style={styles.top}>
      <Pressable accessibilityRole='button' accessibilityLabel='Back' onPress={onBack} style={styles.back}><SymbolView name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={colors.text} size={22} /></Pressable>
      <Text style={styles.brand}>Ground Control</Text><Text style={styles.count}>{step + 1} / {total}</Text>
    </View>
    <View accessibilityRole='progressbar' accessibilityLabel='Onboarding progress' accessibilityValue={{ min: 0, max: total, now: step + 1 }} style={styles.track}><View style={[styles.progress, { width: `${((step + 1) / total) * 100}%` }]} /></View>
    <StepTransition step={step}>
      <View style={styles.heading}><Text accessibilityRole='header' style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>
      {children}
    </StepTransition>
    {footer}
  </Page>;
}
export function Choice({ title, description, selected, onPress, multiple = false }: { multiple?: boolean; title: string; description?: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected }} accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.choice, pressed && { opacity: 0.6 }]}>
    <View style={{ flex: 1, gap: 4 }}><Text style={styles.choiceTitle}>{title}</Text>{description ? <Text style={styles.count}>{description}</Text> : null}</View>
    <SymbolView accessible={false} name={{ ios: selected ? 'checkmark.circle.fill' : 'circle', android: selected ? 'check_circle' : 'radio_button_unchecked', web: selected ? 'check_circle' : 'radio_button_unchecked' }} size={24} tintColor={selected ? colors.text : colors.secondary} />
  </Pressable>;
}
const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
  brand: { flex: 1, fontSize: 15, fontWeight: '500' }, count: { fontSize: 13, lineHeight: 20, color: colors.secondary },
  track: { height: 2, backgroundColor: colors.border }, progress: { height: 2, backgroundColor: colors.text },
  heading: { gap: 12, paddingTop: 24 }, title: { fontSize: 38, lineHeight: 45, letterSpacing: -1, fontWeight: '400' },
  subtitle: { color: colors.secondary, fontSize: 16, lineHeight: 25 },
  choice: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 18, gap: 20, borderBottomWidth: 0.5, borderColor: colors.border },
  choiceTitle: { fontSize: 17, fontWeight: '500' },
});
