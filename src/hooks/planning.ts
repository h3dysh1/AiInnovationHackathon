import { useCallback } from 'react';
import { getPlanningSnapshot } from '@/services/planning';
import { useStaffing } from './staffing';

const messages = { load: 'Could not load the operating plan.', save: 'Could not save. Your input is retained.' };
export function usePlanning(id: string) {
  return useStaffing(useCallback(() => getPlanningSnapshot(id), [id]), messages);
}
