// Fresh, labelled acceptance records through normal role-scoped application APIs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');process.loadEnvFile(path.join(root,'.env.local'));
const {createClient}=require('@supabase/supabase-js');
const logins=JSON.parse(fs.readFileSync(path.join(root,'.ground-control-acceptance-logins.json'),'utf8'));
const statePath=path.join(root,'.ground-control-setup-acceptance.json');let state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{};
const save=()=>fs.writeFileSync(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function user(name){const login=logins.find(l=>l.email===`${name}.acceptance@groundcontrol.example`),c=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const {error}=await c.auth.signInWithPassword({email:login.email,password:login.password});if(error)throw new Error('Acceptance sign-in failed.');return {c,id:login.userId};}
async function rpc(c,name,args){const {data,error}=await c.rpc(name,args);if(error)throw new Error(`${name}: ${error.message}`);return data;}
async function invoke(c,name,body){const {error}=await c.functions.invoke(name,{body});if(error)throw new Error(`${name} request failed; saved evidence retained.`);}
function fixture(){const file=path.join(__dirname,'demo-fixture.ts'),m=new Module(file,module);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
async function main(){
 const {c:mo,id:moId}=await user('mo'),{c:sarah,id:sarahId}=await user('sarah'),{c:alex}=await user('alex');
 if(!state.eventId){
  const org=await rpc(mo,'become_coordinator',{p_organisation_name:'Ground Control acceptance workspace'});
  const date=new Date(Date.now()+14*86400000).toISOString().slice(0,10);state.date=date;
  const {data:event,error}=await mo.from('events').insert({organisation_id:org,name:'Riverside - fresh setup acceptance',description:'Synthetic end-to-end setup and staffing validation.',venue_name:'Synthetic Riverside',start_date:date,end_date:date,operating_start_time:'09:00',operating_end_time:'17:00',timezone:'UTC',expected_attendance:200,approximate_workforce:2,created_by:moId,status:'draft'}).select('id').single();if(error)throw new Error(`Event creation: ${error.message}`);state.eventId=event.id;save();
  const description=`SYNTHETIC DEMO: Riverside operates ${date} from 09:00 to 17:00 UTC. The Lawn contains Water Station B. Water Station B requires exactly two volunteers including one First Aid holder throughout those hours. Mo Demo supervises on radio channel 1. Instructions: monitor water distribution and report incidents. Procedure: report facts and location to Mo, who approves all safety responses. No further posts or operating periods.`;
  const {error:setupError}=await mo.from('event_setup_sessions').insert({event_id:event.id,description,updated_by:moId});if(setupError)throw new Error('Setup description was not saved.');
  const docId=crypto.randomUUID(),docPath=`${event.id}/${docId}/demo-heat-procedure.txt`,document=Buffer.from('SYNTHETIC DEMO Heat procedure: Volunteers report observed symptoms and location to Mo on radio channel 1. Mo reviews and approves any operational response; volunteers do not autonomously declare an emergency or order an evacuation.');
  const {error:uploadError}=await mo.storage.from('event-documents').upload(docPath,document,{contentType:'text/plain'});if(uploadError)throw new Error('Demo procedure upload failed.');
  const {error:docError}=await mo.from('event_documents').insert({id:docId,event_id:event.id,title:'Synthetic heat procedure',document_type:'heat_plan',original_name:'demo-heat-procedure.txt',storage_path:docPath,mime_type:'text/plain',size_bytes:document.length,uploaded_by:moId});if(docError)throw new Error('Demo document metadata failed.');state.documentId=docId;save();
 }
 if(!state.jobId){state.jobId=await rpc(mo,'enqueue_setup_job',{p_event_id:state.eventId,p_request_id:crypto.randomUUID()});save();await invoke(mo,'setup-ai',{jobId:state.jobId});}
 let job,retries=0;
 for(let n=0;n<110;n++){const {data,error}=await mo.from('setup_ai_jobs').select('*').eq('id',state.jobId).single();if(error)throw new Error('Setup status unavailable.');job=data;if(job.status==='succeeded')break;if(job.status==='failed'&&retries++<2)await invoke(mo,'setup-ai',{jobId:state.jobId});if(n%10===0)console.log(`Fresh Gemini setup: ${job.status}`);await sleep(3000);}
 assert.equal(job.status,'succeeded',`Setup AI failed: ${job.error_message}`);
 if(!state.applied){await rpc(mo,'apply_setup_proposal',{p_job_id:job.id,p_plan:job.output});state.applied=true;save();}
 const {data:reviews,error:reviewError}=await mo.from('setup_entity_reviews').select('*').eq('event_id',state.eventId);if(reviewError)throw new Error('Setup review unavailable.');
 let ready=await rpc(mo,'get_event_readiness',{p_event_id:state.eventId});
 for(const r of reviews)await rpc(mo,'confirm_setup_entity',{p_event_id:state.eventId,p_kind:r.entity_kind,p_entity_id:r.entity_id,p_expected_revision:ready.revision});
 ready=await rpc(mo,'get_event_readiness',{p_event_id:state.eventId});assert.deepEqual(ready.issues,[]);
 await rpc(mo,'verify_event_model',{p_event_id:state.eventId,p_expected_revision:ready.revision});
 const code=state.code??`TEST${crypto.randomBytes(5).toString('hex').toUpperCase()}`;state.code=code;save();
 await rpc(mo,'publish_event_recruitment',{p_event_id:state.eventId,p_join_code:code,p_expected_revision:ready.revision});
 for(const c of [sarah,alex])await rpc(c,'join_event',{p_join_code:code,p_expected_event_id:state.eventId});
 console.log('Real document-driven Gemini setup, explicit review, verification, recruitment and volunteer joining passed.');
 if(!state.certificateId){state.certificateId=crypto.randomUUID();save();const certificate=fixture().certificatePdf(),storagePath=`${sarahId}/${state.certificateId}/synthetic-certificate.pdf`;const {error}=await sarah.storage.from('certificates').upload(storagePath,certificate,{contentType:'application/pdf'});if(error)throw new Error('Synthetic certificate upload failed.');const {error:metadataError}=await sarah.from('certifications').insert({id:state.certificateId,user_id:sarahId,title:'SYNTHETIC fresh extraction acceptance',storage_path:storagePath,mime_type:'application/pdf',size_bytes:certificate.length});if(metadataError)throw new Error('Certificate metadata failed.');await invoke(sarah,'certificate-ai',{certificateId:state.certificateId});}
 let certificate;retries=0;
 for(let n=0;n<110;n++){const {data,error}=await sarah.from('certifications').select('*').eq('id',state.certificateId).single();if(error)throw new Error('Certificate status unavailable.');certificate=data;if(['verified','requires_review','expired'].includes(data.status))break;if(data.status==='failed'&&retries++<2)await invoke(sarah,'certificate-ai',{certificateId:state.certificateId});if(n%10===0)console.log(`Fresh Gemini certificate: ${data.status}`);await sleep(3000);}
 assert.ok(certificate.extraction,'Real provider extracted the new PDF');assert.equal(certificate.expires_at,'2028-12-31');assert.match(certificate.type,/HLTAID011|First Aid/i);
 console.log(`Fresh Gemini PDF certificate extraction passed (${certificate.status}); original retained.`);
 const preferences={preferredPosts:[],avoidedPosts:[],preferredStart:'',preferredEnd:'',desiredHours:8,maximumHours:8,maximumDailyHours:8,experienceTags:[]};
 for(const c of [sarah,alex]){await rpc(c,'save_event_onboarding',{p_event_id:state.eventId,p_windows:[{startDate:state.date,endDate:state.date,startTime:'09:00',endTime:'17:00'}],p_preferences:preferences});const briefing=await rpc(c,'event_briefing',{p_event_id:state.eventId});await rpc(c,'acknowledge_event_briefing',{p_event_id:state.eventId,p_revision:briefing.revision});}
 if(!state.rosterId){state.rosterId=crypto.randomUUID();save();await rpc(mo,'create_shift_draft',{p_event_id:state.eventId,p_roster_id:state.rosterId,p_shift_hours:4,p_expected_model_revision:ready.revision});}
 const ctx=await rpc(mo,'get_roster_context',{p_roster_id:state.rosterId});
 if(ctx.roster.status==='draft'){await invoke(mo,'roster-generate',{rosterId:state.rosterId,revision:ctx.roster.revision,generationId:crypto.randomUUID()});const rosterReady=await rpc(mo,'get_roster_readiness',{p_roster_id:state.rosterId});assert.equal(rosterReady.ready,true);await rpc(mo,'publish_roster',{p_roster_id:state.rosterId,p_revision:rosterReady.revision,p_staffing_revision:rosterReady.staffingRevision});}
 const schedule=await rpc(sarah,'my_event_schedule',{p_event_id:state.eventId});assert.equal(schedule.published,true);assert.ok(schedule.shifts.length);
 console.log('Hosted automatic assignment, constraint checks, reviewed roster publication, briefing acknowledgements and Sarah schedule passed.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
