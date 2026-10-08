begin;
alter table public.events add column if not exists demo_source_id uuid references public.events(id);
create or replace function public.restart_riverside_demo(p_event_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare source public.events;eid uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();location record;post record;old_shift record;member record;loc uuid;pid uuid;sid uuid;aid uuid;
begin
 select * into source from public.events where id=p_event_id for update;
 if source.id is null or not source.is_demo or not public.is_event_manager(source.id) or (source.id<>'d1000000-0000-4000-8000-000000000001' and source.demo_source_id is distinct from 'd1000000-0000-4000-8000-000000000001'::uuid) then raise exception 'Only the prepared Riverside live demo can be restarted';end if;
 if exists(select 1 from public.events where id<>source.id and demo_source_id='d1000000-0000-4000-8000-000000000001' and status='live') then raise exception 'Open the current live demo before starting a fresh scenario';end if;
 -- End only this explicitly selected synthetic scenario. Historical records remain intact.
 update public.events set status='completed' where id=source.id;
 update public.rosters set status='superseded' where event_id=source.id;
 update public.response_plans set status=case when status in ('proposed','modified') then 'dismissed' else 'completed' end,processing_status='complete',lease_until=null,revision=revision+1 where event_id=source.id and status not in ('dismissed','completed');
 update public.dispatch_requests d set status='completed',updated_at=now() from public.response_plans r where d.response_plan_id=r.id and r.event_id=source.id and d.status not in ('completed','declined');
 update public.incidents set status='resolved',resolution_notes='Synthetic demo ended when the coordinator requested a fresh scenario.',resolved_at=now(),processing_status='complete',processing_lease_until=null where event_id=source.id and status<>'resolved';
 update public.risk_alerts set status='resolved',resolved_at=now() where event_id=source.id and status='open';
 insert into public.events(id,organisation_id,name,description,venue_name,start_date,end_date,operating_start_time,operating_end_time,timezone,expected_attendance,created_by,is_demo,demo_source_id,status,no_show_grace_minutes)
 values(eid,source.organisation_id,'Riverside Live Operations - Demo',source.description,source.venue_name,current_date,current_date,'09:00','17:00','UTC',source.expected_attendance,auth.uid(),true,'d1000000-0000-4000-8000-000000000001','live',0);
 insert into public.event_memberships(event_id,user_id,event_role,status) select eid,user_id,event_role,status from public.event_memberships where event_id=source.id on conflict(event_id,user_id) do nothing;
 insert into public.event_procedures(event_id,title,content) select eid,title,content from public.event_procedures where event_id=source.id;
 for location in select * from public.locations where event_id=source.id loop
  insert into public.locations(event_id,name,description) values(eid,location.name,location.description) returning id into loc;
  for post in select * from public.posts where location_id=location.id loop
   insert into public.posts(event_id,location_id,name,description,minimum_coverage,criticality,instructions,supervisor,escalation) values(eid,loc,post.name,post.description,post.minimum_coverage,post.criticality,post.instructions,post.supervisor,post.escalation) returning id into pid;
   insert into public.post_requirements(post_id,certification_type,experience_requirement,minimum_count) select pid,certification_type,experience_requirement,minimum_count from public.post_requirements where post_id=post.id;
  end loop;
 end loop;
 insert into public.event_volunteer_preferences(event_id,user_id,desired_hours,maximum_hours,maximum_daily_hours,experience_tags,experience_reviewed,experience_reviewed_by)
 select eid,user_id,8,24,24,experience_tags,experience_reviewed,experience_reviewed_by from public.event_volunteer_preferences where event_id=source.id;
 insert into public.volunteer_availability(event_id,user_id,starts_at,ends_at) select eid,user_id,now()-interval '2 hours',now()+interval '4 hours' from public.event_memberships where event_id=eid and event_role='volunteer' and status='active';
 insert into public.rosters(id,event_id,model_revision,status,created_by,published_by,published_at) values(rid,eid,(select setup_revision from public.events where id=eid),'published',auth.uid(),auth.uid(),now());
 for post in select * from public.posts where event_id=eid loop
  insert into public.shifts(roster_id,event_id,post_id,starts_at,ends_at,minimum_coverage,requirements,criticality,instructions)
   values(rid,eid,post.id,now()-interval '1 hour',now()+interval '3 hours',post.minimum_coverage,'[{"certification_type":"First Aid","experience_requirement":null,"minimum_count":1}]',post.criticality,post.instructions) returning id into sid;
  for member in select m.user_id,p.display_name,u.email from public.event_memberships m join public.profiles p on p.id=m.user_id join auth.users u on u.id=m.user_id where m.event_id=eid and m.status='active' and
   ((post.name='Gate C' and u.email in ('sarah.demo@groundcontrol.example','casey.demo@groundcontrol.example')) or(post.name='Water Station B' and u.email in ('alex.demo@groundcontrol.example','jamie.demo@groundcontrol.example'))) loop
   insert into public.assignments(roster_id,shift_id,user_id,locked) values(rid,sid,member.user_id,true) returning id into aid;
   insert into public.check_ins(assignment_id,user_id,status,checked_in_at) values(aid,member.user_id,case when member.email='alex.demo@groundcontrol.example' then 'scheduled' else 'checked_in' end,case when member.email='alex.demo@groundcontrol.example' then null else now() end);
  end loop;
 end loop;
 insert into public.event_standby(event_id,user_id,available_until) select eid,m.user_id,now()+interval '4 hours' from public.event_memberships m where m.event_id=eid and m.event_role='volunteer' and m.status='active' and not exists(select 1 from public.assignments where roster_id=rid and user_id=m.user_id);
 insert into public.operational_timeline(event_id,actor_id,event_type,detail) values(source.id,auth.uid(),'demo_ended','Coordinator started a fresh synthetic scenario; all prior evidence and decisions retained'),(eid,auth.uid(),'demo_baseline','SYNTHETIC simulation: initial attendance and standby states prepared; Alex absent at Water B. No safety response approved.');
 begin perform public.wake_incident_worker();exception when others then null;end;
 return eid;
end; $$;
revoke all on function public.restart_riverside_demo(uuid) from public,anon;
grant execute on function public.restart_riverside_demo(uuid) to authenticated;
commit;
