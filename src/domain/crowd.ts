export type CrowdTrend = 'rising' | 'steady' | 'falling';

export type CrowdReading = {
  id: number;
  location_id: string;
  camera_id: string;
  captured_at: string;
  people: number;
  area_m2: number;
  density: number;
  trend: CrowdTrend;
  counterflow: number | null;
  confidence: number | null;
  created_at: string;
};

export type CrowdLocation = {
  id: string;
  name: string;
  map_x: number | null;
  map_y: number | null;
  map_radius_percent: number | null;
  latest: CrowdReading | null;
  recent: { density: number; captured_at: string }[];
};

export type CrowdAlert = {
  id: string;
  title: string;
  explanation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  location_id: string | null;
  created_at: string;
  updated_at: string | null;
};

export type CrowdThresholds = { caution: number; high: number; critical: number };

export type CrowdSnapshot = {
  thresholds: CrowdThresholds;
  locations: CrowdLocation[];
  alerts: CrowdAlert[];
};

/** none = no camera covers it; stale = the camera has gone quiet, so the number may be out of date. */
export type CrowdLevel = 'clear' | 'caution' | 'high' | 'critical' | 'stale' | 'none';

export const STALE_AFTER_MS = 2 * 60 * 1000;

export function densityLevel(density: number, t: CrowdThresholds): Exclude<CrowdLevel, 'stale' | 'none'> {
  if (density >= t.critical) return 'critical';
  if (density >= t.high) return 'high';
  if (density >= t.caution) return 'caution';
  return 'clear';
}

export function crowdLevel(location: CrowdLocation, t: CrowdThresholds, now = Date.now()): CrowdLevel {
  if (!location.latest) return 'none';
  if (now - Date.parse(location.latest.captured_at) > STALE_AFTER_MS) return 'stale';
  return densityLevel(location.latest.density, t);
}

export const crowdLevelLabel: Record<CrowdLevel, string> = {
  clear: 'Clear',
  caution: 'Caution',
  high: 'High',
  critical: 'Critical',
  stale: 'No recent reading',
  none: 'No camera',
};

export function secondsAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}
