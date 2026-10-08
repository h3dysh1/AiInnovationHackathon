import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { useAuth } from './auth';
import { notificationCount } from '@/services/notifications';
import { readOutbox, flushIncidentOutbox, subscribeOutbox } from '@/services/incident-outbox';
import { registerIncidentBackground } from '@/services/incident-background';
import { restorePush, subscribePush } from '@/services/push';
import { router } from 'expo-router';

type State = { unread: number; queued: number; error: string | null; refresh: () => void };
const Context = createContext<State>({ unread: 0, queued: 0, error: null, refresh: () => {} });
export function OperationsProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<Omit<State, 'refresh'> & { userId?: string }>({ unread: 0, queued: 0, error: null });
  const refresh = useCallback(() => {
    if (!userId) return;
    void Promise.all([notificationCount(), readOutbox(userId)]).then(([unread, reports]) => {
      setState({ userId, unread, queued: reports.filter(q => q.status !== 'received').length, error: null });
    }).catch(cause => {
      setState(previous => ({ unread: previous.userId === userId ? previous.unread : 0, queued: previous.userId === userId ? previous.queued : 0, userId, error: cause instanceof Error ? cause.message : 'Could not refresh notifications. Open your event to check alerts.' }));
    });
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    const retry = (force = false) => {
      if (AppState.currentState !== 'active') return;
      void Network.getNetworkStateAsync().then(network => {
        if (network.isConnected !== false && network.isInternetReachable !== false) return flushIncidentOutbox(force);
      }).catch(() => { /* The outbox retains failed attempts and exposes them in the inbox. */ }).finally(refresh);
    };
    retry();
    void registerIncidentBackground().catch(() => {});
    void restorePush().catch(() => {});
    const interval = setInterval(retry, 15000);
    const app = AppState.addEventListener('change', state => { if (state === 'active') retry(true); });
    const network = Network.addNetworkStateListener(state => { if (state.isConnected) retry(true); });
    const unsubscribe = subscribeOutbox(refresh);
    const push = subscribePush(() => { refresh(); router.push('/notifications'); });
    return () => { clearInterval(interval); app.remove(); network.remove(); unsubscribe(); push(); };
  }, [userId, refresh]);
  return <Context.Provider value={state.userId === userId ? { ...state, refresh } : { unread: 0, queued: 0, error: null, refresh }}>{children}</Context.Provider>;
}
export const useOperations = () => useContext(Context);
