const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function load(file, deps = {}) {
  const exported = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: exported, require: name => { if (!(name in deps)) throw new Error(`Unexpected import ${name}`); return deps[name]; }, Date, JSON, Promise, Set, Error, Number, String, Array, Object, Math });
  return exported;
}
const domain = load('src/domain/incident-outbox.ts');
const user = '11111111-1111-4111-8111-111111111111', event = '22222222-2222-4222-8222-222222222222';
const id = n => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const hours = n => n * 60 * 60 * 1000;
const entry = (n, change = {}) => ({ requestId: id(n), userId: user, eventId: event, report: `report ${n}`, recordingUri: null, createdAt: new Date().toISOString(), attempts: 0, nextAttemptAt: 0, status: 'queued', error: null, incidentId: null, ...change });

// Runs the real outbox service against in-memory storage and a scripted server.
function harness(initial, send) {
  const store = new Map([[domain.outboxKey(user), JSON.stringify(initial)]]);
  const log = [];
  const session = { data: { session: { user: { id: user } } } };
  const report = async (kind, requestId) => { log.push(`send ${kind} ${requestId}`); return send(requestId); };
  const service = load('src/services/incident-outbox.ts', {
    '@/domain/incident-outbox': domain,
    './draft-storage': {
      loadDraft: async key => store.get(key) ?? null,
      saveDraft: async (key, value) => { log.push('write'); store.set(key, value); },
    },
    './incident-evidence': {
      preserveIncidentAudio: async uri => uri,
      releaseIncidentAudio: requestId => {
        const saved = JSON.parse(store.get(domain.outboxKey(user))).find(q => q.requestId === requestId);
        log.push(`release ${requestId} ${saved ? `while entry has ${saved.recordingUri}` : 'after entry removed'}`);
      },
    },
    './supabase': { supabase: { auth: { getSession: async () => session } }, scopedReportingClient: async () => ({}) },
    './staffing': {
      reportIncident: (_event, _report, _assignment, requestId) => report('text', requestId),
      reportVoiceIncident: (_event, _uri, _assignment, _report, requestId) => report('voice', requestId),
    },
  });
  return { service, log, saved: () => JSON.parse(store.get(domain.outboxKey(user))) };
}

test('only receipts older than the retention period are prunable', () => {
  const now = Date.now();
  assert.equal(domain.expiredReceipt(entry(1, { status: 'received', receivedAt: now - hours(25) }), now), true);
  assert.equal(domain.expiredReceipt(entry(1, { status: 'received', receivedAt: now - hours(23) }), now), false);
  // Receipts saved before receivedAt existed fall back to when the report was written.
  assert.equal(domain.expiredReceipt(entry(1, { status: 'received', createdAt: new Date(now - hours(30)).toISOString() }), now), true);
  for (const status of ['queued', 'blocked']) {
    assert.equal(domain.expiredReceipt(entry(1, { status, createdAt: new Date(now - hours(999)).toISOString() }), now), false, `${status} reports are never pruned`);
  }
  assert.throws(() => domain.parseOutbox(JSON.stringify([entry(1, { receivedAt: 'yesterday' })]), user), /Invalid saved report/);
});

test('a confirmed voice report drops its local recording only after the queue is updated', async () => {
  const h = harness([entry(1, { recordingUri: 'file:///outbox/1.m4a' })], () => ({ id: 'incident-1' }));
  await h.service.flushIncidentOutbox();
  const [saved] = h.saved();
  assert.equal(saved.status, 'received');
  assert.equal(saved.recordingUri, null);
  assert.equal(saved.incidentId, 'incident-1');
  assert.ok(Date.now() - saved.receivedAt < 5000);
  assert.deepEqual(h.log.filter(line => line.startsWith('release')), [`release ${id(1)} while entry has null`]);
});

test('a failed send keeps the report and its recording for retry', async () => {
  const h = harness([entry(1, { recordingUri: 'file:///outbox/1.m4a' })], () => { throw new Error('Network request failed'); });
  await h.service.flushIncidentOutbox();
  const [saved] = h.saved();
  assert.equal(saved.status, 'queued');
  assert.equal(saved.recordingUri, 'file:///outbox/1.m4a');
  assert.equal(saved.attempts, 1);
  assert.equal(h.log.some(line => line.startsWith('release')), false);
});

test('old receipts are removed while unsent, blocked and recent reports stay', async () => {
  const old = Date.now() - hours(48);
  const h = harness([
    entry(1, { status: 'received', incidentId: 'a', receivedAt: old }),
    entry(2, { status: 'received', incidentId: 'b', recordingUri: 'file:///outbox/2.m4a', createdAt: new Date(old).toISOString() }),
    entry(3, { status: 'received', incidentId: 'c', receivedAt: Date.now() - hours(1) }),
    entry(4, { status: 'blocked', error: 'Not a member', recordingUri: 'file:///outbox/4.m4a', createdAt: new Date(old).toISOString() }),
    entry(5, { createdAt: new Date(old).toISOString() }),
  ], () => ({ id: 'incident-5' }));
  await h.service.flushIncidentOutbox();
  assert.deepEqual(h.saved().map(q => [q.requestId, q.status]), [[id(3), 'received'], [id(4), 'blocked'], [id(5), 'received']]);
  assert.equal(h.saved()[1].recordingUri, 'file:///outbox/4.m4a');
  assert.deepEqual(h.log.filter(line => line.startsWith('release')), [`release ${id(1)} after entry removed`, `release ${id(2)} after entry removed`]);
  assert.deepEqual(h.log.filter(line => line.startsWith('send')), [`send text ${id(5)}`]);
});
