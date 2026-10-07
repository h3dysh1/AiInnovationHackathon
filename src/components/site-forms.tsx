import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Field } from '@/components/ui';
import type { LocationDraft, PostCriticality, PostDraft, RequirementDraft } from '@/domain/site';

type CommonProps<T> = { value: T; onChange: (next: T) => void; onSave: () => void; onCancel: () => void; pending: boolean; saveLabel: string };

export function LocationForm({ value, onChange, onSave, onCancel, pending, saveLabel }: CommonProps<LocationDraft>) {
  return <View style={styles.form}>
    <Field label="Location name" value={value.name} onChangeText={name => onChange({ ...value, name })} placeholder="Water Station B" />
    <Field label="Description (optional)" value={value.description} onChangeText={description => onChange({ ...value, description })} multiline />
    <Text style={styles.help}>After saving, place this location using the map workspace. Posts use the location position until given their own pin.</Text>
    <Button title={pending ? 'Saving…' : saveLabel} disabled={pending} onPress={onSave} />
    <Button title="Cancel" secondary disabled={pending} onPress={onCancel} />
  </View>;
}

export function PostForm({ value, onChange, onSave, onCancel, pending, saveLabel }: CommonProps<PostDraft>) {
  return <View style={styles.form}>
    <Field label="Post name" value={value.name} onChangeText={name => onChange({ ...value, name })} placeholder="First Aid Support" />
    <Field label="Description (optional)" value={value.description} onChangeText={description => onChange({ ...value, description })} multiline />
    <Field label="Minimum volunteers" value={value.minimumCoverage} onChangeText={minimumCoverage => onChange({ ...value, minimumCoverage })} keyboardType="number-pad" />
    <Field label="Supervisor" value={value.supervisor} onChangeText={supervisor => onChange({ ...value, supervisor })} />
    <Field label="Escalation contact / channel" value={value.escalation} onChangeText={escalation => onChange({ ...value, escalation })} />
    <Text style={styles.label}>Criticality</Text>
    <View style={styles.row}>
      {(['normal', 'important', 'critical'] as PostCriticality[]).map(option => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: value.criticality === option }} onPress={() => onChange({ ...value, criticality: option })} style={[styles.choice, value.criticality === option && styles.selected]}><Text style={styles.choiceText}>{option}</Text></Pressable>)}
    </View>
    <Field label="Instructions (optional)" value={value.instructions} onChangeText={instructions => onChange({ ...value, instructions })} multiline />
    <Button title={pending ? 'Saving…' : saveLabel} disabled={pending} onPress={onSave} />
    <Button title="Cancel" secondary disabled={pending} onPress={onCancel} />
  </View>;
}

export function RequirementForm({ value, onChange, onSave, onCancel, pending, saveLabel }: CommonProps<RequirementDraft>) {
  return <View style={styles.form}>
    <Text style={styles.help}>Use a certification, experience level, or both. The count must fit within the post minimum.</Text>
    <Field label="Certification (optional)" value={value.certificationType} onChangeText={certificationType => onChange({ ...value, certificationType })} placeholder="First Aid" />
    <Field label="Experience (optional)" value={value.experienceRequirement} onChangeText={experienceRequirement => onChange({ ...value, experienceRequirement })} placeholder="Experienced volunteer" />
    <Field label="Minimum qualified volunteers" value={value.minimumCount} onChangeText={minimumCount => onChange({ ...value, minimumCount })} keyboardType="number-pad" />
    <Button title={pending ? 'Saving…' : saveLabel} disabled={pending} onPress={onSave} />
    <Button title="Cancel" secondary disabled={pending} onPress={onCancel} />
  </View>;
}

const styles = StyleSheet.create({
  form: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 14, borderWidth: 1, borderColor: '#D6E3E6' },
  help: { color: '#45616E', fontSize: 14, lineHeight: 20 },
  label: { color: '#234759', fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  choice: { flex: 1, borderWidth: 1, borderColor: '#B9CDD3', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  selected: { borderColor: '#126B79', borderWidth: 2, backgroundColor: '#E4EFF1' },
  choiceText: { color: '#123B53', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: '#D6E3E6' },
  cardTitle: { color: '#123B53', fontSize: 17, fontWeight: '800' },
});

export function SiteCard({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    <Text style={styles.help}>{subtitle}</Text>
  </Pressable>;
}
