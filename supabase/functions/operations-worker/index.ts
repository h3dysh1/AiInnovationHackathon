/// <reference path="../setup-ai/runtime.d.ts" />
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { parseWeather } from '../../../src/domain/external-signals.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
const uuid = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
type Notification = { id: string; event_id: string; title: string; body: string; urgent: boolean };
type Delivery = { id: string; attempt: number; token: string; notification: Notification };
type Ticket = { status: 'ok' | 'error'; id?: string; details?: { error?: string } };
type Receipt = { id: string; ticket_id: string; updated_at: string };
type WeatherJob = { event_id: string; attempt: number; latitude: number; longitude: number };

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405, headers });
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return Response.json({ error: 'Operations worker unavailable.' }, { status: 503, headers });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let eventId: string | null = null;
  try {
    const ticket = request.headers.get('x-operations-wakeup');
    if (ticket) {
      if (!uuid.test(ticket)) throw new Error('Unauthorized');
      const claim = await service.rpc('consume_operations_wakeup', { p_id: ticket });
      if (claim.error || claim.data !== true) throw new Error('Unauthorized');
    } else {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) throw new Error('Unauthorized');
      const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data, error } = await client.auth.getUser(auth.slice(7));
      if (error || !data.user) throw new Error('Unauthorized');
      const body = await request.json();
      if (typeof body.eventId !== 'string' || !uuid.test(body.eventId)) throw new Error('Unauthorized');
      const access = await client.rpc('event_signal_snapshot', { p_event_id: body.eventId });
      if (access.error) throw new Error('Unauthorized');
      eventId = body.eventId;
    }
  } catch { return Response.json({ error: 'Operations request unavailable to this account.' }, { status: 403, headers }); }

  const postExpo = async (path: string, body: unknown) => {
    const accessToken = Deno.env.get('EXPO_PUSH_ACCESS_TOKEN');
    return fetch(`https://exp.host/--/api/v2/push/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
  };
  EdgeRuntime.waitUntil((async () => {
    // Recovery and attendance do not depend on any AI provider.
    await service.rpc('expire_interrupted_jobs');
    await service.rpc('process_live_attendance');
    if (!eventId) {
      const { data } = await service.rpc('claim_push_deliveries');
      const jobs = (data ?? []) as Delivery[];
      if (jobs.length) {
        try {
          const response = await postExpo('send', jobs.map(job => ({
            to: job.token, title: job.notification.title, body: job.notification.body,
            sound: job.notification.urgent ? 'default' : undefined, channelId: 'operations',
            priority: job.notification.urgent ? 'high' : 'normal', ttl: 3600,
            data: { notificationId: job.notification.id },
          })));
          const result = await response.json();
          if (!response.ok || !Array.isArray(result.data) || result.data.length !== jobs.length) {
            throw new Error(`Push service unavailable (${response.status}).`);
          }
          for (const [index, job] of jobs.entries()) {
            const ticket = result.data[index] as Ticket;
            const error = ticket.status === 'error' ? ticket.details?.error ?? 'PushRejected' : null;
            await service.rpc('finish_push_delivery', {
              p_id: job.id, p_attempt: job.attempt, p_ticket: ticket.status === 'ok' && typeof ticket.id === 'string' ? ticket.id : null,
              p_error: error ?? (ticket.status !== 'ok' || !ticket.id ? 'Invalid push ticket' : null),
              p_permanent: error !== null && !['MessageRateExceeded'].includes(error),
            });
          }
        } catch (cause) {
          for (const job of jobs) await service.rpc('finish_push_delivery', { p_id: job.id, p_attempt: job.attempt, p_ticket: null, p_error: cause instanceof Error ? cause.message : 'Push service unavailable.', p_permanent: false });
        }
      }
      const { data: pending } = await service.rpc('pending_push_receipts');
      const receipts = (pending ?? []) as Receipt[];
      if (receipts.length) {
        try {
          const response = await postExpo('getReceipts', { ids: receipts.map(r => r.ticket_id) });
          if (!response.ok) throw new Error('Receipt service unavailable');
          const result = await response.json();
          for (const receipt of receipts) {
            const outcome = result.data?.[receipt.ticket_id] as Ticket | undefined;
            if (outcome?.status === 'ok' || outcome?.status === 'error') await service.rpc('finish_push_receipt', { p_id: receipt.id, p_error: outcome.status === 'ok' ? null : outcome.details?.error ?? 'PushRejected' });
            else if (Date.now() - Date.parse(receipt.updated_at) > 86400000) await service.rpc('finish_push_receipt', { p_id: receipt.id, p_error: 'ReceiptUnavailable' });
          }
        } catch { /* Keep ticketed state; cron retries receipt lookup. */ }
      }
    }
    const { data: weather } = await service.rpc('claim_weather_updates', { p_event_id: eventId });
    await Promise.allSettled(((weather ?? []) as WeatherJob[]).map(async job => {
      let reading = null, failure = null;
      try {
        const query = new URLSearchParams({ latitude: String(job.latitude), longitude: String(job.longitude), current: 'temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,precipitation,weather_code', timeformat: 'unixtime', timezone: 'GMT', wind_speed_unit: 'kmh', temperature_unit: 'celsius', precipitation_unit: 'mm' });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Weather service unavailable (${response.status}).`);
        reading = parseWeather(await response.json());
      } catch (cause) { failure = cause instanceof Error ? cause.message : 'Weather unavailable. Last successful reading retained.'; }
      await service.rpc('finish_weather_update', { p_event_id: job.event_id, p_attempt: job.attempt, p_reading: reading, p_error: failure });
    }));
  })().catch(() => { console.error('Operations worker interrupted; durable jobs retained.'); }));
  return Response.json({ accepted: true }, { status: 202, headers });
});
