import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { usePathname } from 'expo-router';
import { useAuth } from './auth';
import { joinedEvents } from '@/services/planning';
import type { JoinedEvent } from '@/domain/planning';
import { errorMessage } from '@/domain/errors';

export type NavigationMode = 'coordinator' | 'volunteer';
const isManaged = (event: JoinedEvent) => event.event_role === 'coordinator' || event.event_role === 'safety_lead';
type NavigationState = { mode: NavigationMode; events: JoinedEvent[]; selected: JoinedEvent | null; loading: boolean; error: string | null; choose: (event: JoinedEvent) => void; setMode: (mode: NavigationMode) => void; refresh: () => void };
const Context = createContext<NavigationState | null>(null);
export function NavigationProvider({ children }: PropsWithChildren) {
  const { session, role } = useAuth();
  const userId = session?.user.id;
  const path = usePathname();
  const routeEventId = path.match(/^\/events\/([^/]+)/)?.[1];
  const [result, setResult] = useState<{ userId: string; events: JoinedEvent[] } | null>(null);
  const [selection, setSelection] = useState<{ userId: string; coordinator?: string; volunteer?: string } | null>(null);
  const [preference, setPreference] = useState<{ userId: string; mode: NavigationMode } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<{ userId: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const all = result && result.userId === userId ? result.events : [];
  const routeEvent = all.find(e => e.id === routeEventId);
  const mode: NavigationMode = ['/volunteer', '/my-events', '/my-shifts'].includes(path) ? 'volunteer' : ['/coordinator', '/crew', '/alerts', '/more'].includes(path) ? 'coordinator' : routeEvent ? isManaged(routeEvent) ? 'coordinator' : 'volunteer' : preference && preference.userId === userId ? preference.mode : role === 'coordinator' ? 'coordinator' : 'volunteer';
  const events = all.filter(e => mode === 'coordinator' ? isManaged(e) : e.event_role === 'volunteer');
  const selected = events.find(e => e.id === routeEventId) ?? events.find(e => e.id === (selection && selection.userId === userId ? selection[mode] : undefined)) ?? events[0] ?? null;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void joinedEvents().then(items => {
      if (!active) return;
      const events = [...items].sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || Number(a.status === 'completed') - Number(b.status === 'completed') || a.start_date.localeCompare(b.start_date));
      setResult({ userId, events }); setFailure(null);
      const event = events.find(e => e.id === routeEventId);
      if (event) {
        const mode = isManaged(event) ? 'coordinator' : 'volunteer';
        setSelection(previous => ({ ...(previous?.userId === userId ? previous : {}), userId, [mode]: event.id }));
        setPreference({ userId, mode });
      }
    }).catch(cause => { if (active) setFailure({ userId, message: errorMessage(cause, 'Could not load your event navigation. Retry.') }); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, routeEventId, attempt]);
  const choose = (event: JoinedEvent) => {
    if (!userId || !all.some(e => e.id === event.id)) return;
    const mode = isManaged(event) ? 'coordinator' : 'volunteer';
    setSelection(previous => ({ ...(previous?.userId === userId ? previous : {}), userId, [mode]: event.id }));
    setPreference({ userId, mode });
  };
  return <Context.Provider value={{ mode, events, selected, loading: loading || Boolean(userId && result?.userId !== userId && failure?.userId !== userId), error: failure && failure.userId === userId ? failure.message : null, choose, setMode: mode => { if (userId) setPreference({ userId, mode }); }, refresh: () => setAttempt(n => n + 1) }}>{children}</Context.Provider>;
}
export function useNavigationContext() { const value = useContext(Context); if (!value) throw new Error('NavigationProvider is missing.'); return value; }
