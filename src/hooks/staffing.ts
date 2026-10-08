import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { errorMessage } from '@/domain/errors';
const defaultMessages = { load: 'Could not load.', save: 'Could not save. Your inputs are still here.' };
export function useStaffing<T>(loader: () => Promise<T>, messages = defaultMessages) {
  const [result, setResult] = useState<{ loader: () => Promise<T>; value: T } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestNumber = useRef(0);
  const running = useRef(false);
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
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      if (request === requestNumber.current) setError(errorMessage(e, messages.load));
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, [loader, messages]);
  useFocusEffect(useCallback(() => {
    void refresh();
    return () => {
      requestNumber.current++;
    };
  }, [refresh]));
  const run = async (action: () => Promise<unknown>) => {
    // `pending` only disables buttons after the next render; a second tap in
    // the same frame must not submit the action twice.
    if (running.current) return false;
    running.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
      await refresh();
      return true;
    } catch (e) {
      setError(errorMessage(e, messages.save));
      return false;
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  return { data, loading, pending, error, updatedAt, refresh, run, setError };
}
