import { AppText as Text } from '@/components/app-text';
import {useState} from 'react';

import {Button,Field,Notice} from '@/components/ui';
import {planStyles} from '@/components/plan-ui';
import type {LiveIncident} from '@/domain/live';
import {setupRpc} from '@/services/planning';
export function IncidentReview({incident,locations,pending,run}:{incident:LiveIncident;locations:{id:string;name:string}[];pending:boolean;run:(operation:()=>Promise<unknown>)=>Promise<unknown>}) {
 const [editing,setEditing]=useState(false);
 const [category,setCategory]=useState(incident.category??'other');
 const [severity,setSeverity]=useState(incident.severity??'medium');
 const [location,setLocation]=useState<string|null>(incident.location_id??null);
 const [summary,setSummary]=useState(incident.summary??incident.raw_report);
 return <>
  <Button title={editing?'Hide incident review':'Review or correct interpretation'} secondary compact onPress={()=>setEditing(!editing)}/>
  {editing?<>
   <Notice message='Your correction is recorded alongside the original report and AI history.'/>
   <Text style={planStyles.help}>Category</Text>
   {['medical','heat','crowding','lost_child','security','infrastructure','weather','other'].map(c=><Button key={c} title={`${category===c?'✓ ':''}${c.replaceAll('_',' ')}`} secondary compact onPress={()=>setCategory(c)}/>)}
   <Text style={planStyles.help}>Severity</Text>
   {(['low','medium','high','critical'] as const).map(s=><Button key={s} title={`${severity===s?'✓ ':''}${s}`} secondary compact onPress={()=>setSeverity(s)}/>)}
   <Text style={planStyles.help}>Location</Text>
   {locations.map(l=><Button key={l.id} title={`${location===l.id?'✓ ':''}${l.name}`} secondary compact onPress={()=>setLocation(l.id)}/>)}
   <Button title={`${location===null?'✓ ':''}Location not confirmed`} secondary compact onPress={()=>setLocation(null)}/>
   <Field label='Reviewed summary' value={summary} onChangeText={setSummary} multiline/>
   <Button title='Save human review' disabled={pending||!summary.trim()} onPress={()=>{void run(async()=>{await setupRpc('review_incident',{p_id:incident.id,p_category:category,p_severity:severity,p_location_id:location,p_summary:summary});setEditing(false);});}}/>
  </>:null}
 </>;
}
