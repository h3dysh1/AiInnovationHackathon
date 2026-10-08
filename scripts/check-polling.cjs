const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

// Loads the hook with stand-ins for React and Expo Router so its scheduling can
// be driven directly: `focus()` runs the focus effect and returns its cleanup.
function load() {
  const exported = {};
  const state = { appState: 'active', effect: null };
  const deps = {
    react: { useCallback: fn => fn },
    'react-native': { AppState: { get currentState() { return state.appState; } } },
    'expo-router': { useFocusEffect: effect => { state.effect = effect; } },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/hooks/polling.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: exported, require: name => deps[name], setTimeout, clearTimeout });
  return { usePolling: exported.usePolling, state, focus: () => state.effect() };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('waits for a slow request to settle before polling again', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { usePolling, focus } = load();
  let calls = 0, finish;
  usePolling(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, 5000);
  const blur = focus();
  assert.equal(calls, 0);
  mock.timers.tick(5000);
  assert.equal(calls, 1);
  mock.timers.tick(20000);
  assert.equal(calls, 1, 'no overlapping request while one is in flight');
  finish();
  await settle();
  mock.timers.tick(5000);
  assert.equal(calls, 2);
  blur();
  mock.timers.reset();
});

test('stops when the screen loses focus, including after an in-flight request', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { usePolling, focus } = load();
  let calls = 0, finish;
  usePolling(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, 1000);
  const blur = focus();
  mock.timers.tick(1000);
  blur();
  finish();
  await settle();
  mock.timers.tick(10000);
  assert.equal(calls, 1);
  mock.timers.reset();
});

test('skips requests while the app is in the background and resumes afterwards', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { usePolling, focus, state } = load();
  let calls = 0;
  usePolling(async () => { calls++; }, 1000);
  const blur = focus();
  state.appState = 'background';
  mock.timers.tick(3000);
  assert.equal(calls, 0);
  state.appState = 'active';
  mock.timers.tick(1000);
  assert.equal(calls, 1);
  blur();
  mock.timers.reset();
});

test('keeps polling after a failed request and does nothing when disabled', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { usePolling, focus } = load();
  let calls = 0;
  usePolling(async () => { calls++; throw new Error('offline'); }, 1000);
  const blur = focus();
  mock.timers.tick(1000);
  await settle();
  mock.timers.tick(1000);
  assert.equal(calls, 2);
  blur();
  let disabledCalls = 0;
  usePolling(async () => { disabledCalls++; }, 1000, false);
  assert.equal(focus(), undefined);
  mock.timers.tick(5000);
  assert.equal(disabledCalls, 0);
  mock.timers.reset();
});
