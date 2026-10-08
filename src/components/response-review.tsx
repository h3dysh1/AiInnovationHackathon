import { AppText as Text } from '@/components/app-text';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Disclosure, Field, Notice } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import type { IntelligenceSnapshot, LiveResponse, ResponseCandidate } from '@/domain/live';
import { approveResponse, completeResponse, dismissResponse, modifyResponse, responseCandidates, retryResponse } from '@/services/staffing';

export function ResponseReview({response:r,snapshot,run,pending}:{response:LiveResponse;snapshot:IntelligenceSnapshot;run:(operation:()=>Promise<unknown>)=>Promise<unknown>;pending:boolean}) {
  const [expanded, setExpanded] = useState(false);
  const [shift,setShift]=useState(r.target_shift_id ?? '');
  const [instruction,setInstruction]=useState(r.instruction ?? '');
  const [actions,setActions]=useState(r.actions.join('\n'));
  const [resources,setResources]=useState(r.resources);
  const [candidates,setCandidates]=useState<ResponseCandidate[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [selected,setSelected]=useState<{userId:string;resourceIndex:number}[]>([]);
  const [showBlocked,setShowBlocked]=useState(false);
  const [notes,setNotes]=useState('');
  useEffect(()=>{
    if (expanded && r.processing_status==='complete' && ['proposed','modified'].includes(r.status)) {
      responseCandidates(r.id).then(setCandidates).catch(()=>setError('Candidates could not be loaded. Refresh and try again.'));
    }
  },[expanded,r.id,r.revision,r.processing_status,r.status]);
  const editable=['proposed','modified'].includes(r.status);
  const dirty=shift!==(r.target_shift_id ?? '') || instruction!==(r.instruction ?? '') || actions!==r.actions.join('\n') || JSON.stringify(resources)!==JSON.stringify(r.resources);
  const enough=resources.length>0 && resources.every((resource,index)=>selected.filter(s=>s.resourceIndex===index).length===resource.count);
  return <PlanCard>
    <Text style={planStyles.heading}>{r.title}</Text><Text style={planStyles.text}>{r.rationale}</Text>
    <Text style={planStyles.badge}>{r.status.toUpperCase()} · {r.processing_status}</Text>
    {r.processing_error?<Notice tone="error" message={r.processing_error}/>:null}
    {error?<Notice tone="error" message={error}/>:null}
    {r.procedure_ids.map(id=>{const p=snapshot.procedures.find(p=>p.id===id);return p?<Text key={id} style={planStyles.help}>Procedure: {p.title} · {p.content}</Text>:null;})}
    {editable ? <Button title={expanded ? 'Close response review' : 'Review response and crew'} secondary onPress={() => setExpanded(!expanded)} /> : null}
    <View accessibilityElementsHidden={editable && !expanded} importantForAccessibility={editable && !expanded ? 'no-hide-descendants' : 'auto'} style={editable && !expanded ? { display: 'none' } : undefined}>
    {editable?<>
      <Text style={planStyles.text}>Destination: {snapshot.activeShifts.find(s => s.id === shift)?.post ?? 'Choose a post'}</Text>
      <Text style={planStyles.text}>{instruction || 'No instruction drafted yet.'}</Text>
      <Disclosure title='Edit destination, instructions and resources'>
      <Text style={planStyles.text}>Destination post</Text>
      {snapshot.activeShifts.map(s=><Button key={s.id} title={`${shift===s.id?'✓ ':''}${s.post} · ${s.location}`} secondary compact onPress={()=>setShift(s.id)}/>)}
      <Field label='Actions (one per line)' value={actions} onChangeText={setActions} multiline/>
      <Field label='Volunteer instruction' value={instruction} onChangeText={setInstruction} multiline/>
      {resources.map((resource,index)=><PlanCard key={index}>
        <Text style={planStyles.heading}>{resource.label} · {resource.count} needed</Text>
        <Field label='Resource label' value={resource.label} onChangeText={label=>setResources(resources.map((x,i)=>i===index?{...x,label}:x))}/>
        <Field label='Required qualification (optional)' value={resource.certificationType??''} onChangeText={value=>setResources(resources.map((x,i)=>i===index?{...x,certificationType:value.trim()||null}:x))}/>
        <Field label='Required reviewed experience (optional)' value={resource.experienceRequirement??''} onChangeText={value=>setResources(resources.map((x,i)=>i===index?{...x,experienceRequirement:value.trim()||null}:x))}/>
        <Button title='Remove resource group' secondary compact onPress={()=>setResources(resources.filter((_,i)=>i!==index))}/>
        <Button title='Increase requested crew' compact secondary disabled={resource.count>=6} onPress={()=>setResources(resources.map((x,i)=>i===index?{...x,count:x.count+1}:x))}/>
        <Button title='Decrease requested crew' compact secondary disabled={resource.count<=1} onPress={()=>setResources(resources.map((x,i)=>i===index?{...x,count:x.count-1}:x))}/>
      </PlanCard>)}
      {resources.length<6?<Button title='Add one general volunteer' secondary compact onPress={()=>setResources([...resources,{label:'General support',certificationType:null,experienceRequirement:null,count:1}])}/>:null}
      <Button title='Save reviewed destination and instructions' disabled={pending||!shift||!instruction.trim()||!actions.trim()||!resources.length} onPress={()=>{void run(()=>modifyResponse(r.id,r.revision,shift,instruction,resources,actions.split('\n').filter(s=>s.trim())));}}/>
      </Disclosure>
      {!dirty && r.processing_status==='complete'?resources.map((resource,index)=><PlanCard key={`c-${index}`}>
        <Text style={planStyles.heading}>Choose {resource.count} · {resource.label}</Text>
        {candidates.filter(c=>c.resourceIndex===index&&(showBlocked||c.eligible)).sort((a,b)=>a.rank-b.rank||a.name.localeCompare(b.name)).map(c=>{
          const chosen=selected.some(s=>s.userId===c.userId&&s.resourceIndex===index);
          return <PlanCard key={c.userId}>
            <Text style={planStyles.text}>{c.name} · {c.source??'Standby'}</Text>
            <Text style={planStyles.help}>{c.eligible?'Availability, qualifications and coverage checked':c.reason}</Text>
            <Button title={chosen?'✓ Selected':'Select volunteer'} secondary compact disabled={pending||!c.eligible||(!chosen&&selected.some(s=>s.userId===c.userId))} onPress={()=>setSelected(chosen?selected.filter(s=>s.userId!==c.userId):[...selected,{userId:c.userId,resourceIndex:index}])}/>
          </PlanCard>;
        })}
      </PlanCard>):null}
      {!dirty&&r.processing_status==='complete'?<Button title={showBlocked?'Hide unavailable crew':'Show unavailable crew and reasons'} secondary compact onPress={()=>setShowBlocked(!showBlocked)}/>:null}
      {selected.length?<Notice message={`Approval will move: ${selected.map(s=>candidates.find(c=>c.userId===s.userId)?.name??'Selected volunteer').join(', ')}. Source coverage is rechecked together before any move.`}/>:null}
      <Button title='Approve selected volunteers and send instructions' disabled={pending||dirty||!enough||r.processing_status!=='complete'} onPress={()=>{void run(()=>approveResponse(r.id,r.revision,selected));}}/>
      {r.processing_status==='failed'?<Button title='Retry AI draft' secondary onPress={()=>{void run(()=>retryResponse(r.id));}}/>:null}
      <Button title='Dismiss response' secondary disabled={pending} onPress={()=>{void run(()=>dismissResponse(r.id,r.revision));}}/>
    </>:null}
    </View>
    {snapshot.dispatches.filter(d=>d.response_plan_id===r.id).map(d=><Text key={d.id} style={planStyles.text}>{d.name} · {d.status}</Text>)}
    {r.status==='approved'?<><Field label='Completion notes' value={notes} onChangeText={setNotes}/><Button title='Confirm response completed' disabled={pending||!notes.trim()} onPress={()=>{void run(()=>completeResponse(r.id,notes));}}/></>:null}
  </PlanCard>;
}
