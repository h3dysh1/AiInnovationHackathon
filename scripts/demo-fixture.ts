// Server-side fixtures only: never import this module from the Expo application.
import { Buffer } from 'node:buffer';
export const demo = {
  projectRef: 'vpkedekkwbzfpaseycuc',
  eventId: 'd0000000-0000-4000-8000-000000000001',
  organisationId: 'd0000000-0000-4000-8000-000000000002',
  locationId: 'd0000000-0000-4000-8000-000000000003',
  postId: 'd0000000-0000-4000-8000-000000000004',
  certificateId: 'd0000000-0000-4000-8000-000000000005',
  rosterId: 'd0000000-0000-4000-8000-000000000006',
  joinCode: 'RIVERDEMO26',
  accounts: [
    { email: 'mo.demo@groundcontrol.example', name: 'Mo Demo', role: 'coordinator' },
    { email: 'sarah.demo@groundcontrol.example', name: 'Sarah Demo', role: 'volunteer' },
    { email: 'alex.demo@groundcontrol.example', name: 'Alex Demo', role: 'volunteer' },
    { email: 'jamie.demo@groundcontrol.example', name: 'Jamie Demo', role: 'volunteer' },
    { email: 'taylor.demo@groundcontrol.example', name: 'Taylor Demo', role: 'volunteer' },
  ],
} as const;

