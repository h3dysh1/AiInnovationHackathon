import { validateNamedDraft, type SiteMap } from '@/domain/site';
import { validMapCircle, validMapPoint, validMapScale, validRadius, validVenuePoint, type MapItemDraft, type MapPoint, type MapScale, type PinKind, type SiteStructure, type VenuePoint, type VenuePosition } from '@/domain/site-geometry';
import { supabase } from '@/services/supabase';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function getVenuePosition(eventId: string): Promise<VenuePosition | null> {
  const { data, error } = await client().from('event_site_settings').select('*').eq('event_id', eventId).maybeSingle();
  if (error) throw error;
  return data as VenuePosition | null;
}

export async function saveVenuePosition(eventId: string, point: VenuePoint): Promise<VenuePosition> {
  if (!validVenuePoint(point)) throw new Error('Choose a valid latitude and longitude.');
  const { data, error } = await client().from('event_site_settings').upsert({ event_id: eventId, ...point, updated_at: new Date().toISOString() }, { onConflict: 'event_id' }).select('*').single();
  if (error) throw error;
  return data as VenuePosition;
}

export async function getSiteStructure(eventId: string): Promise<SiteStructure> {
  const { data, error } = await client().rpc('get_site_structure', { p_event_id: eventId });
  if (error) throw error;
  return data as SiteStructure;
}

export async function saveMapItem(map: SiteMap, draft: MapItemDraft): Promise<void> {
  const invalid = validateNamedDraft(draft);
  if (invalid) throw new Error(invalid);
  if (draft.point && !validMapPoint(draft.point)) throw new Error('Choose a point inside the site map.');
  if (draft.radiusPercent != null && (!draft.point || !validRadius(draft.radiusPercent))) throw new Error('Circle size must be between 0.5 and 50% of the shorter map edge.');
  if (draft.checkIn && (draft.kind !== 'post' || !draft.point || !validMapCircle(draft.checkIn))) throw new Error('Place the post and choose a valid check-in circle.');
  if (draft.creating && !draft.point) throw new Error('Tap the map to place the new item.');
  if (draft.kind === 'post' && !draft.locationId) throw new Error('Choose the location where this post belongs.');
  const { error } = await client().rpc('save_location_post', {
    p_event_id: map.event_id, p_expected_path: map.storage_path,
    p_entity_id: draft.id, p_kind: draft.kind, p_creating: draft.creating,
    p_name: draft.name.trim(), p_description: draft.description.trim(),
    p_x: draft.point?.x ?? null, p_y: draft.point?.y ?? null,
    p_radius: draft.radiusPercent,
    p_location_id: draft.locationId,
    p_check_x: draft.checkIn?.centre.x ?? null, p_check_y: draft.checkIn?.centre.y ?? null,
    p_check_radius: draft.checkIn?.radiusPercent ?? null,
  });
  if (error) throw error;
}

export async function saveSitePin(map: SiteMap, kind: PinKind, entityId: string, point: MapPoint | null): Promise<void> {
  if (point && !validMapPoint(point)) throw new Error('Choose a point inside the site map.');
  const { error } = await client().rpc('set_site_pin', {
    p_event_id: map.event_id, p_kind: kind, p_entity_id: entityId,
    p_expected_path: map.storage_path, p_x: point?.x ?? null, p_y: point?.y ?? null,
  });
  if (error) throw error;
}

export async function saveSiteMapScale(map: SiteMap, scale: MapScale): Promise<SiteMap> {
  if (!validMapScale(scale, map)) throw new Error('Choose two different points and enter a distance between 0 and 1,000,000 metres.');
  const { data, error } = await client().from('event_maps').update({
    scale_start_x: scale.start.x, scale_start_y: scale.start.y,
    scale_end_x: scale.end.x, scale_end_y: scale.end.y,
    scale_distance_metres: scale.distanceMetres, updated_at: new Date().toISOString(),
  }).eq('event_id', map.event_id).eq('storage_path', map.storage_path).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The site map changed. Reopen it before setting its scale.');
  return data as SiteMap;
}
