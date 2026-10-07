export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentAnalysis = {
  category: 'medical' | 'heat' | 'crowding' | 'lost_child' | 'security' | 'infrastructure' | 'weather' | 'other';
  severity: Severity; locationId: string | null; peopleAffected: number | null;
  summary: string; confidence: number; evidence: string; needsReview: boolean;
};
export type IntelligenceContext = {
  incident: { id: string; event_id: string; raw_report: string; transcript: string | null; created_at: string };
  locations: { id: string; name: string; posts: string[] }[];
  recent: { id: string; raw_report: string; transcript: string | null; summary: string | null; category: string | null; location_id: string | null; created_at: string }[];
  observations: { id: string; location_id: string | null; kind: string; value: string; observed_at: string }[];
  coverage: { shift_id: string; location_id: string; post: string; required: number; checked_in: number; qualifications: { label: string; actual: number; required: number }[] }[];
};
export type RelationAnalysis = { relatedIncidentId: string; relationType: 'possible_duplicate' | 'related' | 'same_area' | 'possible_escalation'; confidence: number; explanation: string };
export type RiskAnalysis = {
  kind: string; locationId: string | null; title: string; explanation: string; severity: Severity;
  confidence: number; incidentIds: string[]; observationIds: string[]; shiftIds: string[];
};
const categories = ['medical','heat','crowding','lost_child','security','infrastructure','weather','other'] as const;
const severities = ['low','medium','high','critical'] as const;
const relations = ['possible_duplicate','related','same_area','possible_escalation'] as const;
const string = { type: 'string' };
const confidence = { type: 'number', minimum: 0, maximum: 1 };
const nullableId = { type: ['string','null'] };
const strings = { type: 'array', items: string, maxItems: 20, uniqueItems: true };
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const incidentSchema = object({ category: { type:'string',enum:categories }, severity:{type:'string',enum:severities},
  locationId:nullableId, peopleAffected:{type:['integer','null'],minimum:0,maximum:10000},
  summary:{type:'string',minLength:1,maxLength:1000}, confidence, evidence:{type:'string',minLength:1,maxLength:1200}, needsReview:{type:'boolean'} });
export const relationSchema = object({ relations:{type:'array',maxItems:20,items:object({relatedIncidentId:string,
  relationType:{type:'string',enum:relations},confidence,explanation:{type:'string',minLength:1,maxLength:800}})} });
export const riskSchema = object({ risks:{type:'array',maxItems:5,items:object({kind:{type:'string',enum:categories},locationId:nullableId,
  title:{type:'string',minLength:1,maxLength:160},explanation:{type:'string',minLength:1,maxLength:1500},severity:{type:'string',enum:severities},
  confidence,incidentIds:strings,observationIds:strings,shiftIds:strings})} });
