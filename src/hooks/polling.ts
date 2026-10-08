import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

// Polls only while the screen is focused and the app is in the foreground, and
// waits for each request to settle before scheduling the next. Stack screens
// stay mounted underneath the one on top, so a plain interval keeps querying
// from every screen left open, and on a slow connection overlapping requests
// supersede each other so no response is ever applied.
export function usePolling(poll: () => Promise<unknown>, intervalMs: number, enabled = true) {
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { timer = setTimeout(tick, intervalMs); };
    const tick = () => {
      if (AppState.currentState !== 'active') return schedule();
      void poll().catch(() => undefined).finally(() => { if (active) schedule(); });
    };
    schedule();
    return () => { active = false; clearTimeout(timer); };
  }, [poll, intervalMs, enabled]));
}
