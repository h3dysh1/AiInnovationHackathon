import './local-storage';
import { validMapCircle, validMapPoint, validRadius, type MapItemDraft } from '@/domain/site-geometry';

export type SavedMapDraft = { path: string; item: MapItemDraft };
function key(eventId: string, userId: string) { return `ground-control:map-draft:${userId}:${eventId}`; }

export function getMapDraft(eventId: string, userId: string): SavedMapDraft | null {
  const raw = localStorage.getItem(key(eventId, userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as { path?: string; item?: Omit<MapItemDraft, 'kind'> & { kind: string } };
  const d = value.item;
  if (typeof value.path !== 'string' || !d || typeof d.id !== 'string' || !['zone', 'location', 'post'].includes(d.kind)
    || typeof d.creating !== 'boolean' || typeof d.name !== 'string' || typeof d.description !== 'string'
    || !(d.locationId === null || typeof d.locationId === 'string')
    || !(d.point === null || d.point && validMapPoint(d.point))
    || !(d.radiusPercent === null || validRadius(d.radiusPercent))
    || !(d.checkIn === null || d.checkIn?.centre && validMapCircle(d.checkIn))) throw new Error('Invalid saved map draft.');
  // Preserve drafts from the older three-level editor. A drawn area is now a
  // location; posts still need an explicit location choice before saving.
  return { path: value.path, item: {
    id: d.id, kind: d.kind === 'post' ? 'post' : 'location', creating: d.kind === 'zone' ? true : d.creating,
    name: d.name, description: d.description, point: d.point, radiusPercent: d.radiusPercent,
    checkIn: d.checkIn, locationId: d.locationId,
  } };
}

export function keepMapDraft(eventId: string, userId: string, value: SavedMapDraft) {
  localStorage.setItem(key(eventId, userId), JSON.stringify(value));
}
export function removeMapDraft(eventId: string, userId: string) { localStorage.removeItem(key(eventId, userId)); }
