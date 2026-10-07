const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(relative, dependencies = {}, globals = {}) {
  const filename = path.join(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, Date, Error, ...globals, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
    return dependencies[name];
  } }, { filename });
  return exports;
}

function uploadHarness(mode) {
  const previous = { event_id: 'event-a', storage_path: 'event-a/old.jpg' };
  const networkError = new Error('Network reply unavailable');
  let current = previous;
  let attemptedWrite = false;
  const removed = [];
  const storage = {
    upload: async () => ({ error: null }),
    remove: async paths => {
      if (mode === 'cleanup-failure' && paths[0] === previous.storage_path) throw networkError;
      removed.push(...paths);
      return { error: null };
    },
  };
  const db = { storage: { from: () => storage }, from: table => {
    assert.equal(table, 'event_maps');
    let values;
    const query = {
      select() { return query; }, eq() { return query; },
      upsert(next) { values = next; return query; },
      async maybeSingle() {
        if (attemptedWrite && mode === 'unknown-reference') throw networkError;
        return { data: current, error: null };
      },
      async single() {
        attemptedWrite = true;
        if (mode !== 'rejected-write') current = { ...values };
        return ['lost-reply', 'unknown-reference', 'rejected-write'].includes(mode)
          ? { data: null, error: networkError } : { data: current, error: null };
      },
    };
    return query;
  } };
  const domain = load('src/domain/site.ts');
  const service = load('src/services/site.ts', {
    '@/domain/site': domain,
    '@/services/supabase': { supabase: db },
    'base64-arraybuffer': { decode: () => new ArrayBuffer(1) },
  });
  return { upload: () => service.uploadSiteMap('event-a', 'user-a', 'eA==', 200, 100), removed, current: () => current, previous, networkError };
}

test('a lost reply after commit retains the new authoritative map file', async () => {
  const harness = uploadHarness('lost-reply');
  const result = await harness.upload();
  assert.equal(result.storage_path, harness.current().storage_path);
  assert.notEqual(result.storage_path, harness.previous.storage_path);
  assert.deepEqual(harness.removed, [harness.previous.storage_path]);
});

test('an unknown database reference retains both files for recovery', async () => {
  const harness = uploadHarness('unknown-reference');
  await assert.rejects(harness.upload(), error => error === harness.networkError);
  assert.deepEqual(harness.removed, []);
});

test('a confirmed rejected write cleans up only the unused upload', async () => {
  const harness = uploadHarness('rejected-write');
  await assert.rejects(harness.upload(), error => error === harness.networkError);
  assert.equal(harness.current().storage_path, harness.previous.storage_path);
  assert.equal(harness.removed.length, 1);
  assert.notEqual(harness.removed[0], harness.previous.storage_path);
});

test('failure to clean up an old file does not hide a saved replacement', async () => {
  const harness = uploadHarness('cleanup-failure');
  const result = await harness.upload();
  assert.equal(result.storage_path, harness.current().storage_path);
  assert.notEqual(result.storage_path, harness.previous.storage_path);
});

test('pin saves send the authoritative event and image revision and reject invalid points', async () => {
  const geometry = load('src/domain/site-geometry.ts');
  const calls = [];
  const service = load('src/services/site-geometry.ts', {
    '@/domain/site': load('src/domain/site.ts'),
    '@/domain/site-geometry': geometry,
    '@/services/supabase': { supabase: { rpc: async (name, values) => { calls.push({ name, values }); return { error: null }; } } },
  });
  const map = { event_id: 'event-a', storage_path: 'event-a/revision.jpg' };
  await assert.rejects(service.saveSitePin(map, 'post', 'post-a', { x: 101, y: 50 }), /inside/);
  assert.equal(calls.length, 0);
  await service.saveSitePin(map, 'post', 'post-a', { x: 20, y: 40 });
  assert.equal(calls[0].name, 'set_site_pin');
  assert.equal(calls[0].values.p_event_id, 'event-a');
  assert.equal(calls[0].values.p_expected_path, 'event-a/revision.jpg');
  assert.equal(calls[0].values.p_entity_id, 'post-a');
});