export function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid AI object.');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k=>!keys.includes(k)) || keys.some(k=>!(k in v))) throw new Error('Unexpected or missing AI fields.');
  return v;
}
export function textValue(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid AI text.');
  return value.trim();
}
export function numberValue(value: unknown, min = 0, max = 1): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid AI number.');
  return value;
}
function member<T extends string>(v: unknown, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw new Error('Invalid AI classification.');
  return v as T;
}
function reference(v: unknown, ids: string[], nullable = false): string | null {
  if (v === null && nullable) return null;
  if (typeof v !== 'string' || !ids.includes(v)) throw new Error('AI referenced unavailable event evidence.');
  return v;
}
function references(v: unknown, ids: string[]): string[] {
  if (!Array.isArray(v) || v.length > 20 || new Set(v).size !== v.length) throw new Error('Invalid AI references.');
  return v.map(id=>reference(id,ids)!);
}
export function validateIncident(value: unknown, ctx: IntelligenceContext): IncidentAnalysis {
  const v=record(value,Object.keys(incidentSchema.properties));
  if (typeof v.needsReview !== 'boolean') throw new Error('Missing review state.');
  const affected=v.peopleAffected===null?null:numberValue(v.peopleAffected,0,10000);
  if (affected!==null && !Number.isInteger(affected)) throw new Error('Invalid people count.');
  const locationId=reference(v.locationId,ctx.locations.map(l=>l.id),true);
  const conf=numberValue(v.confidence);
  return {category:member(v.category,categories),severity:member(v.severity,severities),locationId,peopleAffected:affected,
    summary:textValue(v.summary,1000),confidence:conf,evidence:textValue(v.evidence,1200),needsReview:v.needsReview || conf<.8 || locationId===null};
}
export function validateRelations(value: unknown, ctx: IntelligenceContext): RelationAnalysis[] {
  const root=record(value,['relations']);
  if (!Array.isArray(root.relations) || root.relations.length>20) throw new Error('Invalid AI relationships.');
  return root.relations.map(value=>{
    const v=record(value,['relatedIncidentId','relationType','confidence','explanation']);
    return {relatedIncidentId:reference(v.relatedIncidentId,ctx.recent.map(i=>i.id))!,relationType:member(v.relationType,relations),
      confidence:numberValue(v.confidence),explanation:textValue(v.explanation,800)};
  });
}
export function validateRisks(value: unknown, ctx: IntelligenceContext): RiskAnalysis[] {
  const root=record(value,['risks']);
  if (!Array.isArray(root.risks) || root.risks.length>5) throw new Error('Invalid AI risks.');
  return root.risks.map(value=>{
    const v=record(value,['kind','locationId','title','explanation','severity','confidence','incidentIds','observationIds','shiftIds']);
    const incidentIds=references(v.incidentIds,[ctx.incident.id,...ctx.recent.map(i=>i.id)]);
    const observationIds=references(v.observationIds,ctx.observations.map(o=>o.id));
    const shiftIds=references(v.shiftIds,ctx.coverage.map(s=>s.shift_id));
    if (incidentIds.length+observationIds.length+shiftIds.length<2) throw new Error('A risk needs multiple evidence signals.');
    return {kind:member(v.kind,categories),locationId:reference(v.locationId,ctx.locations.map(l=>l.id),true),
      title:textValue(v.title,160),explanation:textValue(v.explanation,1500),severity:member(v.severity,severities),confidence:numberValue(v.confidence),incidentIds,observationIds,shiftIds};
  });
}
export type ResourceNeed = { label: string; certificationType: string | null; experienceRequirement: string | null; count: number };
export type ResponseDraft = { title: string; rationale: string; targetLocationId: string | null; actions: string[]; resources: ResourceNeed[]; procedureIds: string[]; instruction: string };
export type Procedure = { id:string; title:string; content:string; source:string };
export type ResponseContext = { eventId:string; source:unknown; procedures:Procedure[]; locations:{id:string;name:string}[]; certificationTypes:string[]; experienceTags:string[] };
export const responseSchema = object({title:{type:'string',minLength:1,maxLength:160},rationale:{type:'string',minLength:1,maxLength:1500},targetLocationId:nullableId,
  actions:{type:'array',minItems:1,maxItems:8,items:{type:'string',minLength:1,maxLength:500}},
  resources:{type:'array',minItems:1,maxItems:6,items:object({label:{type:'string',minLength:1,maxLength:100},certificationType:nullableId,experienceRequirement:nullableId,count:{type:'integer',minimum:1,maximum:6}})},
  procedureIds:strings,instruction:{type:'string',minLength:1,maxLength:1000}});
export function validateResponse(value: unknown, ctx: ResponseContext): ResponseDraft {
  const v=record(value,Object.keys(responseSchema.properties));
  if (!Array.isArray(v.actions) || v.actions.length<1 || v.actions.length>8 || !Array.isArray(v.resources) || v.resources.length<1 || v.resources.length>6) throw new Error('Invalid response actions/resources.');
  const resources=v.resources.map(value=>{
    const r=record(value,['label','certificationType','experienceRequirement','count']);
    const count=numberValue(r.count,1,6);
    if (!Number.isInteger(count)) throw new Error('Invalid resource count.');
    return {label:textValue(r.label,100),certificationType:reference(r.certificationType,ctx.certificationTypes,true),experienceRequirement:reference(r.experienceRequirement,ctx.experienceTags,true),count};
  });
  if (resources.reduce((sum,r)=>sum+r.count,0)>12) throw new Error('Response exceeds supported resource limit.');
  const procedureIds=references(v.procedureIds,ctx.procedures.map(p=>p.id));
  if (!procedureIds.length) throw new Error('Response must cite an event-specific procedure.');
  return {title:textValue(v.title,160),rationale:textValue(v.rationale,1500),targetLocationId:reference(v.targetLocationId,ctx.locations.map(l=>l.id),true),
    actions:v.actions.map(a=>textValue(a,500)),resources,procedureIds,instruction:textValue(v.instruction,1000)};
}
