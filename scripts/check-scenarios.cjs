const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
const { PGlite } = require(process.env.PGLITE_MODULE || '/tmp/ground-control-validation/node_modules/@electric-sql/pglite');
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
    const scenarioModule = new Module(path.join(__dirname,'live-demo-fixture.ts'),module);
    scenarioModule.filename=path.join(__dirname,'live-demo-fixture.ts');
    scenarioModule._compile(ts.transpileModule(fs.readFileSync(scenarioModule.filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scenarioModule.filename);
    const {reserveAccounts,scenarioSql,liveDemoId,rosterDemoId}=scenarioModule.exports;
    await db.exec('reset role');
    for(let i=0;i<reserveAccounts.length;i++){
      const id=`e1000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
      await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,reserveAccounts[i].email,JSON.stringify({display_name:reserveAccounts[i].name})]);ids.push(id);
    }
    await db.exec(scenarioSql(ids,false));await db.exec(scenarioSql(ids,true));
    await db.exec(scenarioSql(ids,false));await db.exec(scenarioSql(ids,true));
    await asWorker();await db.query('select public.process_live_attendance()');
    await asUser(ids[0]);
    const live=(await one('select public.intelligence_snapshot($1) as s',[liveDemoId])).s;
    assert.equal(live.coverage.length,2);assert.equal(live.responses.length,1);
    assert.equal(live.responses[0].resources[0].certificationType,'First Aid');
    assert.equal(live.coverage.find(c=>c.post==='Gate C').checked_in,2);
    const eligible=(await one('select public.response_candidates($1) as c',[live.responses[0].id])).c.filter(c=>c.eligible);
    assert.ok(eligible.some(c=>c.userId===ids[1]),'Sarah can safely replace the absent First Aid holder');
    assert.ok(eligible.some(c=>c.source==='Confirmed standby'),'Qualified standby reserves are available');
    assert.deepEqual((await one('select public.get_event_readiness($1) as r',[rosterDemoId])).r.issues,[]);
    assert.equal((await one('select public.my_event_schedule($1) as s',[rosterDemoId])).s.published,false);
    await asUser(ids[1]);await assert.rejects(()=>db.query('select public.restart_riverside_demo($1)',[liveDemoId]),/Only the prepared/);
    await asUser(ids[0]);const fresh=(await one('select public.restart_riverside_demo($1) as id',[liveDemoId])).id;
    assert.notEqual(fresh,liveDemoId);
    await asWorker();await db.query('select public.process_live_attendance()');
    await asUser(ids[0]);const next=(await one('select public.intelligence_snapshot($1) as s',[fresh])).s;
    assert.equal(next.coverage.length,2);assert.equal(next.responses.length,1);
    assert.equal((await one('select public.live_event_snapshot($1) as s',[liveDemoId])).s.event.status,'completed');
    await assert.rejects(()=>db.query('select public.restart_riverside_demo($1)',[liveDemoId]),/current live demo/);
    console.log('Separate unrostered and active Riverside fixtures apply idempotently; source coverage, no-show recommendation, Sarah and qualified reserves verified.');
  } finally { await db.close(); }
})().catch(error => { console.error(error.message); console.error(error.query ?? error.stack); process.exitCode = 1; });
