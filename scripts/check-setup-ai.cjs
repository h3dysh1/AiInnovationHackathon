const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const { test } = require('node:test');
function load(file, deps = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      Error,
      Date,
      AbortSignal,
      setTimeout,
      clearTimeout,
      fetch,
      ArrayBuffer,
      ...globals,
      require: (name) => {
        if (!(name in deps)) throw new Error(`Unexpected dependency ${name}`);
        return deps[name];
      },
    },
  );
  return exports;
}
const domain = load('src/domain/operating-plan.ts');
const context = {
  eventId: 'event-a',
  startDate: '2026-12-12',
  endDate: '2026-12-14',
  sources: [{ id: 'event-a', type: 'description' }, { id: 'doc-a', type: 'document' }],
  locationIds: ['existing-location'],
};
function plan() {
  const source = {
    sourceType: 'description',
    sourceId: 'event-a',
    reference: 'Water station staffing',
    confidence: .9,
  };
  return {
    locations: [{ key: 'water', name: 'Water Station B', description: '', source }],
    posts: [{
      key: 'crew',
      locationKey: 'water',
      name: 'Water crew',
      description: '',
      minimumCoverage: 4,
      criticality: 'important',
      supervisor: 'Mo',
      escalation: 'Radio 1',
      instructions: '',
      requirements: [{
        certificationType: 'First Aid',
        experienceRequirement: null,
        minimumCount: 1,
      }],
      windows: [{
        startDate: '2026-12-12',
        endDate: '2026-12-14',
        startTime: '09:00',
        endTime: '18:00',
        minimumCoverage: null,
      }],
      source,
    }],
    procedures: [],
    issues: [],
  };
}
test('canonical first aid count remains within four total volunteers', () => {
  const valid = domain.validateOperatingPlan(plan(), context);
  assert.equal(valid.posts[0].minimumCoverage, 4);
  assert.equal(valid.posts[0].requirements[0].minimumCount, 1);
  assert.equal(domain.proposalGaps(valid).length, 0);
});
test('authoritative sources, places, draft keys and issue references are validated', () => {
  for (
    const mutate of [
      (p) => p.locations[0].source.sourceId = 'another-event',
      (p) => p.posts[0].locationKey = 'invented-place',
      (p) => p.posts[0].key = 'water',
      (p) => p.locations[0].source.confidence = 1.1,
      (p) =>
        p.issues.push({
          key: 'issue',
          postKey: 'invented-post',
          severity: 'blocking',
          question: 'How many?',
          evidence: '',
          sourceIds: [],
        }),
    ]
  ) {
    const p = plan();
    mutate(p);
    assert.throws(() => domain.validateOperatingPlan(p, context));
  }
});
test('unsafe or impossible staffing and operating dates are rejected', () => {
  for (
    const mutate of [
      (p) => p.posts[0].minimumCoverage = 0,
      (p) => p.posts[0].requirements[0].minimumCount = 5,
      (p) => p.posts[0].windows[0].minimumCoverage = 0,
      (p) => p.posts[0].windows[0].startDate = '2026-02-30',
      (p) => p.posts[0].windows[0].endDate = '2026-12-15',
      (p) => p.posts[0].windows[0].endTime = '08:00',
      (p) => p.posts[0].minimumCoverage = 1.5,
    ]
  ) {
    const p = plan();
    mutate(p);
    assert.throws(() => domain.validateOperatingPlan(p, context));
  }
});
test('missing facts stay null and produce deterministic clarification gaps', () => {
  const p = plan();
  p.posts[0].minimumCoverage = null;
  p.posts[0].supervisor = null;
  p.posts[0].escalation = null;
  p.posts[0].requirements[0].minimumCount = null;
  p.posts[0].windows = [];
  const valid = domain.validateOperatingPlan(p, context);
  assert.equal(valid.posts[0].minimumCoverage, null);
  assert.equal(domain.proposalGaps(valid).length, 5);
});
const { createSetupProvider } = load('supabase/functions/_shared/ai-provider.ts');
test('transient responses retry within one shared deadline and retain the request', async () => {
  for (const status of [429, 500, 502, 503, 504]) {
    const requests = [];
    const provider = createSetupProvider({ provider: 'gemini', key: 'key', model: 'test', timeoutMs: 1000, retryDelayMs: 1 }, async (_url, request) => {
      requests.push(request);
      return requests.length === 1 ? new Response('', { status }) : new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] }));
    });
    assert.equal((await provider.generate([{ text: 'original' }], {})).ok, true);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].signal, requests[1].signal);
    assert.equal(requests[0].body, requests[1].body);
  }
});
test('deadline interrupts backoff instead of starting more provider attempts', async () => {
  let attempts = 0;
  const provider = createSetupProvider({ provider: 'gemini', key: 'key', model: 'test', timeoutMs: 30, retryDelayMs: 200 }, async () => {
    attempts++;
    return new Response('', { status: 503 });
  });
  await assert.rejects(provider.generate([], {}), /AI analysis delayed/);
  assert.equal(attempts, 1);
});
test('shared voice budget cancels a provider call without retrying or returning partial output', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const provider = createSetupProvider({ provider: 'gemini', key: 'key', model: 'test', signal: controller.signal }, async (_url, { signal }) => {
    attempts++;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      controller.abort();
    });
  });
  await assert.rejects(provider.generate([], {}), /AI analysis delayed/);
  assert.equal(attempts, 1);
});
test('Gemini key remains in backend header; provider returns structured candidate only', async () => {
  let request;
  const provider = createSetupProvider({
    provider: 'gemini',
    key: 'server-key',
    model: 'gemini-3.5-flash-lite',
  }, async (url, options) => {
    request = { url, options };
    return new Response(
      JSON.stringify({
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify(plan()) }] },
        }],
      }),
    );
  });
  const output = await provider.generate([{ text: 'source' }], domain.operatingPlanSchema);
  assert.equal(domain.validateOperatingPlan(output, context).posts[0].minimumCoverage, 4);
  assert.equal(request.options.headers['x-goog-api-key'], 'server-key');
  assert.equal(request.options.body.includes('server-key'), false);
  assert.equal(
    JSON.parse(request.options.body).generationConfig.responseMimeType,
    'application/json',
  );
});
test('quota, missing credentials, incomplete output and malformed JSON fail without a candidate', async () => {
  await assert.rejects(
    createSetupProvider({ provider: 'gemini', key: '', model: 'test' }).generate([], {}),
    /not configured/,
  );
  await assert.rejects(
    createSetupProvider(
      { provider: 'gemini', key: 'key', model: 'test', retryDelayMs: 1 },
      async () => new Response('rate limit', { status: 429 }),
    ).generate([], {}),
    /free-tier limit/,
  );
  for (
    const c of [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }, {
      finishReason: 'STOP',
      content: { parts: [{ text: 'invalid' }] },
    }]
  ) {
    await assert.rejects(
      createSetupProvider(
        { provider: 'gemini', key: 'key', model: 'test' },
        async () => new Response(JSON.stringify({ candidates: [c] })),
      ).generate([], {}),
    );
  }
});
function documentsHarness(mode) {
  let saved = null, inserted = false, uploads = 0;
  const failure = new Error('Reply lost');
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    insert(values) {
      saved = { ...values };
      inserted = true;
      return this;
    },
    async maybeSingle() {
      if (mode === 'unknown' && inserted) throw failure;
      return { data: saved, error: null };
    },
    async single() {
      return mode === 'ok' ? { data: saved, error: null } : { data: null, error: failure };
    },
  };
  const db = {
    from: () => query,
    storage: {
      from: () => ({
        upload: async () => {
          uploads++;
          return { error: null };
        },
      }),
    },
  };
  const service = load('src/services/documents.ts', { './planning': { planningClient: () => db } });
  const input = {
    id: 'stable-id',
    eventId: 'event-a',
    userId: 'mo',
    title: 'Operations',
    type: 'operations',
    name: 'ops.txt',
    mimeType: 'text/plain',
    bytes: new ArrayBuffer(8),
  };
  return {
    upload: () => service.uploadDocument(input),
    saved: () => saved,
    uploads: () => uploads,
  };
}
test('document metadata replies can be recovered without deleting original uploads', async () => {
  const h = documentsHarness('lost');
  const d = await h.upload();
  assert.equal(d.id, 'stable-id');
  assert.equal(d.storage_path, 'event-a/stable-id/ops.txt');
  await h.upload();
  assert.equal(h.uploads(), 1);
});
test('unknown document commit retains upload for retry', async () => {
  const h = documentsHarness('unknown');
  await assert.rejects(h.upload(), /Reply lost/);
  assert.equal(h.saved().id, 'stable-id');
  assert.equal(h.uploads(), 1);
});

test('duplicate tasks and overlapping hours cannot silently overwrite the candidate', () => {
  const duplicated = plan();
  duplicated.posts.push({ ...duplicated.posts[0], key: 'other-key' });
  assert.throws(() => domain.validateOperatingPlan(duplicated, context), /Duplicate post/);
  const overlapping = plan();
  overlapping.posts[0].windows.push({
    ...overlapping.posts[0].windows[0],
    startTime: '10:00',
    endTime: '11:00',
  });
  assert.throws(() => domain.validateOperatingPlan(overlapping, context), /Overlapping/);
});
