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
    await asUser(ids[1]);
    const first=(await one("select public.report_incident($1,'Dizzy at Water B',null,gen_random_uuid()) as i",[demo.eventId])).i;
    const second=(await one("select public.report_incident($1,'Water B water supply broken',null,gen_random_uuid()) as i",[demo.eventId])).i;
    const analysis={category:'heat',severity:'high',locationId:demo.locationId,peopleAffected:2,summary:'Two people dizzy at Water B',confidence:.9,evidence:'Volunteer report identifies heat symptoms at Water B',needsReview:false};
    const advance=async(job,relations=[],risks=[],error=null)=>db.query('select public.advance_incident_intelligence($1,$2,null,$3,$4,$5,$6,$7)',[job.id,job.processing_attempt,JSON.stringify(analysis),JSON.stringify(relations),JSON.stringify(risks),error,'test-model']);
    await asWorker();
    let job=(await one('select public.claim_incident_processing($1) as j',[first.id])).j;
    assert.equal(job.intelligence_stage,'interpret');await advance(job);
    job=(await one('select public.claim_incident_processing($1) as j',[first.id])).j;
    assert.equal(job.intelligence_stage,'correlate');assert.equal(job.validated_analysis.summary,analysis.summary);
    await advance(job,[],[],'AI unavailable');
    await asUser(ids[0]);await db.query('select public.retry_incident_processing($1)',[first.id]);
    await asWorker();job=(await one('select public.claim_incident_processing($1) as j',[first.id])).j;
    assert.equal(job.intelligence_stage,'correlate','Retry resumes saved stage');
    const relation={relatedIncidentId:second.id,relationType:'related',confidence:.9,explanation:'Water outage and heat symptoms in same area'};
    await advance(job,[relation]);
    job=(await one('select public.claim_incident_processing($1) as j',[first.id])).j;assert.equal(job.intelligence_stage,'risk');
    const risk={kind:'heat',locationId:demo.locationId,title:'Emerging heat risk',explanation:'Heat symptoms and loss of water supply',severity:'high',confidence:.9,incidentIds:[first.id,second.id],observationIds:[],shiftIds:[]};
    await advance(job,[],[risk]);
    await asUser(ids[0]);
    let snap=(await one('select public.intelligence_snapshot($1) as s',[demo.eventId])).s;
    assert.equal(snap.risks.length,1);assert.equal(snap.relations.length,1);
    await db.query('select public.retry_incident_processing($1)',[first.id]);
    await asWorker();job=(await one('select public.claim_incident_processing($1) as j',[first.id])).j;await advance(job,[],[risk]);
    await asUser(ids[0]);snap=(await one('select public.intelligence_snapshot($1) as s',[demo.eventId])).s;assert.equal(snap.risks.length,1,'Risk refresh updates active risk');
    const plan=(await one('select public.propose_response($1,null) as p',[first.id])).p;
    await asWorker();let responseJob=(await one('select public.claim_response_processing() as j')).j;
    assert.equal(responseJob.planning_stage,'retrieve');
    const context=(await one('select public.response_ai_context($1) as c',[plan.id])).c;
    await assert.rejects(()=>db.query('select public.finish_response_retrieval($1,$2,$3)',[plan.id,responseJob.processing_attempt,JSON.stringify(['a0000000-0000-4000-8000-000000000099'])]),/Unknown event procedure/);
    await db.query('select public.finish_response_retrieval($1,$2,$3)',[plan.id,responseJob.processing_attempt,JSON.stringify([context.procedures[0].id])]);
    responseJob=(await one('select public.claim_response_processing() as j')).j;assert.equal(responseJob.planning_stage,'draft');
    await db.query('select public.finish_response_processing($1,$2,$3,null)',[plan.id,responseJob.processing_attempt,JSON.stringify({title:'Grounded support',rationale:'Reviewed procedure',targetLocationId:demo.locationId,instruction:'Confirm with Mo',actions:['Assess with Mo'],resources:[{label:'First Aid',count:1,certificationType:'HLTAID011',experienceRequirement:null}],procedureIds:[context.procedures[0].id]})]);
    await asUser(ids[0]);snap=(await one('select public.intelligence_snapshot($1) as s',[demo.eventId])).s;
    assert.equal(snap.responses[0].processing_status,'complete');assert.equal(snap.responses[0].procedure_ids[0],context.procedures[0].id);
    console.log('Durable AI stages, retry from saved progress, relationship integrity, risk idempotence and validated procedure retrieval/drafting passed.');
  } finally { await db.close(); }
})().catch(error => { console.error(error.message); console.error(error.query ?? error.stack); process.exitCode = 1; });
