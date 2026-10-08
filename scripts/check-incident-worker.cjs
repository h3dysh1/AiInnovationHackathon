const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const incidentId = '44444444-4444-4444-8444-444444444444';
function worker(options = {}) {
  let handler, claimed = false;
  const pending = [], calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'owner' } }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ client: 'user', name, args });
      return { error: options.denied ? new Error('Not your incident') : null };
    },
  };
  const admin = {
    rpc: async (name, args) => {
      calls.push({ client: 'service', name, args });
      if (name === 'claim_response_processing' || name === 'claim_event_summary') return {data:null,error:null};
      if (name === 'incident_intelligence_context') return {data:{incident:{raw_report:'Saved report'}},error:null};
      if (name === 'consume_incident_wakeup') return { data: !options.invalidTicket, error: null };
      if (name === 'claim_incident_processing') {
        const data = claimed || options.alreadyClaimed ? null : {
          id: incidentId, processing_attempt: 2, transcript: options.existingTranscript ?? null,
          audio_path: options.text ? null : 'owner/event/recording.m4a', audio_mime_type: 'audio/mp4',
        };
        claimed = true;
        return { data, error: null };
      }
      return { data: true, error: options.finishFailure ? new Error('Connection lost') : null };
    },
    storage: { from: () => ({ download: async () => ({
      data: options.downloadFailure ? null : new Blob(['voice']),
      error: options.downloadFailure ? new Error('Download failed') : null,
    }) }) },
  };
  const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'public',
    SUPABASE_SERVICE_ROLE_KEY: options.noService ? undefined : 'service' };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/incident-ai/index.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: {}, Response, Error, Uint8Array, Blob, btoa,
    console: { error: () => {} },
    Deno: { serve: f => { handler = f; }, env: { get: key => env[key] } },
    EdgeRuntime: { waitUntil: p => pending.push(p) },
    require: name => name.startsWith('npm:') ? { createClient: (url, key, config) => {
      calls.push({ create: key, config }); return key === 'service' ? admin : client;
    } } : name.includes('live-intelligence') ? {extractIncident:async()=>{if(options.analysisFailure)throw new Error('Interpretation unavailable');return {summary:'Validated interpretation'};},correlateReports:async()=>[],identifyRisks:async()=>[],retrieveProcedures:async()=>[],draftResponse:async()=>{},summarizeEvent:async()=>''} : { createSetupProvider: () => ({ generate: async () => {
      calls.push({ provider: true });
      if (options.providerFailure) throw new Error('AI provider unavailable.');
      if (options.providerWait) await options.providerWait;
      return options.output ?? { transcript: 'Someone dizzy near Water Station B.' };
    } }) },
  });
  return {
    calls, pending,
    request: (headers = { Authorization: 'Bearer owner' }, body = { incidentId }) => handler(
      new Request('https://project/functions/v1/incident-ai', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    ),
    finish: async () => { await Promise.all(pending); return calls.find(c => c.name === 'advance_incident_intelligence'); },
  };
}
test('receipt returns 202 while transcription is still waiting; original is never overwritten', async () => {
  let release;
  const w = worker({ providerWait: new Promise(resolve => { release = resolve; }) });
  assert.equal((await w.request()).status, 202);
  assert.equal(w.calls.filter(c => c.name === 'advance_incident_intelligence').length, 0);
  release();
  const finish = await w.finish();
  assert.equal(finish.args.p_transcript, 'Someone dizzy near Water Station B.');
  assert.equal(finish.args.p_error, null);
  assert.equal(finish.args.p_attempt, 2);
  assert.equal(w.calls.find(c => c.name === 'retry_incident_processing').client, 'user');
  assert.equal(w.calls.find(c => c.create === 'service').config.global, undefined);
});
test('scheduled worker consumes a single-use wakeup and uses no volunteer session', async () => {
  const w = worker();
  assert.equal((await w.request({ 'x-incident-wakeup': incidentId }, {})).status, 202);
  await w.finish();
  assert.equal(w.calls.filter(c => c.create === 'public').length, 0);
  assert.equal(w.calls.find(c => c.name === 'claim_incident_processing').args.p_id, null);
  const denied = worker({ invalidTicket: true });
  assert.equal((await denied.request({ 'x-incident-wakeup': incidentId })).status, 401);
  assert.equal(denied.pending.length, 0);
});
test('unauthenticated and unauthorized callers cannot claim incidents', async () => {
  for (const options of [{ noUser: true }, { denied: true }]) {
    const w = worker(options);
    assert.equal((await w.request()).status, options.noUser ? 401 : 403);
    assert.equal(w.pending.length, 0);
    assert.equal(w.calls.filter(c => c.name === 'claim_incident_processing').length, 0);
  }
});
test('missing service configuration leaves the original queue unclaimed', async () => {
  const w = worker({ noService: true });
  assert.equal((await w.request()).status, 503);
  assert.equal(w.calls.length, 0);
});
test('AI and storage failures are persisted rather than silently becoming successful analysis', async () => {
  for (const options of [{ providerFailure: true }, { downloadFailure: true }]) {
    const w = worker(options);
    assert.equal((await w.request()).status, 202);
    const finish = await w.finish();
    assert.equal(finish.args.p_transcript, null);
    assert.match(finish.args.p_error, /unavailable|saved audio/);
  }
});
test('invalid transcripts cannot reach authoritative analysis', async () => {
  for (const output of [{ transcript: '' }, { transcript: 5 }, { transcript: 'x'.repeat(4001) },
    { transcript: 'valid text', instruction: 'evacuate' }]) {
    const w = worker({ output });
    await w.request();
    const finish = await w.finish();
    assert.equal(finish.args.p_transcript, null);
    assert.match(finish.args.p_error, /Invalid transcription/);
  }
});
test('text and saved transcripts skip transcription while still receiving structured interpretation', async () => {
  for (const options of [{ text: true }, { existingTranscript: 'Previously saved transcript' }]) {
    const w = worker(options);
    await w.request();
    const finish = await w.finish();
    assert.equal(finish.args.p_error, null);
    assert.equal(w.calls.filter(c => c.provider).length, 0);
  }
});
test('duplicate worker invocation cannot process an already-claimed incident', async () => {
  const w = worker({ alreadyClaimed: true });
  assert.equal((await w.request()).status, 202);
  assert.equal(await w.finish(), undefined);
});

test('interpretation failure preserves a successfully transcribed recording',async()=>{
 const w=worker({analysisFailure:true});await w.request();const finish=await w.finish();
 assert.equal(finish.args.p_transcript,'Someone dizzy near Water Station B.');
 assert.equal(finish.args.p_analysis,null);assert.match(finish.args.p_error,/Interpretation unavailable/);
});
