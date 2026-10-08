const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const Module = require('node:module'), ts = require('typescript');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
function load(file) {
  const m = new Module(path.join(__dirname, file), module);
  m.filename = path.join(__dirname, file);
  m._compile(ts.transpileModule(fs.readFileSync(m.filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, m.filename);
  return m.exports;
}
(async () => {
  const db = new PGlite();
  try {
    const harness = fs.readFileSync(path.join(__dirname, 'check-setup-database.cjs'), 'utf8');
    await db.exec(harness.match(/await db\.exec\(`(create role anon;[\s\S]*?)`\);/)[1]);
    await db.exec(`create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;`);
    const dir = path.join(__dirname, '../supabase/migrations');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
    const { demo, demoSql, certificatePdf } = load('demo-fixture.ts');
    const { scenarioSql, liveDemoId, reserveAccounts } = load('live-demo-fixture.ts');
    const ids = [...demo.accounts, ...reserveAccounts].map((_, i) => `c0000000-0000-4000-8000-${String(i + 1).padStart(12,'0')}`);
    for (const id of ids) await db.query('insert into auth.users(id) values($1)', [id]);
    await db.exec(demoSql(ids.slice(0, demo.accounts.length), certificatePdf().length));
    await db.exec(scenarioSql(ids, true));
    const one = async (sql, args = []) => (await db.query(sql,args)).rows[0];
    async function asUser(id, role = 'authenticated') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]);
      await db.exec(`set role ${role}`);
    }
    // Setup map provenance is event scoped, and replacement invalidates an old candidate.
    await asUser(ids[0]);
    const map = await one('insert into public.event_maps(event_id,storage_path,width,height,uploaded_by) values($1,$2,100,100,$3) returning id', [demo.eventId, `${demo.eventId}/first.jpg`,ids[0]]);
    const job = (await one('select public.enqueue_setup_job($1,gen_random_uuid()) as id',[demo.eventId])).id;
    await db.query('select public.claim_setup_job($1)',[job]);
    const context = (await one('select public.get_setup_ai_context($1) as c',[job])).c;
    assert.equal(context.site_map.id,map.id);
    // Internal helper: revoked from app roles, so check it as the database owner.
    await db.exec('reset role');
    assert.equal((await one('select public.setup_source_valid($1,$2) as valid',[demo.eventId,JSON.stringify({sourceType:'document',sourceId:map.id})])).valid,true);
    assert.equal((await one('select public.setup_source_valid($1,$2) as valid',[liveDemoId,JSON.stringify({sourceType:'document',sourceId:map.id})])).valid,false);
    await asUser(ids[0]);
    await db.query('update public.event_maps set storage_path=$1 where id=$2',[`${demo.eventId}/replacement.jpg`,map.id]);
    await assert.rejects(()=>db.query('select public.get_setup_ai_context($1)',[job]),/Setup changed/);
    await asUser(ids[1]);
    await assert.rejects(()=>db.query('select public.get_setup_ai_context($1)',[job]),/unavailable/);
    await db.exec('reset role');
    await db.query("update public.setup_ai_jobs set updated_at=now()-interval '6 minutes' where id=$1",[job]);
    await asUser('', 'service_role');
    await db.query('select public.recover_setup_jobs()');
    await asUser(ids[0]);
    assert.equal((await one('select status from public.setup_ai_jobs where id=$1',[job])).status,'failed');
    await db.query("select public.finish_setup_job($1,1,'{}',null)",[job]);
    assert.equal((await one('select status from public.setup_ai_jobs where id=$1',[job])).status,'failed','Late completion cannot overwrite interrupted state');
    // Real assignment check-in RPC, no location or privileged attendance write.
    await asUser(ids[2]); // Alex is the fixture's missing First Aid volunteer.
    const alex = (await one('select public.my_live_assignments($1) as a',[liveDemoId])).a.find(a=>a.status==='scheduled');
    assert.ok(alex);
    await asUser(ids[1]);
    await assert.rejects(()=>db.query("select public.set_check_in($1,'check_in')",[alex.assignment_id]),/unavailable/);
    await asUser(ids[2]);
    await db.query("select public.set_check_in($1,'check_in')",[alex.assignment_id]);
    await db.query("select public.set_check_in($1,'check_in')",[alex.assignment_id]);
    assert.equal((await one('select public.my_live_assignments($1) as a',[liveDemoId])).a.find(a=>a.assignment_id===alex.assignment_id).status,'checked_in');
    await db.query("select public.set_check_in($1,'check_out')",[alex.assignment_id]);
    // Simulate absence in this local fixture, then let the scheduled worker detect it.
    await db.exec('reset role');
    await db.query("update public.check_ins set status='scheduled',checked_in_at=null,checked_out_at=null where assignment_id=$1",[alex.assignment_id]);
    await asUser('', 'service_role');
    await db.query('select public.process_live_attendance()');
    await db.query('select public.process_live_attendance()');
    await asUser(ids[0]);
    let snapshot = (await one('select public.intelligence_snapshot($1) as s',[liveDemoId])).s;
    const responses = snapshot.responses.filter(r=>r.coverage_shift_id);
    assert.equal(responses.length,1);
    const response=responses[0];
    assert.equal(response.resources[0].certificationType,'First Aid');
    assert.equal(snapshot.dispatches.length,0,'Detection does not move crew before approval');
    const candidates = (await one('select public.response_candidates($1) as c',[response.id])).c;
    assert.equal(candidates.find(c=>c.userId===ids[1]).eligible,true,'Sarah can leave surplus Gate C coverage');
    const selection=JSON.stringify([{userId:ids[1],resourceIndex:0}]);
    await db.query('select public.approve_response($1,$2,$3)',[response.id,response.revision,selection]);
    await db.query('select public.approve_response($1,$2,$3)',[response.id,response.revision,selection]);
    await asUser(ids[1]);
    const dispatch=(await one('select public.my_dispatch_requests($1) as d',[liveDemoId])).d[0];
    for (const state of ['accepted','en_route','arrived']) await db.query('select public.update_dispatch($1,$2)',[dispatch.id,state]);
    await asUser(ids[0]);
    snapshot = (await one('select public.intelligence_snapshot($1) as s',[liveDemoId])).s;
    assert.equal(snapshot.dispatches.length,1);
    assert.equal(snapshot.coverage.find(c=>c.post==='Gate C').checked_in,1);
    assert.equal(snapshot.coverage.find(c=>c.post==='Water Station B').checked_in,2);
    console.log('Setup map/source isolation, stale-candidate/recovery guards, GPS-free own check-in/out, no-show recommendation and approved coverage-safe replacement through arrival passed.');
  } finally { await db.close(); }
})().catch(error=>{ console.error(error.message); console.error(error.stack); process.exitCode=1; });
