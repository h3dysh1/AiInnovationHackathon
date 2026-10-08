const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const fixtureFile = path.join(__dirname, 'demo-fixture.ts');
const fixture = new Module(fixtureFile, module);
fixture._compile(ts.transpileModule(fs.readFileSync(fixtureFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, fixtureFile);
const { demo, demoSql, certificatePdf } = fixture.exports;
(async () => {
  const db = new PGlite();
  try {
    const harness = fs.readFileSync(path.join(__dirname, 'check-setup-database.cjs'), 'utf8');
    await db.exec(harness.match(/await db\.exec\(`(create role anon;[\s\S]*?)`\);/)[1]);
    await db.exec(`create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;`);
    const dir = path.join(root, 'supabase/migrations');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
    const ids = demo.accounts.map((_, i) => `e0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
    for (const [i, id] of ids.entries()) await db.query(
      'insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',
      [id, demo.accounts[i].email, JSON.stringify({ display_name: demo.accounts[i].name })],
    );
    await db.exec(demoSql(ids, certificatePdf().length));
    const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
    const as = async (id, role) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id, role]);
      await db.exec(`set role ${role}`);
    };
    const snapshot = async () => { await as(ids[0], 'authenticated'); return (await one('select public.live_event_snapshot($1) as s', [demo.eventId])).s; };
    const stored = async () => { await db.exec('reset role'); return (await db.query('select assignment_id,status,updated_at from public.check_ins order by assignment_id')).rows; };

    // One shift started inside the 30-minute grace period, one before it; the rest are in the future.
    await db.exec('reset role');
    const shifts = (await db.query('select id from public.shifts where roster_id=$1 order by starts_at,id limit 2', [demo.rosterId])).rows.map(r => r.id);
    await db.query("update public.shifts set starts_at=now()-interval '10 minutes',ends_at=now()+interval '2 hours' where id=$1", [shifts[0]]);
    await db.query("update public.shifts set starts_at=now()-interval '45 minutes',ends_at=now()+interval '2 hours' where id=$1", [shifts[1]]);
    const crew = async shift => (await one('select count(*)::integer as n from public.assignments where shift_id=$1', [shift])).n;
    const late = await crew(shifts[0]), missing = await crew(shifts[1]);
    assert.ok(late > 0 && missing > 0, 'Fixture shifts need assigned crew');
    // One person on the overdue shift did check in.
    const present = await one('select id,user_id from public.assignments where shift_id=$1 limit 1', [shifts[1]]);
    await db.query("insert into public.check_ins(assignment_id,user_id,status,checked_in_at) values($1,$2,'checked_in',now())", [present.id, present.user_id]);

    const before = await stored();
    const derived = await snapshot();
    assert.equal(derived.staffing.late, late);
    assert.equal(derived.staffing.missing, missing - 1);
    assert.equal(derived.staffing.checked_in, 1);
    assert.equal(derived.coverage.reduce((n, c) => n + c.missing, 0), missing - 1);
    assert.deepEqual(await stored(), before, 'Reading the snapshot must not create or change check-in rows');
    assert.equal((await one("select provolatile from pg_proc where proname='live_event_snapshot'")).provolatile, 's', 'Snapshot is declared STABLE, so Postgres rejects writes from it');

    // The worker's stored marking must agree with what the snapshot derived.
    await db.exec('reset role');
    await db.query("update public.events set status='live' where id=$1", [demo.eventId]);
    await as(ids[0], 'service_role');
    await db.query('select public.process_live_attendance()');
    const marked = await snapshot();
    assert.deepEqual(marked.staffing, derived.staffing);
    assert.deepEqual(marked.coverage, derived.coverage);
    const statuses = (await stored()).reduce((n, row) => ({ ...n, [row.status]: (n[row.status] ?? 0) + 1 }), {});
    assert.equal(statuses.late, late);
    assert.equal(statuses.missing, missing - 1);
    console.log('Live snapshot is read-only and derives the same late/missing attendance the worker stores.');
  } finally { await db.close(); }
})().catch(error => { console.error(error.message); console.error(error.query ?? error.stack); process.exitCode = 1; });
