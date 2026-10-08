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
    const one = async (query, args = []) => (await db.query(query, args)).rows[0];
    const asUser = async id => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.query("select set_config('request.jwt.claim.role','authenticated',false)");
      await db.exec('set role authenticated');
    };
    const asWorker = async () => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub','',false)");
      await db.query("select set_config('request.jwt.claim.role','service_role',false)");
      await db.exec('set role service_role');
    };
    const request = 'f0000000-0000-4000-8000-000000000001';
    await asUser(ids[1]);
    const raw = 'Someone dizzy from heat at Water Station B.';
    const incident = (await one('select public.report_incident($1,$2,null,$3) as i', [demo.eventId, raw, request])).i;
    assert.equal(incident.processing_status, 'queued');
    const repeated = (await one('select public.report_incident($1,$2,null,$3) as i', [demo.eventId, raw, request])).i;
    assert.equal(incident.id, repeated.id, 'A lost receipt can be retried without duplicate reports');
    await assert.rejects(() => db.query('select public.report_incident($1,$2,null,$3)', [demo.eventId, 'Different input', request]), /different details/);
    await assert.rejects(() => db.query('select public.claim_incident_processing($1)', [incident.id]), /permission denied|Worker only/);
    await asUser(ids[2]);
    assert.equal((await db.query('select * from public.incidents where id=$1', [incident.id])).rows.length, 0);
    await assert.rejects(() => db.query('select public.retry_incident_processing($1)', [incident.id]), /unavailable/);
    await asUser(ids[0]);
    assert.equal((await one('select public.intelligence_snapshot($1) as s', [demo.eventId])).s.incidents[0].raw_report, raw);
    await asWorker();
    await db.exec('reset role');
    const ticket = (await one('insert into public.incident_worker_wakeups default values returning id')).id;
    const expiredTicket = (await one("insert into public.incident_worker_wakeups(expires_at) values(now()-interval '1 second') returning id")).id;
    await asUser(ids[1]);
    await assert.rejects(() => db.query('select public.consume_incident_wakeup($1)', [ticket]), /permission denied|Worker only/);
    await assert.rejects(() => db.query('select * from public.incident_worker_wakeups'), /permission denied/);
    await asWorker();
    assert.equal((await one('select public.consume_incident_wakeup($1) as ok', [ticket])).ok, true);
    assert.equal((await one('select public.consume_incident_wakeup($1) as ok', [ticket])).ok, false, 'Wakeup tickets are single-use');
    assert.equal((await one('select public.consume_incident_wakeup($1) as ok', [expiredTicket])).ok, false, 'Expired wakeup tickets cannot authorize work');
    let claimed = (await one('select public.claim_incident_processing($1) as i', [incident.id])).i;
    assert.equal(claimed.processing_attempt, 1);
    assert.equal((await one('select public.claim_incident_processing($1) as i', [incident.id])).i, null);
    await one('select public.finish_incident_processing($1,$2,null,$3)', [incident.id, 1, 'Provider unavailable']);
    await asUser(ids[1]);
    let saved = await one('select * from public.incidents where id=$1', [incident.id]);
    assert.equal(saved.raw_report, raw);
    assert.equal(saved.processing_status, 'failed');
    assert.equal(saved.processing_failures, 1);
    assert.equal(saved.processing_error, 'Provider unavailable');
    assert.equal((await db.query('select * from public.incident_processing_history where incident_id=$1', [incident.id])).rows.length, 1);
    await one('select public.retry_incident_processing($1)', [incident.id]);
    await asWorker();
    claimed = (await one('select public.claim_incident_processing($1) as i', [incident.id])).i;
    assert.equal(claimed.processing_attempt, 2);
    assert.equal((await one('select public.finish_incident_processing($1,1,null,null) as ok', [incident.id])).ok, false, 'Stale worker cannot finish a newer attempt');
    assert.equal((await one('select public.finish_incident_processing($1,2,null,null) as ok', [incident.id])).ok, true);
    assert.equal((await one('select public.finish_incident_processing($1,2,null,null) as ok', [incident.id])).ok, false, 'Repeated completion has no side effects');
    await asUser(ids[0]);
    saved = await one('select * from public.incidents where id=$1', [incident.id]);
    assert.equal(saved.category, 'heat');
    assert.equal(saved.summary, raw);
    assert.equal(saved.processing_status, 'complete');
    assert.equal(saved.status, 'needs_review');
    assert.equal(saved.raw_report, raw);
    const plan = (await one('select public.propose_response($1,null) as r', [incident.id])).r;
    for (let n = 0; n < 2; n++) await assert.rejects(() => db.query('select public.approve_response($1,$2,$3)', [plan.id, plan.revision, '[]']), /current completed response draft/);
    assert.equal((await one('select public.intelligence_snapshot($1) as s', [demo.eventId])).s.responses[0].status, 'proposed');
    await db.exec('reset role');
    assert.equal((await one('select count(*)::int as n from public.dispatch_requests')).n, 0);
    // Receipt survives an unavailable webhook; cron can recover it later.
    await db.exec(`create or replace function public.wake_incident_worker() returns void language plpgsql as $$ begin raise exception 'Network unavailable'; end $$;`);
    await asUser(ids[1]);
    const audioId = 'f0000000-0000-4000-8000-000000000002';
    const audioPath = `${ids[1]}/${demo.eventId}/${audioId}.m4a`;
    await db.query("insert into storage.objects(bucket_id,name) values('incident-audio',$1)", [audioPath]);
    const voiceArgs = [demo.eventId, audioPath, 'audio/mp4', 100, 'At Water B, two people need help.', audioId];
    const voice = (await one('select public.report_voice_incident($1,$2,$3,$4,null,$5,$6) as i', voiceArgs)).i;
    assert.equal((await one('select public.report_voice_incident($1,$2,$3,$4,null,$5,$6) as i', voiceArgs)).i.id, voice.id);
    await db.query("delete from storage.objects where bucket_id='incident-audio' and name=$1", [audioPath]);
    assert.equal((await db.query('select * from storage.objects where name=$1', [audioPath])).rows.length, 1, 'Referenced audio is immutable');
    await asWorker();
    claimed = (await one('select public.claim_incident_processing($1) as i', [voice.id])).i;
    await one('select public.finish_incident_processing($1,$2,$3,null)', [voice.id, claimed.processing_attempt, 'Two people dizzy from heat at Water Station B.']);
    await asUser(ids[0]);
    saved = await one('select * from public.incidents where id=$1', [voice.id]);
    assert.equal(saved.raw_report, voiceArgs[4], 'Original written context remains intact');
    assert.equal(saved.transcript, 'Two people dizzy from heat at Water Station B.');
    assert.equal(saved.people_affected, 2);
    const firstRisk = (await one('select public.detect_risk($1) as r', [demo.eventId])).r;
    assert.equal((await one('select public.detect_risk($1) as r', [demo.eventId])).r.id, firstRisk.id, 'Repeated risk checks do not append duplicate alerts');
    // A dead worker lease is reclaimed and recorded; auto retries stop after three failures.
    await one('select public.retry_incident_processing($1)', [voice.id]);
    await asWorker();
    claimed = (await one('select public.claim_incident_processing($1) as i', [voice.id])).i;
    await db.exec('reset role');
    await db.query("update public.incidents set processing_lease_until=now()-interval '1 minute' where id=$1", [voice.id]);
    await asWorker();
    const reclaimed = (await one('select public.claim_incident_processing($1) as i', [voice.id])).i;
    assert.equal(reclaimed.processing_attempt, claimed.processing_attempt + 1);
    assert.equal((await one('select public.finish_incident_processing($1,$2,null,null) as ok', [voice.id, claimed.processing_attempt])).ok, false);
    await one('select public.finish_incident_processing($1,$2,null,$3)', [voice.id, reclaimed.processing_attempt, 'Quota exceeded']);
    await db.exec('reset role');
    await db.query('update public.incidents set processing_next_at=now() where id=$1', [voice.id]);
    await asWorker();
    claimed = (await one('select public.claim_incident_processing($1) as i', [voice.id])).i;
    await one('select public.finish_incident_processing($1,$2,null,$3)', [voice.id, claimed.processing_attempt, 'Quota exceeded']);
    assert.equal((await one('select public.claim_incident_processing($1) as i', [voice.id])).i, null);
    await asUser(ids[0]);
    saved = await one('select * from public.incidents where id=$1', [voice.id]);
    assert.equal(saved.processing_failures, 3);
    assert.equal(saved.raw_report, voiceArgs[4]);
    await one('select public.resolve_incident($1,$2)', [voice.id, 'Local test resolved']);
    await assert.rejects(() => db.query('select public.retry_incident_processing($1)', [voice.id]), /resolved/);
    console.log('Incident receipt/retry idempotence, role isolation, raw/audio/context preservation, SQL analysis/risk execution, stale leases, bounded retries and guarded dispatch passed.');
  } finally { await db.close(); }
})().catch(error => { console.error(error.message); console.error(error.query ?? error.stack); process.exitCode = 1; });
