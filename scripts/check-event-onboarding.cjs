const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
function load(file, mocks = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports, require:(id)=>mocks[id] ?? load(path.join(path.dirname(file),id))});
 return exports;
}
const { eventQualifications, eventQualificationStatus, parseEventOnboardingDraft }=load('src/domain/event-onboarding.ts');
const certificate={id:'cert',title:'First aid',type:'HLTAID011',status:'verified',issued_at:'2025-01-01',expires_at:'2027-01-01',never_expires:false};
test('event requirements deduplicate aliases and retain every relevant post',()=>{
 const result=eventQualifications([{certification_type:'First Aid',post_name:'Water',location_name:'Lawn'},{certification_type:'HLTAID011',post_name:'Gate',location_name:'Entry'}]);
 assert.equal(result.length,1);assert.equal(result[0].posts.length,2);
});
test('reuse requires authoritative verified type and validity across the whole event',()=>{
 assert.equal(eventQualificationStatus([certificate],'First Aid','2026-12-12','2026-12-14').state,'valid');
 assert.equal(eventQualificationStatus([{...certificate,expires_at:'2026-12-13'}],'First Aid','2026-12-12','2026-12-14').state,'missing');
 assert.equal(eventQualificationStatus([{...certificate,status:'archived'}],'First Aid','2026-12-12','2026-12-14').state,'missing');
 assert.equal(eventQualificationStatus([{...certificate,status:'requires_review'}],'First Aid','2026-12-12','2026-12-14').state,'pending');
 assert.equal(eventQualificationStatus([{...certificate,type:'CPR'}],'First Aid','2026-12-12','2026-12-14').state,'missing');
});
test('a new upload title never establishes verified eligibility',()=>{
 const status=eventQualificationStatus([{...certificate,type:null,status:'uploaded'}],'First Aid','2026-12-12','2026-12-14');
 assert.equal(status.state,'pending');assert.match(status.message,/does not yet establish eligibility/);
});
test('malformed device drafts cannot replace typed event inputs',()=>{
 for(const raw of ['bad','null','[]',JSON.stringify({revision:1,step:1,windows:[null],hours:'8',maximum:'40',daily:'8',preferred:[]})])assert.equal(parseEventOnboardingDraft(raw),null);
 assert.equal(parseEventOnboardingDraft(JSON.stringify({revision:1,step:1,windows:[],hours:'8',maximum:'40',daily:'8',preferred:[]})).step,1);
});
test('failed profile persistence cannot mark registration complete',async()=>{
 const calls=[];
 const {completeVolunteerRegistration}=load('src/services/registration.ts',{'./profile':{saveUserProfile:async()=>calls.push('user'),saveVolunteerProfile:async()=>{calls.push('volunteer');throw Error('offline');}},'./supabase':{supabase:{auth:{updateUser:async()=>{calls.push('complete');return{error:null};}}}}});
 await assert.rejects(completeVolunteerRegistration('user',{name:'Alex',phone:'0400000000',emergencyName:'Sam',emergencyPhone:'0411111111',experience:'First event'}),/offline/);
 assert.deepEqual(calls,['user','volunteer']);
});
