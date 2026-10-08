import 'react-native-url-polyfill/auto';
import './local-storage';

import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = url && key
  ? createClient(url, key, {
      auth: {
        storage: typeof localStorage === 'undefined' ? undefined : localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export async function scopedReportingClient(userId: string) {
  if (!supabase || !url || !key) throw new Error('Supabase is not configured.');
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== userId) throw new Error('Sign in to the account that saved this report.');
  // Capture the JWT: an account switch during upload must not change its author.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      fetch: async (input, init) => {
        const controller = new AbortController();
        const cancel = () => controller.abort();
        const timeout = setTimeout(cancel, 30000);
        init?.signal?.addEventListener('abort', cancel, { once: true });
        if (init?.signal?.aborted) cancel();
        try { return await fetch(input, { ...init, signal: controller.signal }); }
        finally { clearTimeout(timeout); init?.signal?.removeEventListener('abort', cancel); }
      },
    },
  });
}
