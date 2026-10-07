const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  ts = require('typescript');
const { test } = require('node:test');
function worker(options = {}) {
  let handler;
  const pending = [], calls = [];
  const c = {
    id: '44444444-4444-4444-8444-444444444444',
    attempt: 1,
    storage_path: 'owner/certificate/proof.pdf',
    mime_type: 'application/pdf',
  };
  const userClient = {
    auth: {
      getUser: async () => ({
        data: { user: options.noUser ? null : { id: 'owner' } },
        error: null,
      }),
    },
    rpc: async (name, args) => {
      calls.push({ client: 'user', name, args });
      return {
        data: options.denied ? null : c,
        error: options.denied ? new Error('denied') : null,
      };
    },
    storage: {
      from: () => ({ download: async () => ({ data: new Blob(['certificate']), error: null }) }),
    },
  };
  const admin = {
    rpc: async (name, args) => {
      calls.push({ client: 'admin', name, args });
      return { error: null };
    },
  };
  const createClient = (url, key, config) => {
    calls.push({ create: key, config });
    return key === 'service-secret' ? admin : userClient;
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync('supabase/functions/certificate-ai/index.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      Error,
      Response,
      Uint8Array,
      Blob,
      btoa,
      console,
      Deno: {
        serve: (f) => {
          handler = f;
        },
        env: {
          get: (key) =>
            key === 'SUPABASE_SERVICE_ROLE_KEY'
              ? (options.noService ? undefined : 'service-secret')
              : key === 'SUPABASE_ANON_KEY'
              ? 'public-key'
              : 'configured',
        },
      },
      EdgeRuntime: { waitUntil: (p) => pending.push(p) },
      require: (name) =>
        name.startsWith('npm:') ? { createClient } : name.includes('certification.ts')
          ? {
            certificateSchema: {},
            validateCertificateFields: (v) => {
              if (options.invalid) throw new Error('Invalid certificate dates.');
              return v;
            },
          }
          : {
            createSetupProvider: () => ({
              generate: async () => {
                if (options.providerFailure) throw new Error('Quota exceeded');
                return { type: 'First Aid', confidence: .95 };
              },
            }),
          },
    },
  );
  return {
    request: () =>
      handler(
        new Request('https://project/functions/v1/certificate-ai', {
          method: 'POST',
          headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificateId: c.id }),
        }),
      ),
    calls,
    pending,
  };
}
test('certificate owner is verified before claim; privileged client never carries owner JWT', async () => {
  const w = worker();
  assert.equal((await w.request()).status, 202);
  await Promise.all(w.pending);
  const admin = w.calls.find((c) => c.create === 'service-secret');
  assert.equal(admin.config.global, undefined);
  assert.equal(w.calls.find((c) => c.name === 'finish_certificate_processing').client, 'admin');
  assert.equal(w.calls.find((c) => c.name === 'claim_certificate_processing').client, 'user');
});
test('unauthenticated and nonowner requests cannot start certificate extraction', async () => {
  let w = worker({ noUser: true });
  assert.equal((await w.request()).status, 401);
  assert.equal(w.calls.filter((c) => c.name).length, 0);
  w = worker({ denied: true });
  assert.equal((await w.request()).status, 403);
  assert.equal(w.pending.length, 0);
});
test('missing privileged server configuration leaves uploaded evidence unclaimed', async () => {
  const w = worker({ noService: true });
  assert.equal((await w.request()).status, 503);
  assert.equal(w.calls.filter((c) => c.name).length, 0);
});
test('provider failure confirms receipt first then records retryable failure', async () => {
  const w = worker({ providerFailure: true });
  assert.equal((await w.request()).status, 202);
  await Promise.all(w.pending);
  assert.equal(
    w.calls.find((c) => c.name === 'finish_certificate_processing').args.p_error,
    'Quota exceeded',
  );
});
test('runtime-invalid extraction cannot become verified certificate state', async () => {
  const w = worker({ invalid: true });
  assert.equal((await w.request()).status, 202);
  await Promise.all(w.pending);
  const final = w.calls.find((c) => c.name === 'finish_certificate_processing');
  assert.equal(final.args.p_fields, null);
  assert.match(final.args.p_error, /Invalid certificate/);
});
