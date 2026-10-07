import type { Post, SiteLocation, SiteMap } from '@/domain/site';

export type MapPoint = { x: number; y: number };
export type VenuePoint = { latitude: number; longitude: number };
export type VenuePosition = VenuePoint & { event_id: string; updated_at: string };
export type SiteStructure = { mapPath: string | null; locations: SiteLocation[]; posts: Post[] };
export type PinKind = 'location' | 'post';
export type SitePin = { id: string; kind: PinKind; name: string; context: string; point: MapPoint | null; inherited: boolean; radiusPercent: number | null; checkIn: MapCircle | null };
// Radius is a percentage of the shorter image edge, so circles stay circular
// across portrait/landscape images and screen sizes. These are not GPS fences.
export type MapCircle = { centre: MapPoint; radiusPercent: number };
export type MapItemDraft = {
  id: string; kind: PinKind; creating: boolean; name: string; description: string;
  point: MapPoint | null; radiusPercent: number | null; checkIn: MapCircle | null;
  locationId: string | null;
};
export type MapScale = { start: MapPoint; end: MapPoint; distanceMetres: number };

export function validMapPoint(point: MapPoint): boolean {
  return [point.x, point.y].every(value => Number.isFinite(value) && value >= 0 && value <= 100);
}

export function validVenuePoint(point: VenuePoint): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}

export function pointFromCoordinates(x: number | null, y: number | null): MapPoint | null {
  return x != null && y != null && validMapPoint({ x, y }) ? { x, y } : null;
}

export function pointFromTap(tapX: number, tapY: number, width: number, height: number): MapPoint | null {
  if (![tapX, tapY, width, height].every(Number.isFinite) || width <= 0 || height <= 0
    || tapX < 0 || tapY < 0 || tapX > width || tapY > height) return null;
  return { x: Math.round(tapX / width * 10000) / 100, y: Math.round(tapY / height * 10000) / 100 };
}

function pixelDistance(a: MapPoint, b: MapPoint, image: { width: number; height: number }): number {
  return Math.hypot((b.x - a.x) / 100 * image.width, (b.y - a.y) / 100 * image.height);
}

export function validRadius(radius: number): boolean {
  return Number.isFinite(radius) && radius >= 0.5 && radius <= 50;
}

export function validMapCircle(circle: MapCircle): boolean {
  return validMapPoint(circle.centre) && validRadius(circle.radiusPercent);
}

export function radiusFromEdge(centre: MapPoint, edge: MapPoint, image: { width: number; height: number }): number {
  return Math.round(pixelDistance(centre, edge, image) / Math.min(image.width, image.height) * 10000) / 100;
}

export function circleDiameter(radiusPercent: number, image: { width: number; height: number }): number {
  return Math.min(image.width, image.height) * radiusPercent / 50;
}

export function circleContains(circle: MapCircle, point: MapPoint, image: { width: number; height: number }): boolean {
  return validMapCircle(circle) && validMapPoint(point)
    && pixelDistance(circle.centre, point, image) <= circleDiameter(circle.radiusPercent, image) / 2;
}

// Prefer points close to the tap, then the smallest enclosing area. A post pin
// inside a location circle remains selectable. Callers also provide a list fallback.
export function pinAtPoint(pins: SitePin[], point: MapPoint, image: { width: number; height: number }): SitePin | null {
  const placed = pins.filter(pin => pin.point);
  const nearby = placed.filter(pin => radiusFromEdge(pin.point!, point, image) <= 5)
    .sort((a, b) => radiusFromEdge(a.point!, point, image) - radiusFromEdge(b.point!, point, image) || Number(b.kind === 'post') - Number(a.kind === 'post'));
  if (nearby.length) return nearby[0];
  const checkIn = placed.find(pin => pin.checkIn && circleContains(pin.checkIn, point, image));
  if (checkIn) return checkIn;
  return placed.filter(pin => pin.radiusPercent != null && circleContains({ centre: pin.point!, radiusPercent: pin.radiusPercent }, point, image))
    .sort((a, b) => a.radiusPercent! - b.radiusPercent!)[0] ?? null;
}

export function validMapScale(scale: MapScale, image: { width: number; height: number }): boolean {
  return validMapPoint(scale.start) && validMapPoint(scale.end)
    && Number.isFinite(image.width) && Number.isFinite(image.height) && image.width > 0 && image.height > 0
    && Number.isFinite(scale.distanceMetres) && scale.distanceMetres > 0 && scale.distanceMetres <= 1000000
    && pixelDistance(scale.start, scale.end, image) >= 1;
}

export function scaleFromMap(map: SiteMap): MapScale | null {
  const start = pointFromCoordinates(map.scale_start_x, map.scale_start_y);
  const end = pointFromCoordinates(map.scale_end_x, map.scale_end_y);
  if (!start || !end || map.scale_distance_metres == null) return null;
  const scale = { start, end, distanceMetres: map.scale_distance_metres };
  return validMapScale(scale, map) ? scale : null;
}

// Percentage coordinates alone have no physical distance. A measured scale
// converts image pixels to metres, preserving the image's aspect ratio.
export function siteDistanceMetres(a: MapPoint, b: MapPoint, map: SiteMap): number | null {
  const scale = scaleFromMap(map);
  if (!scale || !validMapPoint(a) || !validMapPoint(b)) return null;
  return pixelDistance(a, b, map) / pixelDistance(scale.start, scale.end, map) * scale.distanceMetres;
}

export function sitePins(structure: SiteStructure): SitePin[] {
  const locations = new Map(structure.locations.map(location => [location.id, location]));
  return [
    ...structure.locations.map(location => ({ id: location.id, kind: 'location' as const, name: location.name, context: 'Location', point: pointFromCoordinates(location.map_x, location.map_y), inherited: false, radiusPercent: location.map_radius_percent ?? null, checkIn: null })),
    ...structure.posts.map(post => {
      const location = locations.get(post.location_id);
      const ownPoint = pointFromCoordinates(post.map_x, post.map_y);
      const checkInCentre = pointFromCoordinates(post.check_in_x, post.check_in_y);
      return { id: post.id, kind: 'post' as const, name: post.name, context: location?.name ?? 'Post',
        point: ownPoint ?? (location ? pointFromCoordinates(location.map_x, location.map_y) : null), inherited: !ownPoint && Boolean(location && pointFromCoordinates(location.map_x, location.map_y)),
        radiusPercent: post.map_radius_percent ?? null,
        checkIn: checkInCentre && post.check_in_radius_percent != null ? { centre: checkInCentre, radiusPercent: post.check_in_radius_percent } : null };
    }),
  ];
}
