const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const { PGlite } = require(process.env.PGLITE_MODULE || '/tmp/ground-control-validation/node_modules/@electric-sql/pglite');
const filename = path.join(__dirname, 'demo-fixture.ts');
const fixture = new Module(filename, module);
fixture._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { demo, certificatePdf, demoSql } = fixture.exports;

(async () => {
  const db = new PGlite();
  try {
    // Reuse the migration harness's minimal Supabase auth/storage schemas.
    const harness = fs.readFileSync(path.join(__dirname, 'check-setup-database.cjs'), 'utf8');
    const schema = harness.match(/await db\.exec\(`(create role anon;[\s\S]*?)`\);/)[1];
    await db.exec(schema);
    await db.exec(`create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;`);
    const migrations = path.join(__dirname, '../supabase/migrations');
    for (const file of fs.readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
    }
    const ids = demo.accounts.map((_, i) => `e0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
    for (const [i, id] of ids.entries()) {
      await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
        id, demo.accounts[i].email, JSON.stringify({ display_name: demo.accounts[i].name }),
      ]);
    }
    const pdf = certificatePdf();
    assert.match(pdf.toString(), /SYNTHETIC DEMO CERTIFICATE/);
    await db.query("insert into storage.objects(bucket_id,name) values('certificates',$1)", [
      `${ids[1]}/${demo.certificateId}/demo-first-aid.pdf`,
    ]);
    await db.exec(demoSql(ids, pdf.length));
    const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
    const asUser = async id => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
    };
    await asUser(ids[0]);
    const ready = (await one('select public.get_roster_readiness($1) as r', [demo.rosterId])).r;
    assert.equal(ready.ready, true, JSON.stringify(ready));
    assert.equal((await one('select status from public.events where id=$1', [demo.eventId])).status, 'published');
    const snapshot = (await one('select public.live_event_snapshot($1) as s', [demo.eventId])).s;
    assert.equal(snapshot.staffing.assigned, 24);
    assert.equal(snapshot.staffing.checked_in, 0);
    await asUser(ids[1]);
    const schedule = (await one('select public.my_event_schedule($1) as s', [demo.eventId])).s;
    assert.equal(schedule.published, true);
    assert.equal(schedule.shifts.length, 6);
    assert.equal((await one('select status from public.certifications where id=$1', [demo.certificateId])).status, 'verified');
    assert.equal((await one('select count(*)::integer as n from public.assignments')).n, 0, 'Volunteer cannot read crew assignments');
    await assert.rejects(() => db.query('select public.get_event_readiness($1)', [demo.eventId]), /cannot review/);
    await assert.rejects(() => db.query('select public.live_event_snapshot($1)', [demo.eventId]), /cannot view/);
    const outsider = 'f0000000-0000-4000-8000-000000000001';
    await db.exec('reset role');
    await db.query("insert into auth.users(id,email) values($1,'outsider@example.com')", [outsider]);
    await asUser(outsider);
    assert.equal((await one('select count(*)::integer as n from public.certifications')).n, 0);
    assert.equal((await one('select count(*)::integer as n from public.events')).n, 0);
    await db.exec('reset role');
    await db.query('insert into public.incidents(event_id,reporter_id,raw_report) values($1,$2,$3)', [demo.eventId, ids[1], 'Demo original report persists after repeat seed.']);
    await db.exec(demoSql(ids, pdf.length));
    assert.equal((await one('select count(*)::integer as n from public.events')).n, 1);
    assert.equal((await one('select count(*)::integer as n from public.assignments')).n, 24);
    assert.equal((await one('select count(*)::integer as n from public.incidents')).n, 1);
    assert.equal((await one('select count(*)::integer as n from storage.objects')).n, 1);
    console.log('Demo seed passed: valid certificate, fully covered published roster, six Sarah shifts, role isolation, private evidence and repeat-seed history retention.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
