import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import type { EntityReview } from '@/domain/planning';
import type { Source } from '@/domain/operating-plan';
import type { PlanningSnapshot } from '@/services/planning';
export const planStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D6E3E6',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  heading: { fontSize: 19, fontWeight: '800', color: '#123B53' },
  text: { fontSize: 15, lineHeight: 22, color: '#234759' },
  help: { fontSize: 13, lineHeight: 19, color: '#45616E' },
  badge: { fontSize: 13, fontWeight: '800', color: '#126B79' },
});
export function PlanCard(props: ViewProps) {
  return <View {...props} style={[planStyles.card, props.style]} />;
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
