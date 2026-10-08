import { createContext, useContext } from 'react';
import { AppText as Text } from '@/components/app-text';
import { colors } from '@/theme';
import { StyleSheet, View, type ViewProps } from 'react-native';
import type { EntityReview } from '@/domain/planning';
import type { Source } from '@/domain/operating-plan';
import type { PlanningSnapshot } from '@/services/planning';
export const planStyles = StyleSheet.create({
  card: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 0,
    paddingVertical: 20,
    paddingHorizontal: 0,
    gap: 12,
  },
  heading: { fontSize: 19, lineHeight: 27, letterSpacing: -0.35, fontWeight: '600', color: colors.text },
  text: { fontSize: 15, lineHeight: 22, color: colors.text },
  help: { fontSize: 13, lineHeight: 19, color: colors.secondary },
  badge: { fontSize: 13, fontWeight: '600', color: colors.accent },
});
const CardDepth = createContext(0);
export function PlanCard({ children, style, ...props }: ViewProps) {
  const depth = useContext(CardDepth);
  return <CardDepth.Provider value={depth + 1}><View {...props} style={[planStyles.card, depth > 0 && { backgroundColor: 'transparent', borderRadius: 0, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 0, paddingVertical: 16 }, style]}>{children}</View></CardDepth.Provider>;
}
export function SourceLabel(
  { source, snapshot }: { source: Source | EntityReview; snapshot: PlanningSnapshot },
) {
  const type = 'sourceType' in source ? source.sourceType : source.source_type;
  const id = 'sourceId' in source ? source.sourceId : source.source_id;
  const ref = 'reference' in source ? source.reference : source.source_reference;
  const title = type === 'document'
    ? snapshot.documents.find((d) => d.id === id)?.title
    : type === 'answer'
    ? 'Your clarification'
    : type === 'description'
    ? 'Your event description'
    : type === 'manual'
    ? 'Manually entered'
    : 'AI inference';
  return (
    <Text style={planStyles.help}>
      Source: {title ?? 'Retained source'}
      {ref ? ` · ${ref}` : ''}
      {type !== 'manual' && source.confidence !== null
        ? ` · ${Math.round(source.confidence * 100)}% extraction confidence`
        : ''}. Confidence does not confirm operational accuracy.
    </Text>
  );
}
