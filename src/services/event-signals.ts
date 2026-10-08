import type { WeatherReading } from '@/domain/external-signals';
import { setupRpc, planningClient } from './planning';
import { processSocialPosts } from '@/social/socialProcessor';
import { mockPosts } from '@/social/mockPosts';

export type SignalSnapshot = {
  settings: { weather_enabled: boolean; latitude: number; longitude: number; heat_threshold: number; gust_threshold: number; last_success_at: string | null; last_error: string | null; weather_reading: WeatherReading | null } | null;
  venue: { latitude: number; longitude: number } | null;
  signals: { id: string; source: 'weather' | 'demo_social'; title: string; detail: string; synthetic: boolean; observed_at: string }[];
};
export const eventSignals = (id: string) => setupRpc<SignalSnapshot>('event_signal_snapshot', { p_event_id: id });
export const importDemoSocial = (id: string) => setupRpc<void>('import_demo_social', { p_event_id: id, p_signals: processSocialPosts(), p_posts: mockPosts });
export async function refreshWeather(id: string) {
  const { error } = await planningClient().functions.invoke('operations-worker', { body: { eventId: id } });
  if (error) throw error;
}
