const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/domain/live-intelligence.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject});
const {validateIncident,validateRelations,validateRisks,validateResponse}=exportsObject;
const ctx={incident:{id:'i1'},locations:[{id:'l1'}],recent:[{id:'i2'}],observations:[{id:'o1'}],coverage:[{shift_id:'s1'}]};
const incident={category:'heat',severity:'high',locationId:'l1',peopleAffected:2,summary:'Two people dizzy',confidence:.9,evidence:'Volunteer report',needsReview:false};
test('incident classification preserves uncertainty and rejects invented locations',()=>{
 assert.equal(validateIncident({...incident,confidence:.5},ctx).needsReview,true);
 assert.equal(validateIncident({...incident,locationId:null},ctx).needsReview,true);
 assert.throws(()=>validateIncident({...incident,locationId:'invented'},ctx));
 assert.throws(()=>validateIncident({...incident,confidence:null},ctx));
 assert.throws(()=>validateIncident({...incident,peopleAffected:1.5},ctx));
});
test('relationships only reference supplied reports',()=>{
 assert.equal(validateRelations({relations:[{relatedIncidentId:'i2',relationType:'possible_duplicate',confidence:.9,explanation:'Same person and location'}]},ctx).length,1);
 assert.throws(()=>validateRelations({relations:[{relatedIncidentId:'unknown',relationType:'related',confidence:.9,explanation:'Same location'}]},ctx));
});
test('risks require distinct supported signals and reject unknown evidence',()=>{
 const risk={kind:'heat',locationId:'l1',title:'Heat risk',explanation:'Report plus measured temperature',severity:'high',confidence:.9,incidentIds:['i1'],observationIds:['o1'],shiftIds:[]};
 assert.equal(validateRisks({risks:[risk]},ctx).length,1);
 assert.throws(()=>validateRisks({risks:[{...risk,observationIds:[]}]},ctx));
 assert.throws(()=>validateRisks({risks:[{...risk,incidentIds:['i1','i1']}]},ctx));
 assert.throws(()=>validateRisks({risks:[{...risk,shiftIds:['invented']}]},ctx));
});
test('response requires event procedures and authoritative qualification labels',()=>{
 const responseCtx={locations:[{id:'l1'}],procedures:[{id:'p1'}],certificationTypes:['First Aid'],experienceTags:['maintenance']};
 const response={title:'Support',rationale:'Procedure and report',targetLocationId:'l1',actions:['Assess with Mo'],resources:[{label:'Medical support',certificationType:'First Aid',experienceRequirement:null,count:2}],procedureIds:['p1'],instruction:'Attend post and confirm with Mo'};
 assert.equal(validateResponse(response,responseCtx).resources[0].count,2);
 assert.throws(()=>validateResponse({...response,procedureIds:['unknown']},responseCtx));
 assert.throws(()=>validateResponse({...response,resources:[{...response.resources[0],certificationType:'invented'}]},responseCtx));
 assert.throws(()=>validateResponse({...response,procedureIds:[]},responseCtx));
});
