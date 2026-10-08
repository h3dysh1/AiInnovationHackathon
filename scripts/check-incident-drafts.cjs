const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/domain/incident-draft.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported });
const { parseIncidentDraft } = exported;
const draft = { report: 'Gate C needs assistance', recordingUri: 'file:///saved-recording.m4a', requestId: '12345678-1234-4234-8234-123456789abc', attempted: true, assignmentId: 'assignment' };
test('restores retry identity and original report together', () => {
  const restored = parseIncidentDraft(JSON.stringify(draft));
  assert.equal(restored.requestId, draft.requestId);
  assert.equal(restored.report, draft.report);
  assert.equal(restored.recordingUri, draft.recordingUri);
  assert.equal(restored.attempted, true);
});
test('corrupt or incompatible local records cannot enter the report form', () => {
  for (const value of [null, 'broken json', 'null', '[]', JSON.stringify({ ...draft, requestId: null }), JSON.stringify({ ...draft, report: 'x'.repeat(4001) }), JSON.stringify({ ...draft, recordingUri: {} }), JSON.stringify({ ...draft, attempted: 'true' })]) assert.equal(parseIncidentDraft(value), null);
});