test('a stale image cannot receive a newly measured scale', async () => {
  const geometry = load('src/domain/site-geometry.ts');
  const filters = {};
  const query = { update() { return query; }, eq(key, value) { filters[key] = value; return query; }, select() { return query; }, maybeSingle: async () => ({ data: null, error: null }) };
  const service = load('src/services/site-geometry.ts', { '@/domain/site': load('src/domain/site.ts'), '@/domain/site-geometry': geometry, '@/services/supabase': { supabase: { from: () => query } } });
  const map = { event_id: 'event-a', storage_path: 'event-a/old.jpg', width: 200, height: 100 };
  await assert.rejects(service.saveSiteMapScale(map, { start: { x: 0, y: 0 }, end: { x: 50, y: 0 }, distanceMetres: 100 }), /changed/);
  assert.equal(filters.event_id, 'event-a');
  assert.equal(filters.storage_path, 'event-a/old.jpg');
});

const postDraft = {
  id: 'stable-post-id', kind: 'post', creating: true, name: ' First Aid B ', description: '',
  point: { x: 40, y: 50 }, radiusPercent: null, checkIn: { centre: { x: 42, y: 50 }, radiusPercent: 5 },
  locationId: 'location-a',
};

function mapItemService(rpc) {
  return load('src/services/site-geometry.ts', {
    '@/domain/site': load('src/domain/site.ts'),
    '@/domain/site-geometry': load('src/domain/site-geometry.ts'),
    '@/services/supabase': { supabase: { rpc } },
  });
}

test('post creation sends independent check-in geometry and stable retry IDs under the original image revision', async () => {
  const calls = [];
  const networkError = new Error('Lost reply');
  const service = mapItemService(async (name, values) => {
    calls.push({ name, values });
    return { error: calls.length === 1 ? networkError : null };
  });
  const map = { event_id: 'event-a', storage_path: 'event-a/map.jpg' };
  await assert.rejects(service.saveMapItem(map, postDraft), error => error === networkError);
  await service.saveMapItem(map, postDraft);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  const { name, values } = calls[0];
  assert.equal(name, 'save_location_post');
  assert.equal(values.p_entity_id, 'stable-post-id');
  assert.equal(values.p_expected_path, map.storage_path);
  assert.equal(values.p_name, 'First Aid B');
  assert.equal(values.p_x, 40);
  assert.equal(values.p_check_x, 42);
  assert.equal(values.p_check_radius, 5);
  assert.equal(values.p_location_id, 'location-a');
  assert.equal('p_zone_id' in values, false);
  assert.equal('minimum_coverage' in values, false);
});

test('invalid circles, missing parents and non-post check-in areas are rejected before a write', async () => {
  let calls = 0;
  const service = mapItemService(async () => { calls++; return { error: null }; });
  const map = { event_id: 'event-a', storage_path: 'event-a/map.jpg' };
  await assert.rejects(service.saveMapItem(map, { ...postDraft, radiusPercent: 0 }), /Circle/);
  await assert.rejects(service.saveMapItem(map, { ...postDraft, radiusPercent: Infinity }), /Circle/);
  await assert.rejects(service.saveMapItem(map, { ...postDraft, kind: 'location' }), /check-in/);
  await assert.rejects(service.saveMapItem(map, { ...postDraft, point: null }), /check-in/);
  await assert.rejects(service.saveMapItem(map, { ...postDraft, locationId: null }), /location/);
  await assert.rejects(service.saveMapItem(map, { ...postDraft, checkIn: { centre: { x: -1, y: 50 }, radiusPercent: 5 } }), /check-in/);
  assert.equal(calls, 0);
});

test('clearing map markings explicitly clears circles and check-in areas without changing staffing', async () => {
  let written;
  const service = mapItemService(async (_name, values) => { written = values; return { error: null }; });
  await service.saveMapItem({ event_id: 'event-a', storage_path: 'event-a/map.jpg' }, {
    ...postDraft, creating: false, point: null, radiusPercent: null, checkIn: null,
  });
  assert.equal(written.p_creating, false);
  for (const column of ['p_x', 'p_y', 'p_radius', 'p_check_x', 'p_check_y', 'p_check_radius']) assert.equal(written[column], null);
  assert.equal('p_minimum_coverage' in written, false);
});

