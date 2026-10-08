import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import type { AccountRole, UserProfile } from '@/domain/profile';
import { getAccountRole, getUserProfile } from '@/services/profile';
import { supabase } from '@/services/supabase';

type AuthState = {
  session: Session | null;
  role: AccountRole | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  needsProfileSetup: boolean;
  reload: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setError(null);
    if (!nextSession) {
      setRole(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nextRole, nextProfile] = await Promise.all([
        getAccountRole(nextSession.user.id),
        getUserProfile(nextSession.user.id),
      ]);
      setRole(nextRole);
      setProfile(nextProfile);
    } catch (cause) {
      setRole(null);
      setProfile(null);
      setError(cause instanceof Error ? cause.message : 'Could not load account details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => { void load(nextSession); }, 0);
    });
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
      } else {
        void load(data.session);
      }
    }).catch(cause => {
      setError(cause instanceof Error ? cause.message : 'Could not restore your session.');
      setLoading(false);
    });
    const appSubscription = Platform.OS === 'web' ? null : AppState.addEventListener('change', state => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
    return () => { subscription.subscription.unsubscribe(); appSubscription?.remove(); };
  }, [load]);

  const reload = useCallback(async () => {
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      await load(data.session);
    }
  }, [load]);

  // Existing accounts retain access; new registrations finish their profile first.
  // This is a UX gate, never a permission or qualification decision.
  const needsProfileSetup = role === 'volunteer' && session?.user.user_metadata.profile_onboarding_required === true && session.user.user_metadata.profile_onboarding_complete !== true;
  const value = useMemo(() => ({ session, role, profile, loading, error, reload, needsProfileSetup }), [session, role, profile, loading, error, reload, needsProfileSetup]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
