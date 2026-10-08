import { supabase } from './supabase';
import { revokePush } from './push';
import { saveDraft } from './draft-storage';

export async function signOut() {
  // Disable this installation before losing the authenticated device-management session.
  // If offline, expiry/rebinding still protects delivery; never prevent local logout.
  await revokePush().catch(() => undefined);
  await saveDraft('ground-control:push-owner', null).catch(() => undefined);
  await supabase?.auth.signOut();
}
