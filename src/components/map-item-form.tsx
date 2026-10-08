import { AppText as Text } from '@/components/app-text';
import { colors } from '@/theme';
import { StyleSheet, View } from 'react-native';
import { Button, Field } from '@/components/ui';
import type { MapItemDraft, SiteStructure } from '@/domain/site-geometry';

export type MapTapAction = 'move' | 'resize' | 'check-centre' | 'check-edge' | null;

export function MapItemForm({ draft, structure, disabled, saving, onChange, onTapAction, onSave, onCancel }: {
  draft: MapItemDraft; structure: SiteStructure; disabled: boolean; saving: boolean;
  onChange: (draft: MapItemDraft) => void; onTapAction: (action: MapTapAction) => void;
  onSave: () => void; onCancel: () => void;
}) {
  function radiusChange(delta: number, checkIn = false) {
    if (checkIn && draft.checkIn) onChange({ ...draft, checkIn: { ...draft.checkIn, radiusPercent: Math.min(50, Math.max(0.5, draft.checkIn.radiusPercent + delta)) } });
    else if (draft.radiusPercent != null) onChange({ ...draft, radiusPercent: Math.min(50, Math.max(0.5, draft.radiusPercent + delta)) });
  }
  return <View style={styles.card}>
    <Text style={styles.heading}>{draft.creating ? 'New' : 'Edit'} {draft.kind}</Text>
    <Text style={styles.help}>{draft.kind === 'location' ? 'A physical place, such as Gate A. It can have multiple staffing posts.' : 'A staffed task at a location, such as ticket checking or queue management.'}</Text>
    <Field label={draft.kind === 'post' ? 'Post / task name' : 'Location name'} value={draft.name} onChangeText={name => onChange({ ...draft, name })} editable={!disabled} placeholder={draft.kind === 'post' ? 'Ticket checking' : 'Gate A'} />
    <Field label="Description (optional)" value={draft.description} onChangeText={description => onChange({ ...draft, description })} editable={!disabled} multiline />
    {draft.kind === 'post' ? <>
      <Text style={styles.label}>Location</Text>
      {draft.creating ? structure.locations.map(location => <Button key={location.id} title={location.name} secondary={draft.locationId !== location.id} disabled={disabled} onPress={() => onChange({ ...draft, locationId: location.id })} />)
        : <Text style={styles.help}>{structure.locations.find(location => location.id === draft.locationId)?.name ?? 'Choose a location'}</Text>}
      {!structure.locations.length ? <Text style={styles.help}>Add a physical location first, then add its posts.</Text> : null}
      {draft.creating ? <Text style={styles.help}>Multiple posts can share this location. New posts start with minimum coverage of 1; set staffing and qualifications in the staffing editor.</Text> : null}
    </> : null}
    <Text style={styles.label}>Show as</Text>
    <View style={styles.row}>
      <View style={styles.flex}><Button title="Pin" secondary={draft.radiusPercent != null} disabled={disabled} onPress={() => onChange({ ...draft, radiusPercent: null })} /></View>
      <View style={styles.flex}><Button title="Circle" secondary={draft.radiusPercent == null} disabled={disabled} onPress={() => onChange({ ...draft, radiusPercent: draft.radiusPercent ?? 10 })} /></View>
    </View>
    <Button title={draft.point ? 'Move on map' : 'Place on map'} secondary disabled={disabled} onPress={() => onTapAction('move')} />
    {draft.radiusPercent != null ? <>
      <Text style={styles.help}>Circle radius: {draft.radiusPercent}% of the shorter image edge.</Text>
      <View style={styles.row}>
        <View style={styles.flex}><Button title="Smaller" secondary disabled={disabled || draft.radiusPercent <= 0.5} onPress={() => radiusChange(-1)} /></View>
        <View style={styles.flex}><Button title="Larger" secondary disabled={disabled || draft.radiusPercent >= 50} onPress={() => radiusChange(1)} /></View>
      </View>
      <Button title="Set circle edge on map" secondary disabled={disabled || !draft.point} onPress={() => onTapAction('resize')} />
    </> : null}
    {draft.kind === 'post' ? <View style={styles.checkIn}>
      <Text style={styles.heading}>Post check-in area</Text>
      <Text style={styles.help}>A separate dashed circle marks where people should check in for this post. Volunteers check in from their assignment. Map positions help locate posts; they do not confirm attendance.</Text>
      {draft.checkIn ? <>
        <Text style={styles.help}>Check-in radius: {draft.checkIn.radiusPercent}% of the shorter image edge. CI labels identify check-in areas.</Text>
        <View style={styles.row}>
          <View style={styles.flex}><Button title="Smaller" secondary disabled={disabled || draft.checkIn.radiusPercent <= 0.5} onPress={() => radiusChange(-1, true)} /></View>
          <View style={styles.flex}><Button title="Larger" secondary disabled={disabled || draft.checkIn.radiusPercent >= 50} onPress={() => radiusChange(1, true)} /></View>
        </View>
        <Button title="Move check-in centre on map" secondary disabled={disabled} onPress={() => onTapAction('check-centre')} />
        <Button title="Set check-in edge on map" secondary disabled={disabled} onPress={() => onTapAction('check-edge')} />
        <Button title="Remove check-in area" secondary disabled={disabled} onPress={() => onChange({ ...draft, checkIn: null })} />
      </> : <Button title="Add check-in circle" secondary disabled={disabled || !draft.point} onPress={() => { if (draft.point) onChange({ ...draft, checkIn: { centre: draft.point, radiusPercent: 5 } }); }} />}
    </View> : null}
    {draft.point || draft.creating ? <Button title={saving ? 'Saving…' : draft.creating ? `Create ${draft.kind}` : 'Save changes'} disabled={disabled || !draft.point || (draft.kind === 'post' && !draft.locationId)} onPress={onSave} /> : null}
    {!draft.creating && draft.point ? <Button title="Clear map markings for this item" secondary disabled={disabled} onPress={() => onChange({ ...draft, point: null, radiusPercent: null, checkIn: null })} /> : null}
    {!draft.creating && !draft.point ? <Button title="Save without map markings" disabled={disabled} onPress={onSave} /> : null}
    <Button title="Cancel changes" secondary disabled={saving} onPress={onCancel} />
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 4, padding: 16, gap: 12, borderWidth: 0, borderColor: colors.border },
  heading: { color: colors.text, fontSize: 19, fontWeight: '600' },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  help: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', gap: 8 }, flex: { flex: 1 },
  checkIn: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 12 },
});
