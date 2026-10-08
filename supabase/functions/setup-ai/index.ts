/// <reference path="./runtime.d.ts" />
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { operatingPlanSchema, validateOperatingPlan } from '../../../src/domain/operating-plan.ts';
import { type AiPart, createSetupProvider } from '../_shared/ai-provider.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};
type Context = {
  event: {
    id: string;
    name: string;
    venue_name: string;
    start_date: string;
    end_date: string;
    operating_start_time: string;
    operating_end_time: string;
    timezone: string;
  };
  description: string | null;
  site_map?: { id: string; storage_path: string } | null;
  documents: {
    id: string;
    title: string;
    document_type: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
  }[];
  locations: { id: string; name: string }[];
  posts: unknown[];
  requirements: unknown[];
  windows: unknown[];
  procedures: unknown[];
  answers: { id: string; question: string; answer: string }[];
};
type Job = { id: string; event_id: string; attempt: number };
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST required' }, { status: 405, headers: cors });
  }
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return Response.json({ error: 'Sign in first.' }, { status: 401, headers: cors });
  }
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: user, error: authError } = await client.auth.getUser(auth.slice(7));
  if (authError || !user.user) {
    return Response.json({ error: 'Session expired. Sign in again.' }, {
      status: 401,
      headers: cors,
    });
  }
  try {
    const body = await request.json() as { jobId?: unknown };
    if (typeof body.jobId !== 'string' || !/^[\da-f-]{36}$/i.test(body.jobId)) {
      throw new Error('Invalid analysis request.');
    }
    const { data, error } = await client.rpc('claim_setup_job', { p_job_id: body.jobId });
    if (error) {
      return Response.json({ error: 'This analysis is unavailable to your account.' }, {
        status: 403,
        headers: cors,
      });
    }
    if (!data) return Response.json({ accepted: true }, { status: 202, headers: cors });
    const job = data as Job;
    const work = async () => {
      try {
        const { data: input, error: contextError } = await client.rpc('get_setup_ai_context', {
          p_job_id: job.id,
        });
        if (contextError) {
          throw new Error('Setup changed while starting analysis. Refresh and start again.');
        }
        const context = input as Context;
        const documents = [
          ...context.documents.map(doc => ({ ...doc, bucket: 'event-documents' })),
          ...(context.site_map ? [{
            id: context.site_map.id, title: 'Uploaded event site map', document_type: 'site_map',
            storage_path: context.site_map.storage_path, mime_type: 'image/jpeg', size_bytes: 0, bucket: 'site-maps',
          }] : []),
        ];
        if (
          documents.length > 10 ||
          context.documents.reduce((sum, doc) => sum + doc.size_bytes, 0) > 12 * 1024 * 1024
        ) {
          throw new Error(
            'Include at most 10 documents totalling 12 MB for one analysis. You can exclude documents without deleting them.',
          );
        }
        const parts: AiPart[] = [{
          text: JSON.stringify({
            task:
              'Produce a complete candidate operating plan from these sources. Reuse existing location IDs when referring to them, or define unique draft keys for new places. Preserve existing manually entered staffing unless an answer explicitly changes it. Identify unclear counts, missing operating hours, supervisors/escalation contacts, conflicting sources and safety requirements absent from staffing. Ask the highest-value question first. Counts of qualified staff are within total coverage unless explicitly stated otherwise; ambiguity must become a blocking question. Use same-day operating windows within the event dates; do not invent a window. Requirements and windows inherit the post source. Do not remove existing records. No autonomous safety actions.',
            event: {
              id: context.event.id,
              name: context.event.name,
              venue_name: context.event.venue_name,
              start_date: context.event.start_date,
              end_date: context.event.end_date,
              operating_start_time: context.event.operating_start_time,
              operating_end_time: context.event.operating_end_time,
              timezone: context.event.timezone,
            },
            description: { id: context.event.id, text: context.description },
            existing: {
              locations: context.locations,
              posts: context.posts,
              requirements: context.requirements,
              windows: context.windows,
              procedures: context.procedures,
            },
            answers: context.answers,
            documents: documents.map((doc) => ({
              id: doc.id,
              title: doc.title,
              type: doc.document_type,
            })),
          }),
        }];
        let totalBytes = 0;
        for (const doc of documents) {
          const { data: file, error: fileError } = await client.storage.from(doc.bucket)
            .download(doc.storage_path);
          if (fileError || !file) {
            throw new Error(`Could not read ${doc.title}. The original document is retained.`);
          }
          if (file.size > 10485760) {
            throw new Error('Document exceeds the supported analysis size.');
          }
          totalBytes += file.size;
          if (totalBytes > 12 * 1024 * 1024) throw new Error('Include documents and a map totalling at most 12 MB for one analysis.');
          parts.push({
            text:
              `Source document ID ${doc.id}; title: ${doc.title}. Cite this exact ID and a page/section or row reference.`,
          });
          if (doc.mime_type.startsWith('text/')) parts.push({ text: await file.text() });
          else {parts.push({
              inlineData: {
                mimeType: doc.mime_type,
                data: base64(new Uint8Array(await file.arrayBuffer())),
              },
            });}
        }
        const provider = createSetupProvider({
          provider: Deno.env.get('AI_PROVIDER') ?? 'gemini',
          key: Deno.env.get('GEMINI_API_KEY') ?? '',
          model: Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite',
        });
        const raw = await provider.generate(parts, operatingPlanSchema);
        const plan = validateOperatingPlan(raw, {
          eventId: context.event.id,
          startDate: context.event.start_date,
          endDate: context.event.end_date,
          locationIds: context.locations.map((location) => location.id),
          sources: [
            ...(context.description ? [{ id: context.event.id, type: 'description' }] : []),
            ...documents.map((doc) => ({ id: doc.id, type: 'document' })),
            ...context.answers.map((answer) => ({ id: answer.id, type: 'answer' })),
          ],
        });
        const { error: finishError } = await client.rpc('finish_setup_job', {
          p_job_id: job.id,
          p_attempt: job.attempt,
          p_output: plan,
          p_error: null,
        });
        if (finishError) {
          throw new Error('Could not store the analysis result. Retry this saved analysis.');
        }
      } catch (cause) {
        const message = cause instanceof Error
          ? cause.message
          : 'AI analysis failed. Your source material is retained.';
        await client.rpc('finish_setup_job', {
          p_job_id: job.id,
          p_attempt: job.attempt,
          p_output: null,
          p_error: message,
        });
      }
    };
    EdgeRuntime.waitUntil(work());
    return Response.json({ accepted: true, jobId: job.id }, { status: 202, headers: cors });
  } catch {
    return Response.json({ error: 'Could not start analysis. Your saved input is retained.' }, {
      status: 400,
      headers: cors,
    });
  }
});