export function certificatePdf(holder = 'Sarah Demo'): Buffer {
  const lines = [
    'SYNTHETIC DEMO CERTIFICATE - NOT A REAL QUALIFICATION',
    `Holder: ${holder}`, 
    'Qualification: HLTAID011 Provide First Aid',
    'Issuer: Ground Control Demo Training (fictional)',
    'Certificate number: DEMO-FA-001',
    'Issued: 2026-01-01',
    'Expires: 2028-12-31',
    'For software demonstration only. No operational authority.',
  ];
  const stream = `BT /F1 12 Tf 48 740 Td 22 TL ${lines.map((line, i) =>
    `${i ? 'T* ' : ''}(${line.replace(/[\\()]/g, '\\$&')}) Tj`).join('\n')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset =>
    `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export function demoSql(userIds: string[], sizeBytes: number): string {
  if (userIds.length !== demo.accounts.length || userIds.some(id => !/^[\da-f-]{36}$/i.test(id))) {
    throw new Error('Expected five valid demo account IDs.');
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 10485760) {
    throw new Error('Invalid certificate size.');
  }
  const [mo, sarah] = userIds;
  const crew = userIds.slice(1);
  return `begin;
-- A repeated seed retains all incidents, attendance and human decisions.
do $seed$
declare rev bigint; readiness jsonb; s public.shifts; uid uuid; review record;
begin
 perform pg_advisory_xact_lock(hashtext('ground-control-riverside-demo-v1'));
 if exists(select 1 from public.events where id='${demo.eventId}') then return; end if;
 update public.account_roles set role='coordinator' where user_id='${mo}';
 insert into public.organisations(id,name,created_by) values('${demo.organisationId}','Ground Control Demo','${mo}');
 insert into public.events(id,organisation_id,name,description,venue_name,address,start_date,end_date,operating_start_time,operating_end_time,timezone,expected_attendance,created_by)
 values('${demo.eventId}','${demo.organisationId}','Riverside 2026 - Demo','Synthetic demo: Water B with four volunteers including Sarah, a First Aid holder. All records are fictional.','Birrarung Marr','Melbourne VIC','2026-12-12','2026-12-14','09:00','17:00','Australia/Melbourne',15000,'${mo}');
 insert into public.event_setup_sessions(event_id,description,updated_by) values('${demo.eventId}','Demo operating plan: Water B requires four volunteers including one First Aid holder, daily 09:00-17:00. Mo Demo supervises; escalate on radio channel 1. Synthetic software demo only.','${mo}');
 insert into public.locations(id,event_id,name,description) values('${demo.locationId}','${demo.eventId}','Lawn','Demo location near the main stage.');
 insert into public.posts(id,event_id,location_id,name,description,minimum_coverage,criticality,instructions,supervisor,escalation)
 values('${demo.postId}','${demo.eventId}','${demo.locationId}','Water Station B','Distribute water and monitor the queue.',4,'important','Keep access clear. Report incidents to Mo; wait for human approval of safety responses.','Mo Demo','Radio channel 1');
 insert into public.post_requirements(post_id,certification_type,minimum_count) values('${demo.postId}','First Aid',1);
 insert into public.post_operating_windows(event_id,post_id,start_date,end_date,start_time,end_time) values('${demo.eventId}','${demo.postId}','2026-12-12','2026-12-14','09:00','17:00');
 insert into public.event_procedures(event_id,title,content) values('${demo.eventId}','Demo incident escalation','Software demo only: report exact observations and location to Mo on radio channel 1. Mo reviews the evidence and approves any operational response.');
 insert into public.event_memberships(event_id,user_id,event_role)
 select '${demo.eventId}',id,'volunteer' from unnest(array[${crew.map(id => `'${id}'::uuid`).join(',')}]) id;
 insert into public.certifications(id,user_id,title,storage_path,mime_type,size_bytes,status,type,holder_name,certificate_number,issuer,issued_at,expires_at,verification_notes)
 values('${demo.certificateId}','${sarah}','First Aid - SYNTHETIC DEMO','${sarah}/${demo.certificateId}/demo-first-aid.pdf','application/pdf',${sizeBytes},'verified','HLTAID011','Sarah Demo','DEMO-FA-001','Ground Control Demo Training (fictional)','2026-01-01','2028-12-31','Synthetic seed fixture, pre-verified for software demonstration only; no AI extraction or human credential review is claimed.');
 foreach uid in array array[${crew.map(id => `'${id}'::uuid`).join(',')}] loop
  insert into public.volunteer_profiles(user_id,experience_level) values(uid,'Synthetic demo volunteer') on conflict(user_id) do nothing;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform public.save_event_onboarding('${demo.eventId}',
   '[{"startDate":"2026-12-12","endDate":"2026-12-12","startTime":"09:00","endTime":"17:00"},{"startDate":"2026-12-13","endDate":"2026-12-13","startTime":"09:00","endTime":"17:00"},{"startDate":"2026-12-14","endDate":"2026-12-14","startTime":"09:00","endTime":"17:00"}]',
   '{"preferredPosts":[],"avoidedPosts":[],"preferredStart":"","preferredEnd":"","desiredHours":24,"maximumHours":24,"maximumDailyHours":8,"experienceTags":[]}');
 end loop;
 perform set_config('request.jwt.claim.sub','${mo}',true);
 select setup_revision into rev from public.events where id='${demo.eventId}';
 for review in select entity_kind,entity_id from public.setup_entity_reviews where event_id='${demo.eventId}' loop
  perform public.confirm_setup_entity('${demo.eventId}',review.entity_kind,review.entity_id,rev);
 end loop;
 perform public.verify_event_model('${demo.eventId}',rev);
 perform public.publish_event_recruitment('${demo.eventId}','${demo.joinCode}',rev);
 perform public.create_shift_draft('${demo.eventId}','${demo.rosterId}',4,rev);
 for s in select * from public.shifts where roster_id='${demo.rosterId}' order by starts_at loop
  foreach uid in array array[${crew.map(id => `'${id}'::uuid`).join(',')}] loop
   select revision into rev from public.rosters where id='${demo.rosterId}';
   perform public.set_roster_assignment('${demo.rosterId}',rev,s.id,uid);
  end loop;
 end loop;
 readiness:=public.get_roster_readiness('${demo.rosterId}');
 perform public.publish_roster('${demo.rosterId}',(readiness->>'revision')::bigint,(readiness->>'staffingRevision')::bigint);
end; $seed$;
commit;`;
}
