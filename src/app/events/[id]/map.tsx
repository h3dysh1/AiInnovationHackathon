import { AppText as Text } from '@/components/app-text';
import { colors } from '@/theme';
import { EventManagerGate } from '@/components/event-manager-gate';
import { useCallback, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, Loading, Notice, Page, Title } from '@/components/ui';
import { MapItemForm, type MapTapAction } from '@/components/map-item-form';
import { SiteMapImage, type ImageMapMarker } from '@/components/site-map-image';
import { SiteMapUpload } from '@/components/site-map-upload';
import type { Event } from '@/domain/event';
import { errorMessage } from '@/domain/errors';
import { circleContains, pinAtPoint, radiusFromEdge, sitePins, validRadius, type MapItemDraft, type MapPoint, type PinKind, type SitePin, type SiteStructure } from '@/domain/site-geometry';
import { useAuth } from '@/hooks/auth';
import { useSiteMap } from '@/hooks/site-map';
import { getEvent } from '@/services/events';
import { getMapDraft, keepMapDraft, removeMapDraft, type SavedMapDraft } from '@/services/map-drafts';
import { getSiteStructure, saveMapItem } from '@/services/site-geometry';

function EventMapWorkspace() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const siteMap = useSiteMap(id);
  const [event, setEvent] = useState<Event | null>(null);
  const [structure, setStructure] = useState<SiteStructure>({ mapPath: null, locations: [], posts: [] });
  const [savedDraft, setSavedDraft] = useState<SavedMapDraft | null>(null);
  const [addKind, setAddKind] = useState<PinKind | null>(null);
  const [tapAction, setTapAction] = useState<MapTapAction>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);
  const heldDraft = useRef<{ scope: string; value: SavedMapDraft | null } | null>(null);
  const map = siteMap.map;
  const mapPath = map?.storage_path ?? null;
  const draft = savedDraft?.item ?? null;
  const staleDraft = Boolean(savedDraft && savedDraft.path !== mapPath);
  const aligned = Boolean(map && structure.mapPath === mapPath);

  const loadContext = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    try {
      const [nextEvent, nextStructure] = await Promise.all([getEvent(id), getSiteStructure(id)]);
      if (requestId.current !== request) return;
      setEvent(nextEvent); setStructure(nextStructure); setError(null);
      try {
        const scope = `${userId}:${id}`;
        let value = heldDraft.current?.scope === scope ? heldDraft.current.value : getMapDraft(id, userId);
        if (value?.item.kind === 'post' && !value.item.locationId) {
          const locationId = nextStructure.posts.find(post => post.id === value?.item.id)?.location_id ?? null;
          value = { ...value, item: { ...value.item, locationId } };
        }
        heldDraft.current = { scope, value }; setSavedDraft(value);
      }
      catch { setDraftError('Could not restore a map draft on this device.'); }
    } catch (cause) {
      if (requestId.current === request) setError(errorMessage(cause, 'Could not load the site map items. Try again.'));
    } finally { if (requestId.current === request) setLoading(false); }
  }, [id, userId]);

  useFocusEffect(useCallback(() => {
    void loadContext();
    return () => { requestId.current++; };
  }, [loadContext]));

  function changeDraft(item: MapItemDraft, path = savedDraft?.path ?? mapPath) {
    if (!path) return;
    const next = { path, item };
    heldDraft.current = { scope: `${userId}:${id}`, value: next };
    setSavedDraft(next);
    try { keepMapDraft(id, userId, next); setDraftError(null); }
    catch { setDraftError('Could not keep this draft on the device. Keep this screen open until it saves.'); }
  }
  function cancelDraft() {
    heldDraft.current = { scope: `${userId}:${id}`, value: null };
    setSavedDraft(null); setTapAction(null); setAddKind(null); setError(null);
    try { removeMapDraft(id, userId); setDraftError(null); }
    catch { setDraftError('Could not remove the local map draft.'); }
  }
  const pins = sitePins(structure);
  const numbered = pins.map((pin, index) => ({ ...pin, label: `${pin.kind[0].toUpperCase()}${index + 1}` }));
  const visiblePins = numbered.filter(pin => !(draft && draft.id === pin.id && draft.kind === pin.kind));
  const markers: ImageMapMarker[] = [];
  visiblePins.forEach(pin => {
    if (pin.point) markers.push({ key: `${pin.kind}:${pin.id}`, point: pin.point, label: pin.label, radiusPercent: pin.radiusPercent });
    if (pin.checkIn) markers.push({ key: `${pin.id}-ci`, point: pin.checkIn.centre, label: `CI ${pin.label}`, radiusPercent: pin.checkIn.radiusPercent, checkIn: true });
  });
  if (draft && !staleDraft) {
    if (draft.point) markers.push({ key: 'draft', point: draft.point, label: draft.kind === 'post' ? 'P' : 'L', selected: true, radiusPercent: draft.radiusPercent });
    if (draft.checkIn) markers.push({ key: 'draft-ci', point: draft.checkIn.centre, label: 'CI', radiusPercent: draft.checkIn.radiusPercent, checkIn: true, selected: true });
  }

  function select(pin: SitePin) {
    if (draft || pending) return;
    const post = pin.kind === 'post' ? structure.posts.find(post => post.id === pin.id) : null;
    const item = post ?? structure.locations.find(location => location.id === pin.id);
    if (!item) return;
    changeDraft({ id: pin.id, kind: pin.kind, creating: false, name: item.name, description: item.description ?? '',
      point: pin.point, radiusPercent: pin.radiusPercent, checkIn: pin.checkIn, locationId: post?.location_id ?? null });
    setTapAction(pin.point ? null : 'move'); setAddKind(null); setError(null); setMessage(null);
  }

  function tapMap(point: MapPoint) {
    if (!map || !aligned || pending || siteMap.uploading || staleDraft) return;
    if (addKind && !draft) {
      // Preselect a single containing location; overlapping locations need
      // an explicit choice. Multiple tasks can share the same location.
      const containing = pins.filter(pin => pin.kind === 'location' && pin.point && pin.radiusPercent != null
        && circleContains({ centre: pin.point, radiusPercent: pin.radiusPercent }, point, map));
      changeDraft({ id: randomUUID(), kind: addKind, creating: true, name: '', description: '', point,
        radiusPercent: null, checkIn: null,
        locationId: addKind === 'post' ? containing.length === 1 ? containing[0].id : structure.locations.length === 1 ? structure.locations[0].id : null : null });
      setAddKind(null); setTapAction(null); setMessage(null); return;
    }
    if (draft) {
      if (tapAction === 'move') { changeDraft({ ...draft, point }); setTapAction(null); }
      else if (tapAction === 'check-centre' && draft.checkIn) { changeDraft({ ...draft, checkIn: { ...draft.checkIn, centre: point } }); setTapAction(null); }
      else if ((tapAction === 'resize' && draft.point) || (tapAction === 'check-edge' && draft.checkIn)) {
        const centre = tapAction === 'check-edge' ? draft.checkIn!.centre : draft.point!;
        const radius = radiusFromEdge(centre, point, map);
        if (!validRadius(radius)) { setError('Choose an edge between 0.5 and 50% of the shorter map edge from its centre.'); return; }
        if (tapAction === 'check-edge') changeDraft({ ...draft, checkIn: { ...draft.checkIn!, radiusPercent: radius } });
        else changeDraft({ ...draft, radiusPercent: radius });
        setTapAction(null); setError(null);
      } else setMessage('Use the controls below to move or resize this item. Save or cancel before selecting another.');
      return;
    }
    const hit = pinAtPoint(pins, point, map);
    if (hit) select(hit);
    else setMessage('Choose Add location or Add post, then tap where it belongs.');
  }

  async function save() {
    if (!map || !draft || !aligned || staleDraft || busy.current) return;
    busy.current = true; setPending(true); setError(null); setMessage(null);
    try {
      await saveMapItem(map, draft);
      // Retain the same ID and draft if this read fails. Retrying the atomic
      // write cannot create a second post after an ambiguous network reply.
      setStructure(await getSiteStructure(id));
      cancelDraft(); setMessage(`${draft.name.trim()} saved.`);
    } catch (cause) { setError(errorMessage(cause, 'Could not confirm this save. Your draft is kept; retry when connected.')); }
    finally { busy.current = false; setPending(false); }
  }

  const instruction = staleDraft ? 'This draft belongs to an older image. Reposition it before saving.'
    : addKind ? `Tap the map to add a ${addKind}.`
    : tapAction === 'move' ? 'Tap the new centre of this item.'
    : tapAction === 'resize' ? 'Tap the outer edge of the circle.'
    : tapAction === 'check-centre' ? 'Tap the centre of the post check-in area.'
    : tapAction === 'check-edge' ? 'Tap the outer edge of the check-in circle.'
    : draft ? 'Name and adjust this item below, then save.' : 'Choose an Add button, then tap the map. Tap a saved marking to edit it.';

  if (loading || siteMap.loading) return <Loading label="Opening site map…" />;
  if (!event) return <Page><Title>Map setup unavailable</Title><Notice message={error ?? 'Could not load this event.'} />
    <Button title="Try again" onPress={() => { void loadContext(); }} />
    <Button title="Back to setup" secondary onPress={() => router.dismissTo({ pathname: '/events/[id]/setup', params: { id } })} />
  </Page>;

  return <Page>
    <Title subtitle={event.name}>Site map</Title>
    {error ? <Notice tone="error" message={error} /> : null}
    {draftError ? <Notice message={draftError} /> : null}
    {message ? <Notice message={message} /> : null}
    <SiteMapUpload state={siteMap} preview={false} disabled={pending || Boolean(draft)} onUploaded={() => { setAddKind(null); void loadContext(); setMessage('Map saved. Add physical locations, then give them staffing posts.'); }} />
    {map && !aligned ? <Notice message="The image and its markings do not match. Refresh the site map before editing." /> : null}
    {map && siteMap.url && aligned && !siteMap.error ? <>
      <Text style={styles.help}>Locations are physical places. Posts are the staffed tasks at those places. One location can have several posts.</Text>
      <View style={styles.row}>{(['location', 'post'] as const).map(kind => <View key={kind} style={styles.flex}><Button title={`Add ${kind}`} secondary={addKind !== kind} disabled={pending || Boolean(draft) || siteMap.uploading || (kind === 'post' && !structure.locations.length)} onPress={() => { setAddKind(kind); setTapAction(null); setMessage(null); }} /></View>)}</View>
      <Text style={styles.help}>{instruction}</Text>
      <SiteMapImage url={siteMap.url} width={map.width} height={map.height} markers={markers} onTap={tapMap} onError={siteMap.reportPreviewError} />
      <Text style={styles.help}>L = location · P = post · Dashed CI circles = post check-in areas. Sizes are relative to this image.</Text>
      {addKind ? <Button title="Cancel adding" secondary onPress={() => setAddKind(null)} /> : null}
      {tapAction ? <Button title="Cancel map action" secondary disabled={pending} onPress={() => setTapAction(null)} /> : null}
    </> : null}
    {draft ? <>
      {staleDraft ? <><Notice message="Your draft has been retained, but the site image changed. Its old positions cannot be saved on this image." />
        <Button title="Reposition draft on this map" disabled={pending || !aligned || !map} onPress={() => { changeDraft({ ...draft, point: null, checkIn: null }, mapPath); setTapAction('move'); }} /></> : null}
      <MapItemForm draft={draft} structure={structure} saving={pending} disabled={pending || siteMap.uploading || !aligned || staleDraft || Boolean(siteMap.error)} onChange={item => { changeDraft(item); setTapAction(null); }} onTapAction={setTapAction} onSave={() => { void save(); }} onCancel={cancelDraft} />
      <Text style={styles.help}>{draftError ? 'Unsaved map changes' : 'Map draft kept on this device'}.</Text>
    </> : null}
    <Text style={styles.section}>Locations & their posts</Text>
    {structure.locations.map(location => <View key={location.id} style={styles.group}>
      {numbered.filter(pin => pin.kind === 'location' && pin.id === location.id).map(pin => <Button key={pin.id} title={`${pin.label} · ${pin.name} · ${pin.point ? pin.radiusPercent != null ? 'circle' : 'pin' : 'not placed'}`} secondary disabled={pending || Boolean(draft) || !aligned || siteMap.uploading} onPress={() => select(pin)} />)}
      {numbered.filter(pin => pin.kind === 'post' && structure.posts.find(post => post.id === pin.id)?.location_id === location.id).map(pin => <Button key={pin.id} title={`${pin.label} · ${pin.name}${pin.checkIn ? ' · check-in area' : ''}`} secondary disabled={pending || Boolean(draft) || !aligned || siteMap.uploading} onPress={() => select(pin)} />)}
      {!structure.posts.some(post => post.location_id === location.id) ? <Text style={styles.help}>No staffing posts at this location yet.</Text> : null}
    </View>)}
    {!pins.length ? <Text style={styles.help}>Upload your site map, then add the first location directly on it.</Text> : null}
    <Button title="Refresh site map" secondary disabled={pending || siteMap.uploading} onPress={() => { siteMap.refresh(); void loadContext(); }} />
    <Button title="Staffing & qualifications editor" secondary disabled={pending || siteMap.uploading || Boolean(draft)} onPress={() => router.push({ pathname: '/events/[id]/site', params: { id } })} />
    <Button title="Back to setup" secondary disabled={pending || siteMap.uploading || Boolean(draft)} onPress={() => router.dismissTo({ pathname: '/events/[id]/setup', params: { id } })} />
  </Page>;
}

const styles = StyleSheet.create({
  section: { color: colors.text, fontSize: 19, fontWeight: '600' },
  help: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flex: { flex: 1, minWidth: 90 },
  group: { gap: 8, padding: 12, borderWidth: 0, borderColor: colors.border, borderRadius: 4 },
});

export default function GuardedRoute() { const { id } = useLocalSearchParams<{ id: string }>(); return <EventManagerGate id={id}><EventMapWorkspace /></EventManagerGate>; }
