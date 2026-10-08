import type { CrowdSnapshot } from '@/domain/crowd';
import { setupRpc } from './planning';

/** Latest camera reading per location, recent history and open crowding alerts (event managers only). */
export const crowdSnapshot = (eventId: string) =>
  setupRpc<CrowdSnapshot>('crowd_snapshot', { p_event_id: eventId });
