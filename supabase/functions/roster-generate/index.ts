import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { generateRoster, type RosterContext } from '../../../src/domain/roster.ts';
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST required' }, { status: 405, headers });
  }
  try {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) throw new Error('Sign in first.');
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: user, error } = await client.auth.getUser(auth.slice(7));
    if (error || !user.user) {
      return Response.json({ error: 'Sign in again.' }, { status: 401, headers });
    }
    const body = await request.json();
    for (const key of ['rosterId', 'generationId']) {
      if (typeof body[key] !== 'string' || !/^[\da-f-]{36}$/i.test(body[key])) {
        throw new Error('Invalid generation request.');
      }
    }
    const { data, error: contextError } = await client.rpc('get_roster_context', {
      p_roster_id: body.rosterId,
    });
    if (contextError) {
      return Response.json({ error: 'Roster unavailable.' }, { status: 403, headers });
    }
    const ctx = data as RosterContext;
    if (ctx.roster.last_generation_id === body.generationId) {
      return Response.json({ saved: true }, { headers });
    }
    if (ctx.roster.status !== 'draft' || ctx.roster.revision !== body.revision) {
      throw new Error('Draft changed. Refresh before generating.');
    }
    if (ctx.shifts.length > 2000 || ctx.crew.length > 1000) {
      throw new Error(
        'Automatic generation supports up to 2,000 shifts and 1,000 crew. Divide larger events into supported drafts.',
      );
    }
    const result = generateRoster(
      ctx,
      Math.max(
        1,
        Math.min(2000, Math.floor(200000 / Math.max(1, ctx.shifts.length * ctx.crew.length))),
      ),
    );
    const { error: saveError } = await client.rpc('apply_roster_generation', {
      p_roster_id: ctx.roster.id,
      p_revision: ctx.roster.revision,
      p_staffing_revision: ctx.event.staffing_revision,
      p_generation_id: body.generationId,
      p_assignments: result.assignments,
    });
    if (saveError) throw new Error(saveError.message);
    return Response.json({
      saved: true,
      complete: result.complete,
      searchLimited: result.searchLimited,
    }, { headers });
  } catch (e) {
    return Response.json({
      error: e instanceof Error ? e.message : 'Generation failed. Existing draft retained.',
    }, { status: 400, headers });
  }
});
