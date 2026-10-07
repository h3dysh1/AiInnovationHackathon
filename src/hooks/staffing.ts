import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { errorMessage } from '@/domain/errors';
export function useStaffing<T>(loader: () => Promise<T>) {
  const [result, setResult] = useState<{ loader: () => Promise<T>; value: T } | null>(null);
  const requestNumber = useRef(0);
  const data = result?.loader === loader ? result.value : null;
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const request = ++requestNumber.current;
    try {
      const value = await loader();
      if (request !== requestNumber.current) return;
      setResult({ loader, value });
      setError(null);
    } catch (e) {
      if (request === requestNumber.current) setError(errorMessage(e, 'Could not load.'));
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, [loader]);
  useFocusEffect(useCallback(() => {
    void refresh();
    return () => {
      requestNumber.current++;
    };
  }, [refresh]));
  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      await refresh();
      return true;
    } catch (e) {
      setError(errorMessage(e, 'Could not save. Your inputs are still here.'));
      return false;
    } finally {
      setPending(false);
    }
  };
  return { data, loading, pending, error, refresh, run };
}