test('map drafts retain the image revision and retry ID and stay separate by user/event', () => {
  const stored = new Map();
  const drafts = load('src/services/map-drafts.ts', {
    'expo-sqlite/localStorage/install': {}, '@/domain/site-geometry': load('src/domain/site-geometry.ts'),
  }, { localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) } });
  drafts.keepMapDraft('event-a', 'user-a', { path: 'event-a/old-image.jpg', item: postDraft });
  assert.equal(drafts.getMapDraft('event-a', 'user-a').item.id, 'stable-post-id');
  assert.equal(drafts.getMapDraft('event-a', 'user-a').path, 'event-a/old-image.jpg');
  assert.equal(drafts.getMapDraft('event-a', 'user-b'), null);
  assert.equal(drafts.getMapDraft('event-b', 'user-a'), null);
  drafts.keepMapDraft('event-a', 'user-a', { path: 'event-a/old-image.jpg', item: { ...postDraft, radiusPercent: -1 } });
  assert.throws(() => drafts.getMapDraft('event-a', 'user-a'), /Invalid/);
  drafts.removeMapDraft('event-a', 'user-a');
  assert.equal(drafts.getMapDraft('event-a', 'user-a'), null);
});

test('different staffed tasks can share one location without creating an implicit location', async () => {
  const calls = [];
  const service = mapItemService(async (name, values) => { calls.push({ name, values }); return { error: null }; });
  const map = { event_id: 'event-a', storage_path: 'event-a/map.jpg' };
  await service.saveMapItem(map, { ...postDraft, id: 'ticket-post', name: 'Ticket checking' });
  await service.saveMapItem(map, { ...postDraft, id: 'queue-post', name: 'Queue management' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].values.p_location_id, 'location-a');
  assert.equal(calls[1].values.p_location_id, 'location-a');
  assert.notEqual(calls[0].values.p_entity_id, calls[1].values.p_entity_id);
  for (const call of calls) {
    assert.equal(call.name, 'save_location_post');
    assert.equal(call.values.p_kind, 'post');
    assert.equal('p_zone_name' in call.values, false);
  }
});

test('location lists query the whole event and new locations have no intermediate parent', async () => {
  let filter;
  let inserted;
  const locations = [{ id: 'location-a', event_id: 'event-a', name: 'Gate A' }];
  const query = {
    select() { return query; }, eq(column, value) { filter = { column, value }; return query; },
    order: async () => ({ data: locations, error: null }),
    insert(values) { inserted = values; return query; }, single: async () => ({ data: locations[0], error: null }),
  };
  const service = load('src/services/site.ts', {
    '@/domain/site': load('src/domain/site.ts'),
    '@/services/supabase': { supabase: { from: table => { assert.equal(table, 'locations'); return query; } } },
    'base64-arraybuffer': { decode: () => new ArrayBuffer(1) },
  });
  assert.equal((await service.listLocations('event-a')).length, 1);
  assert.deepEqual(filter, { column: 'event_id', value: 'event-a' });
  await service.createLocation('event-a', { name: 'Gate A', description: '', mapX: '', mapY: '' });
  assert.equal(inserted.event_id, 'event-a');
  assert.equal('zone_id' in inserted, false);
});

test('an old area draft is recovered as a location while preserving geometry and its retry ID', () => {
  const oldArea = { ...postDraft, id: 'old-area-id', kind: 'zone', creating: false,
    name: 'North lawn', radiusPercent: 12, checkIn: null, locationId: null, zoneId: null, zoneName: '' };
  const drafts = load('src/services/map-drafts.ts', {
    'expo-sqlite/localStorage/install': {}, '@/domain/site-geometry': load('src/domain/site-geometry.ts'),
  }, { localStorage: { getItem: () => JSON.stringify({ path: 'event-a/map.jpg', item: oldArea }) } });
  const restored = drafts.getMapDraft('event-a', 'user-a');
  assert.equal(restored.item.kind, 'location');
  assert.equal(restored.item.creating, true);
  assert.equal(restored.item.id, 'old-area-id');
  assert.equal(restored.item.radiusPercent, 12);
  assert.equal(restored.item.point.x, oldArea.point.x);
  assert.equal('zoneId' in restored.item, false);
});
