import { errorMessage } from '@/domain/errors';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getPlanningSnapshot, type PlanningSnapshot } from '@/services/planning';
export function usePlanning(id: string) {
  const [data, setData] = useState<PlanningSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const s = await getPlanningSnapshot(id);
      setData(s);
      setError(null);
      return s;
    } catch (e) {
      setError(errorMessage(e, 'Could not load the operating plan.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void getPlanningSnapshot(id).then((s) => {
      if (active) {
        setData(s);
        setError(null);
      }
    }).catch((e) => {
      if (active) setError(errorMessage(e, 'Could not load the operating plan.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]));
  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      await refresh();
      return true;
    } catch (e) {
      setError(errorMessage(e, 'Could not save. Your input is retained.'));
      return false;
    } finally {
      setPending(false);
    }
  }
  return { data, error, loading, pending, refresh, run, setError };
}
