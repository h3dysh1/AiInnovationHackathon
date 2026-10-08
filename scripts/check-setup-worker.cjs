const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const jobId = '44444444-4444-4444-8444-444444444444';
const mapId = '55555555-5555-4555-8555-555555555555';
function worker(options = {}) {
  const calls = [], pending = [];
  let handler;
  const context = {
    event: { id: 'event', start_date: '2026-12-12', end_date: '2026-12-14' }, description: 'Event notes',
    site_map: { id: mapId, storage_path: 'event/map.jpg' },
    documents: [], locations: [], posts: [], requirements: [], windows: [], procedures: [], answers: [],
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: {} } }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'claim_setup_job') return { data: { id: jobId, event_id: 'event', attempt: 1 }, error: options.denied ? Error('Denied') : null };
      if (name === 'get_setup_ai_context') return { data: context };
      return { data: null, error: null };
    },
    storage: { from: bucket => ({ download: async path => {
      calls.push({ bucket, path });
      return options.missingMap ? { error: Error('Missing') } : { data: new Blob(['map image']) };
    } }) },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/setup-ai/index.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: {}, Response, Uint8Array, btoa, console,
    Deno: { serve: f => { handler = f; }, env: { get: () => 'configured' } },
    EdgeRuntime: { waitUntil: p => pending.push(p) },
    require: name => name.startsWith('npm:') ? { createClient: () => client }
      : name.includes('operating-plan') ? { operatingPlanSchema: {}, validateOperatingPlan: (raw, validation) => {
        calls.push({ validation });
        if (options.invalid) throw Error('Invented source');
        return raw;
      } } : { createSetupProvider: () => ({ generate: async parts => {
        calls.push({ parts });
        if (options.wait) await options.wait;
        if (options.providerFailure) throw Error('Provider unavailable');
        return { locations: [], posts: [] };
      } }) },
  });
  return {
    calls,
    request: () => handler(new Request('https://project/setup-ai', { method: 'POST', headers: { Authorization: 'Bearer user', 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }) })),
    finish: async () => { await Promise.all(pending); return calls.find(c => c.name === 'finish_setup_job'); },
  };
}
test('uploaded site map is downloaded privately and supplied as a validated source without blocking receipt', async () => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const w = worker({ wait });
  assert.equal((await w.request()).status, 202);
  release();
  const finish = await w.finish();
  assert.equal(finish.args.p_error, null);
  assert.equal(w.calls.find(c => c.bucket).bucket, 'site-maps');
  assert.ok(w.calls.find(c => c.parts).parts.some(p => p.inlineData?.mimeType === 'image/jpeg'));
  assert.ok(w.calls.find(c => c.validation).validation.sources.some(s => s.id === mapId && s.type === 'document'));
});
test('missing map and provider/schema failures retain explicit failed-job states', async () => {
  for (const options of [{ missingMap: true }, { providerFailure: true }, { invalid: true }]) {
    const w = worker(options); await w.request();
    const finish = await w.finish();
    assert.equal(finish.args.p_output, null);
    assert.ok(finish.args.p_error);
  }
});
test('unauthorized setup cannot read the map or invoke the provider', async () => {
  const w = worker({ denied: true });
  assert.equal((await w.request()).status, 403);
  assert.ok(!w.calls.some(c => c.bucket || c.parts));
});
