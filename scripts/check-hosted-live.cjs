// Mutates only a separately labelled synthetic acceptance event; retains history.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {createClient}=require('@supabase/supabase-js');
for(const f of ['.env.local','.ground-control-backend-secrets'])process.loadEnvFile(path.join(root,f));
let logins=JSON.parse(fs.readFileSync(path.join(root,'.ground-control-demo-logins.json'),'utf8'));
function moduleFile(file){const m=new Module(path.join(__dirname,file),module);m._compile(ts.transpileModule(fs.readFileSync(path.join(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,path.join(__dirname,file));return m.exports;}
const {demo}=moduleFile('demo-fixture.ts'),{scenarioSql,reserveAccounts,liveDemoId}=moduleFile('live-demo-fixture.ts');
const clients=new Map();
async function user(email){if(clients.has(email))return clients.get(email);const login=logins.find(l=>l.email===email);const c=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const {error}=await c.auth.signInWithPassword({email,password:login.password});if(error)throw new Error('Demo login failed.');clients.set(email,c);return c;}
async function rpc(c,name,args){const {data,error}=await c.rpc(name,args);if(error)throw new Error(`${name}: ${error.message}`);return data;}
async function query(sql){const r=await fetch(`https://api.supabase.com/v1/projects/${demo.projectRef}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`Ground Control query HTTP ${r.status}`);return r.json();}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 await query(`begin;update public.events set status='completed' where id='f0e975d1-f375-4ff2-aa15-ee65b5aa5493' and name='Riverside - automated acceptance';update public.rosters set status='superseded' where event_id='f0e975d1-f375-4ff2-aa15-ee65b5aa5493';update public.response_plans set status='dismissed',processing_status='complete' where event_id='f0e975d1-f375-4ff2-aa15-ee65b5aa5493' and status='proposed';commit;`);
 const acceptanceFile=path.join(root,'.ground-control-acceptance-logins.json');
 const keysResponse=await fetch(`https://api.supabase.com/v1/projects/${demo.projectRef}/api-keys`,{headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`}});
 if(!keysResponse.ok)throw new Error('Acceptance service access unavailable.');
 const keys=await keysResponse.json();const key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw new Error('Acceptance service access unavailable.');
 const admin=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
 logins=fs.existsSync(acceptanceFile)?JSON.parse(fs.readFileSync(acceptanceFile,'utf8')):[];
 const accounts=[...demo.accounts,...reserveAccounts];
 for(const account of accounts){
  const email=account.email.replace('.demo@','.acceptance@');
  if(logins.some(l=>l.email===email))continue;
  const password=`GCtest-${crypto.randomBytes(18).toString('base64url')}!`;
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:account.name},app_metadata:{ground_control_demo:'riverside-acceptance-v1'}});
  if(error||!data.user)throw new Error('Isolated acceptance account creation failed.');
  logins.push({email,password,userId:data.user.id});fs.writeFileSync(acceptanceFile,JSON.stringify(logins,null,2)+'\n',{mode:0o600});
 }
 const eventId=process.env.GROUND_CONTROL_ACCEPTANCE_EVENT??crypto.randomUUID();
 const ids=[...demo.accounts,...reserveAccounts].map(a=>logins.find(l=>l.email===a.email.replace('.demo@','.acceptance@')).userId);
 const sql=scenarioSql(ids,true).replaceAll(liveDemoId,eventId).replaceAll('RIVERLIVE',`TEST${crypto.randomBytes(4).toString('hex').toUpperCase()}`).replaceAll('Riverside Live Operations - Demo','Riverside - automated acceptance');
 if(!process.env.GROUND_CONTROL_ACCEPTANCE_EVENT)await query(sql);console.log(`Isolated acceptance event: ${eventId}`);
 const mo=await user(demo.accounts[0].email.replace('.demo@','.acceptance@')),sarah=await user(demo.accounts[1].email.replace('.demo@','.acceptance@'));
 const snapshot=()=>rpc(mo,'intelligence_snapshot',{p_event_id:eventId});
 const water=async()=> (await snapshot()).activeShifts.find(s=>s.post==='Water Station B');
 // Wake the durable attendance worker, independent of an open coordinator screen.
 await query('select public.wake_incident_worker()');
 let replacement;
 for(let n=0;n<40;n++){replacement=(await snapshot()).responses.find(r=>r.coverage_shift_id);if(replacement)break;await sleep(2000);}
 assert.ok(replacement,'Scheduled worker creates a reviewed replacement recommendation');
 const candidates=await rpc(mo,'response_candidates',{p_response_id:replacement.id});
 if(replacement.status!=='approved'){
 assert.equal(candidates.find(c=>c.userId===ids[1]).eligible,true);
 await rpc(mo,'approve_response',{p_response_id:replacement.id,p_revision:replacement.revision,p_selections:[{userId:ids[1],resourceIndex:0}]});
 await rpc(mo,'approve_response',{p_response_id:replacement.id,p_revision:replacement.revision,p_selections:[{userId:ids[1],resourceIndex:0}]});
 }
 const requests=await rpc(sarah,'my_dispatch_requests',{p_event_id:eventId});
 const dispatch=requests.find(d=>d.status==='pending'||d.status==='arrived');assert.ok(dispatch);
 if(dispatch.status==='pending')for(const status of ['accepted','en_route','arrived'])await rpc(sarah,'update_dispatch',{p_id:dispatch.id,p_status:status});
 assert.equal((await snapshot()).coverage.find(c=>c.post==='Gate C').checked_in,1);
 console.log('Hosted no-show detection, safe Sarah reassignment, idempotent approval and arrival passed.');
 const loc=(await snapshot()).locations[0].id;
 if(!(await snapshot()).observations.length)await rpc(mo,'record_event_observation',{p_event_id:eventId,p_location_id:loc,p_kind:'temperature',p_value:'Measured temperature is 38 degrees Celsius on the Lawn.'});
 const reportIds=(await snapshot()).incidents.filter(i=>i.raw_report.includes('[Synthetic acceptance scenario]')).map(i=>i.id);
 for(const incident of (await snapshot()).incidents)if(reportIds.includes(incident.id)&&incident.processing_status==='failed')await rpc(mo,'retry_incident_processing',{p_id:incident.id});
 if(!reportIds.length)
 for(const report of ['Three attendees dizzy and faint near Water Station B on the Lawn in the heat.','Crowding is increasing at Water Station B on the Lawn; queues obstruct access.','Water Station B on the Lawn has stopped dispensing water; the supply equipment appears broken.']){
  const r=await rpc(sarah,'report_incident',{p_event_id:eventId,p_raw_report:`${report} [Synthetic acceptance scenario]`,p_request_id:crypto.randomUUID()});reportIds.push(r.id);
 }
 let live;
 for(let n=0;n<150;n++){
  live=await snapshot();const incidents=live.incidents.filter(i=>reportIds.includes(i.id));
  if(incidents.some(i=>i.processing_status==='failed'&&i.processing_failures>=3))throw new Error(`Hosted AI exhausted retries: ${incidents.find(i=>i.processing_status==='failed').processing_error}`);
  if(incidents.length===3&&incidents.every(i=>i.processing_status==='complete')&&live.risks.length)break;
  if(n%10===0)console.log(`Hosted Gemini processing: ${incidents.map(i=>i.processing_status).join(', ')}`);
  await sleep(3000);
 }
 assert.ok(live.risks.length,'Mixed signals produce an evidence-backed risk');
 assert.ok(live.incidents.every(i=>i.summary&&i.ai_evidence));
 assert.ok(live.relations.length,'Semantic relations preserve originals');
 console.log('Real Gemini interpretation, semantic relationships and evidence-backed emerging risk passed.');
 let plan=await rpc(mo,'propose_response',{p_risk_id:live.risks[0].id,p_incident_id:null});
 if(plan.processing_status==='failed')await rpc(mo,'retry_response_processing',{p_id:plan.id});
 for(let n=0;n<120;n++){plan=(await snapshot()).responses.find(r=>r.id===plan.id);if(plan.processing_status==='failed'&&plan.processing_failures>=3)throw new Error(`Response AI exhausted retries: ${plan.processing_error}`);if(plan.processing_status==='complete')break;if(n%10===0)console.log(`Hosted response ${plan.planning_stage}: ${plan.processing_status}`);await sleep(3000);}
 assert.equal(plan.processing_status,'complete');assert.ok(plan.procedure_ids.length);
 await rpc(mo,'modify_response',{p_id:plan.id,p_revision:plan.revision,p_shift_id:(await water()).id,p_instruction:plan.instruction,p_resources:plan.resources,p_actions:plan.actions});
 plan=(await snapshot()).responses.find(r=>r.id===plan.id);
 const options=await rpc(mo,'response_candidates',{p_response_id:plan.id});const selections=[];
 for(let index=0;index<plan.resources.length;index++){
  const choices=options.filter(c=>c.resourceIndex===index&&c.eligible).sort((a,b)=>a.rank-b.rank);
  for(let n=0;n<plan.resources[index].count;n++){const c=choices.find(c=>!selections.some(s=>s.userId===c.userId));assert.ok(c,`Feasible crew for ${plan.resources[index].label}`);selections.push({userId:c.userId,resourceIndex:index});}
 }
 await rpc(mo,'approve_response',{p_response_id:plan.id,p_revision:plan.revision,p_selections:selections});
 for(const selection of selections){const login=logins.find(l=>l.userId===selection.userId);const c=await user(login.email);const req=(await rpc(c,'my_dispatch_requests',{p_event_id:eventId})).find(d=>d.status==='pending');assert.ok(req);for(const status of ['accepted','en_route','arrived','completed'])await rpc(c,'update_dispatch',{p_id:req.id,p_status:status});}
 await rpc(mo,'complete_response',{p_id:plan.id,p_notes:'Synthetic acceptance tasks completed and reviewed.'});
 for(const id of reportIds)await rpc(mo,'resolve_incident',{p_id:id,p_notes:'Synthetic acceptance scenario resolved after tracked response.'});
 await rpc(mo,'complete_response',{p_id:replacement.id,p_notes:'Synthetic replacement task completed.'});
 for(const risk of (await snapshot()).risks)await rpc(mo,'set_risk_status',{p_id:risk.id,p_status:'resolved'});
 for(const remaining of (await snapshot()).responses)if(['proposed','modified'].includes(remaining.status))await rpc(mo,'dismiss_response',{p_id:remaining.id,p_revision:remaining.revision});
 await rpc(mo,'request_event_summary',{p_event_id:eventId});let summary;
 for(let n=0;n<40;n++){summary=await rpc(mo,'event_summary_status',{p_event_id:eventId});if(summary.status==='failed')throw new Error('Hosted summary generation failed.');if(summary.status==='complete')break;await sleep(3000);}
 assert.equal(summary.status,'complete');
 await rpc(mo,'close_event',{p_event_id:eventId,p_summary:summary.summary});
 console.log('Procedure retrieval, real Gemini response, exact-person approval, full dispatch tracking and reviewed AI closeout passed; acceptance history retained.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
