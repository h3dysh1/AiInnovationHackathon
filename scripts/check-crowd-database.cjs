// Camera crowd readings: permissions, sustained-crowding alerts, de-duplication,
// escalation, the crowd snapshot and combined heat + crowd risk detection.
// Runs every migration against real PostgreSQL (PGlite), like check-setup-database.cjs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(
  process.env.PGLITE_MODULE || '@electric-sql/pglite',
);
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;
 grant usage on schema public,auth,storage to authenticated,anon,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;`);
  const dir = path.join(__dirname, '../supabase/migrations');
  const migrations = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations) await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
  await db.exec(fs.readFileSync(path.join(dir, '202610070019_crowd_readings.sql'), 'utf8'));
  console.log('All migrations apply; 019 reruns safely.');

  const mo = '11111111-1111-4111-8111-111111111111',
    vol = '22222222-2222-4222-8222-222222222222',
    other = '33333333-3333-4333-8333-333333333333';
  await db.query(
    `insert into auth.users(id,email) values($1,'mo@example.com'),($2,'vol@example.com'),($3,'other@example.com')`,
    [mo, vol, other],
  );
  await db.query(`update public.account_roles set role='coordinator' where user_id in ($1,$2)`, [mo, other]);
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const one = async (sql, args = []) => (await query(sql, args))[0];
  async function asUser(id) {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]);
    await db.exec('set role authenticated');
  }
  async function asAdmin() { await db.exec('reset role'); }

  await asUser(mo);
  const org = (await one(`insert into public.organisations(name,created_by) values('Riverside Crew',$1) returning id`, [mo])).id;
  const event = (await one(
    `insert into public.events(organisation_id,name,venue_name,start_date,end_date,operating_start_time,operating_end_time,timezone,created_by) values($1,'Riverside 2026','Riverside Park','2026-12-12','2026-12-14','09:00','23:00','Australia/Melbourne',$2) returning id`,
    [org, mo],
  )).id;
  await asAdmin();
  const bridge = (await one(
    `insert into public.locations(event_id,name,map_x,map_y,map_radius_percent) values($1,'Footbridge',48,82,6) returning id`, [event],
  )).id;
  const lawn = (await one(`insert into public.locations(event_id,name,map_x,map_y) values($1,'Lawn Stage',25,30) returning id`, [event])).id;

  const record = (people, trend, secondsAgo, extra = {}) => one(
    `select public.record_crowd_reading($1,'footbridge-cam-1',$2,240,$3,$4,0.8,null,'footbridge',now()-make_interval(secs=>$5)) as r`,
    [event, people, trend, extra.counterflow ?? 0.2, secondsAgo],
  ).then((row) => row.r);

  // Permissions: a volunteer and a coordinator of another event cannot record or read.
  for (const user of [vol, other]) {
    await asUser(user);
    await assert.rejects(() => record(500, 'steady', 0), /cannot record crowd readings/);
    await assert.rejects(() => one('select public.crowd_snapshot($1)', [event]), /cannot view crowd readings/);
    await assert.rejects(() => query('insert into public.crowd_readings(event_id,location_id,camera_id,captured_at,people,area_m2,density,trend) values($1,$2,$3,now(),1,1,1,$4)', [event, bridge, 'x', 'steady']), /permission denied/);
  }

  await asUser(mo);
  // Validation.
  await assert.rejects(() => one(`select public.record_crowd_reading($1,'cam',10,240,'steady',null,null,null,'Nowhere')`, [event]), /location not found/);
  await assert.rejects(() => one(`select public.record_crowd_reading($1,'cam',10,0,'steady',null,null,null,'Footbridge')`, [event]), /Invalid camera area/);
  await assert.rejects(() => one(`select public.record_crowd_reading($1,'cam',9000,240,'steady',null,null,null,'Footbridge')`, [event]), /implausible/);
  await assert.rejects(() => one(`select public.record_crowd_reading($1,'cam',10,240,'sideways',null,null,null,'Footbridge')`, [event]), /Invalid crowd trend/);

  // Calm readings never alert.
  for (const s of [60, 50, 40]) assert.equal((await record(300, 'steady', s)).alert, null);
  // A single spike never alerts: sustained density is the minimum of the last 3 readings.
  let r = await record(1300, 'rising', 30);
  assert.equal(r.reading.density, 5.42);
  assert.equal(r.alert, null);
  // Sustained medium crowding while rising -> one medium alert.
  await record(780, 'rising', 20);
  await record(800, 'rising', 10);
  r = await record(820, 'rising', 0);
  assert.equal(r.alert.severity, 'medium');
  assert.equal(r.alert.category, 'crowding');
  assert.equal(r.alert.source, 'camera');
  assert.equal(r.alert.location_id, bridge);
  assert.match(r.alert.title, /Crowding at Footbridge/);
  const alertId = r.alert.id;
  // Further readings update the same alert instead of creating duplicates, and escalate to high.
  for (const s of [-2, -4, -6]) r = await record(1000, 'rising', s, { counterflow: 0.7 });
  assert.equal(r.alert.id, alertId);
  assert.equal(r.alert.severity, 'high');
  assert.match(r.alert.explanation, /opposing crowd flows/);
  assert.ok(r.alert.evidence.length <= 10);
  // Easing crowds never silently downgrade an open alert; a person resolves it.
  for (const s of [-8, -10, -12]) r = await record(300, 'falling', s);
  assert.equal(r.alert.severity, 'high');
  assert.match(r.alert.explanation, /falling/);
  await asAdmin();
  assert.equal((await one(`select count(*)::int n from public.risk_alerts where event_id=$1 and category='crowding'`, [event])).n, 1);
  assert.equal((await one(`select count(*)::int n from public.operational_timeline where event_id=$1 and event_type in ('risk_detected','risk_escalated')`, [event])).n, 2);
  await asUser(mo);

  // Snapshot: every location (camera-covered or not), latest reading, recent history, open crowd alerts.
  const snap = (await one('select public.crowd_snapshot($1) as s', [event])).s;
  assert.equal(snap.locations.length, 2);
  const fb = snap.locations.find((l) => l.name === 'Footbridge');
  assert.equal(fb.latest.density, 1.25);
  assert.equal(fb.latest.recorded_by, undefined);
  assert.ok(fb.recent.length > 5);
  assert.equal(snap.locations.find((l) => l.name === 'Lawn Stage').latest, null);
  assert.equal(snap.alerts.length, 1);
  // The existing human-approved response flow accepts a camera alert.
  const plan = (await one('select public.propose_response(null,$1) as p', [alertId])).p;
  assert.equal(plan.status, 'proposed');
  assert.match(plan.rationale, /Crowding at Footbridge/);
  assert.ok(plan.actions.some((a) => /crowd marshals/.test(a)));

  // detect_risk: heat reports at a crowded place are raised one level, and re-checks do not duplicate.
  await asAdmin();
  for (const text of ['girl fainted at the footbridge', 'dizzy man near footbridge']) {
    await query(
      `insert into public.incidents(event_id,reporter_id,raw_report,status,category,severity,location_id) values($1,$2,$3,'open','heat','high',$4)`,
      [event, vol, text, bridge],
    );
  }
  await asUser(mo);
  await record(900, 'rising', -14);
  let risk = (await one('select public.detect_risk($1) as r', [event])).r;
  assert.equal(risk.severity, 'high'); // 2 heat reports = medium, + crowded footbridge = high
  assert.equal(risk.location_id, bridge);
  assert.equal(risk.source, 'reports_and_camera');
  assert.match(risk.explanation, /mostly at Footbridge/);
  assert.match(risk.explanation, /Camera shows 3\.75 people\/m²/);
  const again = (await one('select public.detect_risk($1) as r', [event])).r;
  assert.equal(again.id, risk.id);
  await asAdmin();
  assert.equal((await one(`select count(*)::int n from public.risk_alerts where event_id=$1 and category='heat'`, [event])).n, 1);

  // Without crowding, heat at the Lawn Stage stays medium.
  await asAdmin();
  await query(`update public.incidents set status='resolved' where event_id=$1`, [event]);
  for (const text of ['heat stroke at lawn stage', 'faint person lawn stage']) {
    await query(
      `insert into public.incidents(event_id,reporter_id,raw_report,status,category,severity,location_id) values($1,$2,$3,'open','heat','high',$4)`,
      [event, vol, text, lawn],
    );
  }
  await asUser(mo);
  risk = (await one('select public.detect_risk($1) as r', [event])).r;
  assert.equal(risk.severity, 'medium');
  assert.equal(risk.source, 'reports');
  assert.equal(risk.location_id, lawn);

  console.log('Crowd readings: permissions, validation, sustained alerts, de-duplication, escalation without silent downgrade, snapshot, human response flow and combined heat + crowd risk passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
