import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createSetupProvider } from '../_shared/ai-provider.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

function base64(bytes: Uint8Array): string {
  let raw = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(raw);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST required' }, { status: 405, headers });
  }
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return Response.json({ error: 'Sign in first.' }, { status: 401, headers });
  }
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const client = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: user, error: authError } = await client.auth.getUser(auth.slice(7));
  if (authError || !user.user) {
    return Response.json({ error: 'Session expired. Sign in again.' }, { status: 401, headers });
  }
  try {
    const body = await request.json() as { incidentId?: unknown };
    if (typeof body.incidentId !== 'string' || !/^[\da-f-]{36}$/i.test(body.incidentId)) {
      throw new Error('Invalid incident.');
    }
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: incident, error: incidentError } = await client
      .from('incidents')
      .select('id,event_id,raw_report,audio_path,audio_mime_type')
      .eq('id', body.incidentId)
      .eq('reporter_id', user.user.id)
      .single();
    if (incidentError || !incident) {
      return Response.json({ error: 'Incident unavailable.' }, { status: 403, headers });
    }
    if (incident.audio_path && incident.raw_report === 'Voice report attached.') {
      const { data: audio, error: audioError } = await service.storage.from('incident-audio').download(
        incident.audio_path,
      );
      if (!audioError && audio) {
        try {
          const provider = createSetupProvider({
            provider: Deno.env.get('AI_PROVIDER') ?? 'gemini',
            key: Deno.env.get('GEMINI_API_KEY') ?? '',
            model: Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite',
            instruction: 'You transcribe emergency radio reports. Return only the exact spoken words as a concise transcript. Do not add facts, interpretation or advice.',
          });
          const transcript = await provider.generate([
            { text: 'Transcribe this volunteer incident radio report.' },
            { inlineData: { mimeType: incident.audio_mime_type ?? 'audio/mp4', data: base64(new Uint8Array(await audio.arrayBuffer())) } },
          ], {
            type: 'object',
            properties: { transcript: { type: 'string', minLength: 1, maxLength: 4000 } },
            required: ['transcript'],
            additionalProperties: false,
          }) as { transcript?: unknown };
          if (typeof transcript.transcript === 'string' && transcript.transcript.trim()) {
            const { error: updateError } = await service.from('incidents').update({
              raw_report: transcript.transcript.trim(),
            }).eq('id', incident.id);
            if (updateError) throw updateError;
          }
        } catch {
          // The original audio remains available for coordinator playback if transcription fails.
        }
      }
    }
    const { error: analyzeError } = await service.rpc('analyze_incident', {
      p_incident_id: incident.id,
    });
    if (analyzeError) throw analyzeError;
    await service.rpc('correlate_incident', { p_incident_id: incident.id });
    await service.rpc('detect_risk', { p_event_id: incident.event_id });
    return Response.json({ accepted: true }, { headers });
  } catch (cause) {
    return Response.json({
      error: cause instanceof Error ? cause.message : 'Incident analysis failed. The original report is retained.',
    }, { status: 400, headers });
  }
});
