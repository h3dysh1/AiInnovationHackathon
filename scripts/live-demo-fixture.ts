// Synthetic, isolated scenarios. Original Riverside demo and operational history are retained.
export const liveDemoId='d1000000-0000-4000-8000-000000000001';
export const rosterDemoId='d2000000-0000-4000-8000-000000000001';
export const reserveAccounts=['Casey','Morgan','Avery','Riley','Jordan','Robin'].map(name=>({email:`${name.toLowerCase()}.demo@groundcontrol.example`,name:`${name} Demo`}));
export function scenarioSql(ids:string[],live:boolean):string {
 if(ids.length!==11||ids.some(id=>!/^[\da-f-]{36}$/i.test(id)))throw new Error('Expected eleven demo accounts.');
 const event=live?liveDemoId:rosterDemoId;
 const [mo,sarah,alex,jamie,taylor,casey,morgan,avery,riley,jordan,robin]=ids;
 const crew=ids.slice(1);
 return `begin;
 do $demo$ declare eid uuid:='${event}';loc uuid;water uuid;gate uuid;rid uuid:=gen_random_uuid();rev bigint;person uuid;shift record;ci uuid;certificate uuid;today date:=current_date;startat time:=(date_trunc('hour',now())-interval '1 hour')::time;endat time:=(date_trunc('hour',now())+interval '3 hours')::time;
 begin
 perform pg_advisory_xact_lock(hashtext('ground-control-scenarios-v1'));
 if exists(select 1 from public.events where id=eid) then return;end if;
 -- Use a fixed safe operating window for scheduling; the live fixture has explicit relative active shifts.
 if not ${live?'true':'false'} then today:=current_date+7;end if;
 insert into public.events(id,organisation_id,name,description,venue_name,start_date,end_date,operating_start_time,operating_end_time,timezone,expected_attendance,created_by,is_demo)
 values(eid,'d0000000-0000-4000-8000-000000000002','Riverside ${live?'Live Operations':'Automatic Scheduling'} - Demo','SYNTHETIC DEMO ONLY. ${live?'Baseline attendance is simulated; no AI analysis or human safety approval is fabricated.':'Generate shift times, automatically assign crew, review and publish.'}','Birrarung Marr',today,today,'09:00','17:00','UTC',15000,'${mo}',true);
 insert into public.event_setup_sessions(event_id,description,updated_by) values(eid,'Synthetic Riverside operating plan. Gate C needs one volunteer with First Aid coverage. Water Station B needs two volunteers with one First Aid holder. Mo authorizes all safety decisions.','${mo}');
 insert into public.locations(event_id,name,description) values(eid,'Lawn','Water station and gate area') returning id into loc;
 insert into public.posts(event_id,location_id,name,minimum_coverage,criticality,instructions,supervisor,escalation) values(eid,loc,'Gate C',1,'important','Keep access clear and report observations','Mo Demo','Radio 1') returning id into gate;
 insert into public.posts(event_id,location_id,name,minimum_coverage,criticality,instructions,supervisor,escalation) values(eid,loc,'Water Station B',2,'critical','Monitor water supply and report medical concerns','Mo Demo','Radio 1') returning id into water;
 insert into public.post_requirements(post_id,certification_type,minimum_count) values(gate,'First Aid',1),(water,'First Aid',1);
 insert into public.post_operating_windows(event_id,post_id,start_date,end_date,start_time,end_time) values(eid,gate,today,today,'09:00','17:00'),(eid,water,today,today,'09:00','17:00');
 insert into public.event_procedures(event_id,title,content) values
 (eid,'Heat and water response','SYNTHETIC DEMO procedure: for related heat reports with crowding and disrupted water supply, Mo reviews the evidence and considers two First Aid volunteers, three crew with crowd support experience and one maintenance volunteer at Water Station B. Check existing coverage, availability and source-post qualifications before any move. Keep access clear; First Aid personnel assess reported patients; maintenance investigates water supply. Mo approves all instructions and safety escalations.'),
 (eid,'No-show and radio procedure','After the configured grace period, Mo confirms the absence, reviews eligible qualified reserves and approves replacements. Volunteers acknowledge instructions, report en route, check in on arrival and confirm task completion. No automatic evacuation or emergency calls.');
 foreach person in array array[${crew.map(id=>`'${id}'::uuid`).join(',')}] loop
  insert into public.event_memberships(event_id,user_id,event_role) values(eid,person,'volunteer');
  insert into public.event_volunteer_preferences(event_id,user_id,desired_hours,maximum_hours,maximum_daily_hours,experience_tags,experience_reviewed,experience_reviewed_by)
  values(eid,person,8,24,24,case when person='${taylor}' then array['maintenance'] when person in('${riley}','${jordan}','${robin}') then array['crowd support'] else '{}' end,true,'${mo}');
  insert into public.volunteer_availability(event_id,user_id,starts_at,ends_at) values(eid,person,today::timestamptz,(today+1)::timestamptz);
 end loop;
 foreach person in array array['${sarah}'::uuid,'${alex}'::uuid,'${casey}'::uuid,'${morgan}'::uuid,'${avery}'::uuid] loop
  if not exists(select 1 from public.certifications where user_id=person and type='First Aid' and status='verified') then
   certificate:=gen_random_uuid();
   insert into public.certifications(id,user_id,title,storage_path,mime_type,size_bytes,status,type,holder_name,issued_at,expires_at,verification_notes)
   values(certificate,person,'SYNTHETIC DEMO qualification',person::text||'/'||certificate::text||'/synthetic.pdf','application/pdf',100,'verified','First Aid',(select display_name from public.profiles where id=person),'2026-01-01','2028-12-31','Synthetic eligibility fixture; no document extraction or real qualification claimed.');
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub','${mo}',true);
 select setup_revision into rev from public.events where id=eid;
 for shift in select entity_kind,entity_id from public.setup_entity_reviews where event_id=eid loop perform public.confirm_setup_entity(eid,shift.entity_kind,shift.entity_id,rev);end loop;
 perform public.verify_event_model(eid,rev);
 perform public.publish_event_recruitment(eid,'${live?'RIVERLIVE':'RIVERROSTER'}',rev);
 if ${live?'true':'false'} then
  perform public.create_shift_draft(eid,rid,4,rev);
  -- A labelled live simulation, independent of the future-dated roster demonstration.
  delete from public.shifts where roster_id=rid;
  insert into public.shifts(roster_id,event_id,post_id,starts_at,ends_at,minimum_coverage,requirements,criticality,instructions)
  select rid,eid,p.id,now()-interval '1 hour',now()+interval '3 hours',p.minimum_coverage,'[{"certification_type":"First Aid","experience_requirement":null,"minimum_count":1}]',p.criticality,p.instructions from public.posts p where p.event_id=eid;
  for shift in select id,post_id from public.shifts where roster_id=rid loop
   foreach person in array case when shift.post_id=gate then array['${sarah}'::uuid,'${casey}'::uuid] else array['${alex}'::uuid,'${jamie}'::uuid] end loop
    insert into public.assignments(roster_id,shift_id,user_id,locked) values(rid,shift.id,person,true) returning id into ci;
    insert into public.check_ins(assignment_id,user_id,status,checked_in_at) values(ci,person,case when person='${alex}' then 'scheduled' else 'checked_in' end,case when person='${alex}' then null else now() end);
   end loop;
  end loop;
  update public.rosters set status='published',published_at=now(),published_by='${mo}' where id=rid;
  update public.events set status='live',no_show_grace_minutes=0 where id=eid;
  update public.volunteer_availability set starts_at=now()-interval '2 hours',ends_at=now()+interval '4 hours' where event_id=eid;
  insert into public.event_standby(event_id,user_id,available_until) select eid,id,now()+interval '4 hours' from unnest(array['${taylor}'::uuid,'${morgan}'::uuid,'${avery}'::uuid,'${riley}'::uuid,'${jordan}'::uuid,'${robin}'::uuid]) id;
  insert into public.operational_timeline(event_id,actor_id,event_type,detail) values(eid,'${mo}','demo_baseline','SYNTHETIC simulation: initial check-ins and standby states prepared; Alex absent at Water B. No safety response has been approved.');
 end if;
 end;$demo$;
 commit;`;
}
