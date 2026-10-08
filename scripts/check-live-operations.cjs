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
    await db.exec('reset role');
    const source=(await one('select id from public.shifts where roster_id=$1 order by starts_at limit 1',[demo.rosterId])).id;
    await db.query("update public.events set start_date=current_date,end_date=current_date,status='live',timezone='UTC',no_show_grace_minutes=0 where id=$1",[demo.eventId]);
    await db.query("update public.shifts set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour',minimum_coverage=2 where id=$1",[source]);
    await db.query("insert into public.check_ins(assignment_id,user_id,status,checked_in_at) select id,user_id,'checked_in',now() from public.assignments where shift_id=$1",[source]);
    await db.query('delete from public.volunteer_availability where event_id=$1',[demo.eventId]);
    for (const uid of ids.slice(1)) await db.query("insert into public.volunteer_availability(event_id,user_id,starts_at,ends_at) values($1,$2,now()-interval '2 hours',now()+interval '2 hours')",[demo.eventId,uid]);
    const post=(await one("insert into public.posts(event_id,location_id,name,minimum_coverage,instructions,supervisor,escalation) values($1,$2,'Gate C',1,'Observe access','Mo','Radio 1') returning id",[demo.eventId,demo.locationId])).id;
    const target=(await one("insert into public.shifts(event_id,roster_id,post_id,starts_at,ends_at,minimum_coverage,requirements,criticality) values($1,$2,$3,now()-interval '1 hour',now()+interval '1 hour',1,'[]','important') returning id",[demo.eventId,demo.rosterId,post])).id;
    await asUser(ids[1]);
    const incident=(await one("select public.report_incident($1,'Crowd at Gate C',null,gen_random_uuid()) as i",[demo.eventId])).i;
    await asWorker();
    const job=(await one('select public.claim_incident_processing($1) as j',[incident.id])).j;
    const ctx=(await one('select public.incident_intelligence_context($1) as c',[incident.id])).c;
    assert.equal(ctx.incident.raw_report,'Crowd at Gate C');assert.equal(ctx.coverage.length,2);
    const analysis={category:'crowding',severity:'high',locationId:demo.locationId,peopleAffected:5,summary:'Crowd at Gate C',confidence:.9,evidence:'Volunteer reports crowd at the gate',needsReview:false};
    await db.query('select public.persist_incident_ai($1,$2,null,$3,$4,$5,null,$6)',[incident.id,job.processing_attempt,JSON.stringify(analysis),'[]','[]','test-model']);
    await asUser(ids[0]);
    assert.equal((await one('select status from public.incidents where id=$1',[incident.id])).status,'open');
    await asUser(ids[0]);
    let plan=(await one('select public.propose_response($1,null) as p',[incident.id])).p;
    await db.query('select public.modify_response($1,$2,$3,$4,$5,$6)',[plan.id,plan.revision,target,'Attend Gate C and confirm with Mo',JSON.stringify([{label:'First Aid support',count:1,certificationType:'HLTAID011',experienceRequirement:null}]),JSON.stringify(['Assess the report with Mo'])]);
    plan=(await one('select public.intelligence_snapshot($1) as s',[demo.eventId])).s.responses.find(r=>r.id===plan.id);
    let candidates=(await one('select public.response_candidates($1) as c',[plan.id])).c;
    assert.match(candidates.find(c=>c.userId===ids[1]).reason,/source qualification coverage/);
    await assert.rejects(()=>db.query('select public.approve_response($1,$2,$3)',[plan.id,plan.revision,JSON.stringify([{userId:ids[1],resourceIndex:0}])]),/source qualification coverage/);
    await db.exec('reset role');
    await db.query("insert into public.certifications(id,user_id,title,storage_path,mime_type,size_bytes,status,type,holder_name,issued_at,expires_at) values('a0000000-0000-4000-8000-000000000001',$1,'Synthetic Alex',$1::uuid::text||'/a0000000-0000-4000-8000-000000000001/alex.pdf','application/pdf',100,'verified','First Aid','Alex Demo','2026-01-01','2028-12-31')",[ids[2]]);
    await asUser(ids[0]);
    candidates=(await one('select public.response_candidates($1) as c',[plan.id])).c;
    assert.equal(candidates.find(c=>c.userId===ids[1]).eligible,true);
    // Two individually feasible people cannot be moved together if the combined move strips First Aid coverage.
    await db.query('select public.modify_response($1,$2,$3,$4,$5,$6)',[plan.id,plan.revision,target,'Attend Gate C',JSON.stringify([{label:'First Aid support',count:2,certificationType:'HLTAID011',experienceRequirement:null}]),JSON.stringify(['Assess with Mo'])]);
    plan=(await one('select public.intelligence_snapshot($1) as s',[demo.eventId])).s.responses.find(r=>r.id===plan.id);
    await assert.rejects(()=>db.query('select public.approve_response($1,$2,$3)',[plan.id,plan.revision,JSON.stringify([{userId:ids[1],resourceIndex:0},{userId:ids[2],resourceIndex:0}])]),/source qualification coverage/);
    assert.equal((await one('select public.intelligence_snapshot($1) as s',[demo.eventId])).s.dispatches.length,0,'Group rejection rolls back every move');
    await db.query('select public.modify_response($1,$2,$3,$4,$5,$6)',[plan.id,plan.revision,target,'Attend Gate C',JSON.stringify([{label:'First Aid support',count:1,certificationType:'HLTAID011',experienceRequirement:null}]),JSON.stringify(['Assess with Mo'])]);
    plan=(await one('select public.intelligence_snapshot($1) as s',[demo.eventId])).s.responses.find(r=>r.id===plan.id);
    await asUser(ids[2]);
    await assert.rejects(()=>db.query('select public.approve_response($1,$2,$3)',[plan.id,plan.revision,'[]']),/unavailable/);
    await asUser(ids[0]);
    const selection=JSON.stringify([{userId:ids[1],resourceIndex:0}]);
    await db.query('select public.approve_response($1,$2,$3)',[plan.id,plan.revision,selection]);
    await db.query('select public.approve_response($1,$2,$3)',[plan.id,plan.revision,selection]);
    await db.exec('reset role');
    const dispatch=(await one('select * from public.dispatch_requests where response_plan_id=$1',[plan.id]));
    assert.equal((await one('select count(*)::int n from public.dispatch_requests where response_plan_id=$1',[plan.id])).n,1);
    assert.equal((await one('select public.intelligence_snapshot($1) as s',[demo.eventId])).s.coverage.find(c=>c.shift_id===source).checked_in,3);
    await asUser(ids[1]);
    await assert.rejects(()=>db.query("select public.update_dispatch($1,'arrived')",[dispatch.id]),/next response status/);
    for(const status of ['accepted','en_route','arrived','completed']) await db.query('select public.update_dispatch($1,$2)',[dispatch.id,status]);
    assert.equal((await one('select public.my_live_assignments($1) as a',[demo.eventId])).a.find(a=>a.assignment_id===dispatch.assignment_id).status,'completed');
    await asUser(ids[0]);
    await db.query('select public.complete_response($1,$2)',[plan.id,'Support task complete']);
    await db.query('select public.resolve_incident($1,$2)',[incident.id,'Crowd resolved with human review']);
    await db.query('select public.request_event_summary($1)',[demo.eventId]);
    await asWorker();
    const summary=(await one('select public.claim_event_summary() as j')).j;
    await db.query('select public.finish_event_summary($1,$2,$3,null)',[demo.eventId,summary.attempt,'Reviewed synthetic operational summary']);
    await db.exec('reset role');
    await db.query("update public.check_ins set status='scheduled' where assignment_id in(select id from public.assignments where shift_id=$1 and user_id=$2)",[source,ids[2]]);
    await asWorker();
    await db.query('select public.process_live_attendance()');
    await db.query('select public.process_live_attendance()');
    await asUser(ids[0]);
    const replacements=(await one('select public.intelligence_snapshot($1) as s',[demo.eventId])).s.responses.filter(r=>r.coverage_shift_id===source);
    assert.equal(replacements.length,1,'No-show recommendation is deduplicated');
    assert.equal(replacements[0].resources[0].certificationType,'First Aid');
    await db.query('select public.dismiss_response($1,$2)',[replacements[0].id,replacements[0].revision]);
    await asUser(ids[0]);
    assert.equal((await one('select public.event_summary_status($1) as s',[demo.eventId])).s.status,'complete');
    await db.query('select public.close_event($1,$2)',[demo.eventId,'Reviewed synthetic operational summary']);
    console.log('Live AI persistence, coverage-protected selection, atomic idempotent reassignment, role isolation, dispatch transitions, resolution and reviewed closeout passed.');
  } finally { await db.close(); }
})().catch(error => { console.error(error.message); console.error(error.query ?? error.stack); process.exitCode = 1; });
