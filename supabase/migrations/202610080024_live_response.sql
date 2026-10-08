begin;
alter table public.assignments add column if not exists effective_starts_at timestamptz,add column if not exists effective_ends_at timestamptz,
 add column if not exists reassigned_from_id uuid references public.assignments(id),add column if not exists response_plan_id uuid references public.response_plans(id);
alter table public.response_plans add column if not exists target_shift_id uuid references public.shifts(id),add column if not exists target_location_id uuid references public.locations(id),
 add column if not exists revision bigint not null default 0,add column if not exists procedure_ids jsonb not null default '[]',
 add column if not exists instruction text,add column if not exists processing_status text not null default 'queued' check(processing_status in ('queued','processing','complete','failed')),
 add column if not exists processing_attempt integer not null default 0,add column if not exists processing_failures integer not null default 0,
 add column if not exists processing_error text,add column if not exists lease_until timestamptz,add column if not exists next_attempt_at timestamptz not null default now();
create table if not exists public.event_standby(event_id uuid not null references public.events(id),user_id uuid not null references auth.users(id),
 available_until timestamptz not null,updated_at timestamptz not null default now(),primary key(event_id,user_id));
alter table public.event_standby enable row level security;
revoke all on public.event_standby from public,anon,authenticated;
create or replace function public.set_standby(p_event_id uuid,p_available_until timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_member(p_event_id) or not exists(select 1 from public.events where id=p_event_id and status='live') then raise exception 'Live event unavailable'; end if;
 if p_available_until is null then delete from public.event_standby where event_id=p_event_id and user_id=auth.uid();return;end if;
 if p_available_until<now() or p_available_until>now()+interval '24 hours' then raise exception 'Use a standby end time within 24 hours'; end if;
 insert into public.event_standby(event_id,user_id,available_until) values(p_event_id,auth.uid(),p_available_until)
 on conflict(event_id,user_id) do update set available_until=excluded.available_until,updated_at=now();
end; $$;

create or replace function public.live_coverage(p_event_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('shift_id',s.id,'location_id',p.location_id,'post',p.name,'location',l.name,
 'required',s.minimum_coverage,'assigned',(select count(*) from public.assignments a where a.shift_id=s.id and coalesce(a.effective_ends_at,s.ends_at)>now()),
 'checked_in',(select count(*) from public.assignments a join public.check_ins c on c.assignment_id=a.id where a.shift_id=s.id and c.status='checked_in' and coalesce(a.effective_starts_at,s.starts_at)<=now() and coalesce(a.effective_ends_at,s.ends_at)>now()),
 'qualifications',(select coalesce(jsonb_agg(jsonb_build_object('label',coalesce(q->>'certification_type',q->>'experience_requirement'),'required',(q->>'minimum_count')::integer,
 'actual',(select count(*) from public.assignments a join public.check_ins c on c.assignment_id=a.id where a.shift_id=s.id and c.status='checked_in' and coalesce(a.effective_starts_at,s.starts_at)<=now() and coalesce(a.effective_ends_at,s.ends_at)>now() and public.user_meets_shift_requirement(a.user_id,p_event_id,q)))),'[]') from jsonb_array_elements(s.requirements) q),
 'criticality',s.criticality,'ends_at',s.ends_at)),'[]')
 from public.shifts s join public.rosters r on r.id=s.roster_id and r.status='published' join public.posts p on p.id=s.post_id join public.locations l on l.id=p.location_id
 where s.event_id=p_event_id and s.starts_at<=now() and s.ends_at>now();
$$;
revoke all on function public.live_coverage(uuid) from public,anon,authenticated;

create or replace function public.live_candidate_problem(p_shift_id uuid,p_user_id uuid,p_req jsonb)
returns text language plpgsql stable security definer set search_path='' as $$
declare s public.shifts;src public.assignments;source_shift public.shifts;pref public.event_volunteer_preferences;q jsonb;cnt integer;hours numeric;daily numeric;tz text;
begin
 select * into s from public.shifts where id=p_shift_id;
 if s.id is null or not exists(select 1 from public.rosters where id=s.roster_id and status='published') or s.starts_at>now() or s.ends_at<=now()
  or not exists(select 1 from public.events where id=s.event_id and status='live') then return 'Destination is not an active published shift'; end if;
 if not exists(select 1 from public.event_memberships where event_id=s.event_id and user_id=p_user_id and status='active' and event_role='volunteer') then return 'Inactive volunteer membership'; end if;
 if not public.user_meets_shift_requirement(p_user_id,s.event_id,jsonb_build_object('certification_type',p_req->>'certificationType','experience_requirement',p_req->>'experienceRequirement')) then return 'Required qualification or reviewed experience unavailable'; end if;
 if exists(select 1 from public.assignments where shift_id=s.id and user_id=p_user_id) then return 'Already assigned to this shift'; end if;
 select * into pref from public.event_volunteer_preferences where event_id=s.event_id and user_id=p_user_id;
 if pref.user_id is null or not coalesce((select range_agg(tstzrange(starts_at,ends_at,'[)')) @> tstzrange(now(),s.ends_at,'[)') from public.volunteer_availability where event_id=s.event_id and user_id=p_user_id),false) then return 'Unavailable for the remaining shift'; end if;
 select a.* into src from public.assignments a join public.shifts x on x.id=a.shift_id join public.rosters r on r.id=a.roster_id
 join public.check_ins c on c.assignment_id=a.id where r.event_id=s.event_id and r.status='published' and a.user_id=p_user_id and c.status='checked_in'
  and coalesce(a.effective_starts_at,x.starts_at)<=now() and coalesce(a.effective_ends_at,x.ends_at)>now() order by x.starts_at limit 1;
 if src.id is null and not exists(select 1 from public.event_standby where event_id=s.event_id and user_id=p_user_id and available_until>=s.ends_at) then return 'Volunteer has not confirmed standby availability'; end if;
 if exists(select 1 from public.dispatch_requests where volunteer_id=p_user_id and status in ('pending','accepted','en_route','arrived')) then return 'Already responding to another request'; end if;
 if exists(select 1 from public.assignments a join public.shifts x on x.id=a.shift_id join public.rosters r on r.id=a.roster_id where a.user_id=p_user_id
  and a.id is distinct from src.id and r.status in ('draft','published') and coalesce(a.effective_starts_at,x.starts_at)<s.ends_at and coalesce(a.effective_ends_at,x.ends_at)>now()) then return 'Overlaps another assignment'; end if;
 if src.id is not null then
  select * into source_shift from public.shifts where id=src.shift_id;
  select count(*) into cnt from public.assignments a join public.check_ins c on c.assignment_id=a.id where a.shift_id=src.shift_id and a.id<>src.id and c.status='checked_in' and coalesce(a.effective_ends_at,source_shift.ends_at)>now();
  if cnt<source_shift.minimum_coverage then return 'Moving this volunteer would break source staffing'; end if;
  for q in select value from jsonb_array_elements(source_shift.requirements) loop
   select count(*) into cnt from public.assignments a join public.check_ins c on c.assignment_id=a.id where a.shift_id=src.shift_id and a.id<>src.id and c.status='checked_in' and coalesce(a.effective_ends_at,source_shift.ends_at)>now() and public.user_meets_shift_requirement(a.user_id,s.event_id,q);
   if cnt<(q->>'minimum_count')::integer then return 'Moving this volunteer would break source qualification coverage'; end if;
  end loop;
 end if;
 select timezone into tz from public.events where id=s.event_id;
 select coalesce(sum(extract(epoch from (case when a.id=src.id then now() else coalesce(a.effective_ends_at,x.ends_at) end-coalesce(a.effective_starts_at,x.starts_at)))/3600),0),
  coalesce(sum(extract(epoch from (case when a.id=src.id then now() else coalesce(a.effective_ends_at,x.ends_at) end-coalesce(a.effective_starts_at,x.starts_at)))/3600) filter(where (x.starts_at at time zone tz)::date=(now() at time zone tz)::date),0)
 into hours,daily from public.assignments a join public.shifts x on x.id=a.shift_id where a.roster_id=s.roster_id and a.user_id=p_user_id;
 if hours+extract(epoch from(s.ends_at-now()))/3600>pref.maximum_hours or daily+extract(epoch from(s.ends_at-now()))/3600>pref.maximum_daily_hours then return 'Maximum working hours exceeded'; end if;
 return null;
end; $$;
revoke all on function public.live_candidate_problem(uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function public.response_candidates(p_response_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.response_plans;req jsonb;idx integer:=0;v jsonb:='[]';c record;problem text;source_name text;
begin
 select * into r from public.response_plans where id=p_response_id;
 if r.id is null or not public.is_event_manager(r.event_id) then raise exception 'Response unavailable'; end if;
 for req in select value from jsonb_array_elements(r.resources) loop
  for c in select m.user_id,p.display_name from public.event_memberships m join public.profiles p on p.id=m.user_id where m.event_id=r.event_id and m.status='active' and m.event_role='volunteer' order by p.display_name loop
   problem:=public.live_candidate_problem(r.target_shift_id,c.user_id,req);
   select p.name into source_name from public.assignments a join public.shifts s on s.id=a.shift_id join public.posts p on p.id=s.post_id join public.check_ins ci on ci.assignment_id=a.id
    where a.user_id=c.user_id and s.event_id=r.event_id and s.starts_at<=now() and coalesce(a.effective_ends_at,s.ends_at)>now() and ci.status='checked_in' limit 1;
   v:=v||jsonb_build_array(jsonb_build_object('userId',c.user_id,'name',c.display_name,'resourceIndex',idx,'eligible',problem is null,'reason',coalesce(problem,'Qualifications, availability, hours and source coverage checked'),
    'source',coalesce(source_name,'Confirmed standby'),'rank',case when source_name is null then 0 else 1 end));
  end loop; idx:=idx+1;
 end loop;
 return v;
end; $$;

create or replace function public.validate_response_resources(p_event_id uuid,p_resources jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare q jsonb;total integer:=0;
begin
 if jsonb_typeof(p_resources) is distinct from 'array' or jsonb_array_length(p_resources) not between 1 and 6 then raise exception 'Use 1–6 resource groups'; end if;
 for q in select value from jsonb_array_elements(p_resources) loop
  if jsonb_typeof(q) is distinct from 'object' or not(q ?& array['label','count','certificationType','experienceRequirement']) or q->>'label' is null or (q->>'count') is null or (q->>'count')::integer not between 1 and 6 or char_length(q->>'label') not between 1 and 100 then raise exception 'Invalid resource requirement'; end if;
  total:=total+(q->>'count')::integer;
  if q->>'certificationType' is not null and not exists(select 1 from public.certifications c where public.qualification_key(c.type)=public.qualification_key(q->>'certificationType') and exists(select 1 from public.event_memberships m where m.event_id=p_event_id and m.user_id=c.user_id and m.status='active')) then raise exception 'Unknown event qualification'; end if;
  if q->>'experienceRequirement' is not null and not exists(select 1 from public.event_volunteer_preferences p,unnest(p.experience_tags) tag where p.event_id=p_event_id and p.experience_reviewed and public.qualification_key(tag)=public.qualification_key(q->>'experienceRequirement')) then raise exception 'Unknown reviewed experience'; end if;
 end loop;
 if total>12 then raise exception 'Response supports at most 12 volunteers'; end if;
end; $$;
revoke all on function public.validate_response_resources(uuid,jsonb) from public,anon,authenticated;

create or replace function public.propose_response(p_incident_id uuid default null,p_risk_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid;pid uuid;
begin
 if (p_incident_id is null)=(p_risk_id is null) then raise exception 'Choose one response source'; end if;
 if p_incident_id is not null then select event_id into eid from public.incidents where id=p_incident_id and status<>'resolved';
 else select event_id into eid from public.risk_alerts where id=p_risk_id and status='open'; end if;
 if eid is null or not public.is_event_manager(eid) then raise exception 'Response source unavailable'; end if;
 perform 1 from public.events where id=eid for update;
 select id into pid from public.response_plans where event_id=eid and incident_id is not distinct from p_incident_id and risk_alert_id is not distinct from p_risk_id and status not in ('dismissed','completed') order by created_at desc limit 1;
 if pid is null then
 insert into public.response_plans(event_id,incident_id,risk_alert_id,title,rationale,actions,resources,processing_status)
 values(eid,p_incident_id,p_risk_id,'Response awaiting analysis','Original evidence retained; Mo reviews before dispatch.','[]','[]','queued') returning id into pid;
 insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail) values(eid,p_incident_id,auth.uid(),'response_requested','Response planning queued');
 end if;
 begin perform public.wake_incident_worker(); exception when others then null; end;
 return (select to_jsonb(r) from public.response_plans r where id=pid);
end; $$;

create or replace function public.claim_response_processing()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.response_plans;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 select * into r from public.response_plans where status='proposed' and processing_failures<3
 and ((processing_status in ('queued','failed') and next_attempt_at<=now()) or (processing_status='processing' and lease_until<now()))
 order by created_at for update skip locked limit 1;
 if r.id is null then return null; end if;
 update public.response_plans set processing_status='processing',processing_attempt=processing_attempt+1,lease_until=now()+interval '3 minutes',
  processing_failures=processing_failures+case when processing_status='processing' then 1 else 0 end where id=r.id returning * into r;
 return to_jsonb(r);
end; $$;
create or replace function public.response_ai_context(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.response_plans;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 select * into r from public.response_plans where id=p_id;
 return jsonb_build_object('eventId',r.event_id,'source',case when r.incident_id is not null then (select to_jsonb(i) from public.incidents i where id=r.incident_id) else (select to_jsonb(x) from public.risk_alerts x where id=r.risk_alert_id) end,
 'locations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.locations where event_id=r.event_id),'[]'),
 'procedures',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'content',content,'source',coalesce((select source_type||' · '||source_reference from public.setup_entity_reviews v where v.entity_id=public.event_procedures.id and v.event_id=r.event_id and v.entity_kind='procedure'),'Reviewed event operating procedure'))) from public.event_procedures where event_id=r.event_id),'[]'),
 'certificationTypes',coalesce((select jsonb_agg(distinct c.type) from public.certifications c join public.event_memberships m on m.user_id=c.user_id and m.event_id=r.event_id where c.status in ('verified','expired') and c.type is not null),'[]'),
 'experienceTags',coalesce((select jsonb_agg(distinct tag) from public.event_volunteer_preferences p,unnest(p.experience_tags) tag where p.event_id=r.event_id and p.experience_reviewed),'[]'));
end; $$;
create or replace function public.finish_response_processing(p_id uuid,p_attempt integer,p_draft jsonb,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.response_plans;d jsonb:=p_draft;failure text:=p_error;sid uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 select * into r from public.response_plans where id=p_id for update;
 if r.id is null or r.processing_status<>'processing' or r.processing_attempt<>p_attempt or r.status<>'proposed' then return false; end if;
 if failure is null then begin
  if d is null or char_length(d->>'title') not between 1 and 160 or char_length(d->>'instruction') not between 1 and 1000 then raise exception 'Invalid response'; end if;
  perform public.validate_response_resources(r.event_id,d->'resources');
  if jsonb_typeof(d->'actions')<>'array' or jsonb_array_length(d->'actions') not between 1 and 8 or jsonb_array_length(d->'procedureIds')<1 then raise exception 'Response needs grounded actions'; end if;
  if exists(select 1 from jsonb_array_elements_text(d->'procedureIds') ref where not exists(select 1 from public.event_procedures where id=ref::uuid and event_id=r.event_id)) then raise exception 'Unknown procedure'; end if;
  if d->>'targetLocationId' is not null and not exists(select 1 from public.locations where id=(d->>'targetLocationId')::uuid and event_id=r.event_id) then raise exception 'Unknown response location'; end if;
  -- A destination is never silently chosen among multiple posts at a location.
  select case when count(*)=1 then (array_agg(s.id))[1] end into sid from public.shifts s join public.rosters ro on ro.id=s.roster_id where s.event_id=r.event_id and ro.status='published' and s.starts_at<=now() and s.ends_at>now() and s.post_id in(select id from public.posts where location_id=(d->>'targetLocationId')::uuid);
  update public.response_plans set title=d->>'title',rationale=d->>'rationale',actions=d->'actions',resources=d->'resources',
   target_location_id=(d->>'targetLocationId')::uuid,target_shift_id=sid,procedure_ids=d->'procedureIds',instruction=d->>'instruction',revision=revision+1 where id=p_id;
 exception when others then failure:='Response could not be validated. Review the original evidence and draft a manual response.'; end; end if;
 update public.response_plans set processing_status=case when failure is null then 'complete' else 'failed' end,processing_error=left(failure,1000),lease_until=null,
  processing_failures=case when failure is null then 0 else processing_failures+1 end,next_attempt_at=now()+interval '1 minute'*power(2,least(processing_failures,3)) where id=p_id;
 insert into public.operational_timeline(event_id,incident_id,event_type,detail) values(r.event_id,r.incident_id,
  case when failure is null then 'response_drafted' else 'response_ai_failed' end,case when failure is null then 'Procedure-grounded draft ready for human review' else 'Response AI failed; manual review remains available' end);
 return true;
end; $$;
create table if not exists public.response_history(id bigint generated always as identity primary key,response_id uuid not null references public.response_plans(id),
 actor_id uuid,previous_data jsonb,next_data jsonb not null,created_at timestamptz not null default now());
alter table public.response_history enable row level security;
revoke all on public.response_history from public,anon,authenticated;
grant select on public.response_history to authenticated;
drop policy if exists "Managers read response history" on public.response_history;
create policy "Managers read response history" on public.response_history for select to authenticated using(exists(select 1 from public.response_plans r where r.id=response_id and public.is_event_manager(r.event_id)));
create or replace function public.audit_response() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.response_history(response_id,actor_id,previous_data,next_data) values(new.id,auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));return new;end; $$;
drop trigger if exists response_audit on public.response_plans;
create trigger response_audit after insert or update on public.response_plans for each row execute function public.audit_response();

create or replace function public.modify_response(p_id uuid,p_revision bigint,p_shift_id uuid,p_instruction text,p_resources jsonb,p_actions jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare r public.response_plans;
begin
 select * into r from public.response_plans where id=p_id for update;
 if r.id is null or not public.is_event_manager(r.event_id) or r.revision<>p_revision or r.status not in ('proposed','modified') then raise exception 'Response changed or is unavailable'; end if;
 if not exists(select 1 from public.shifts s join public.rosters ro on ro.id=s.roster_id where s.id=p_shift_id and s.event_id=r.event_id and ro.status='published' and s.starts_at<=now() and s.ends_at>now()) then raise exception 'Choose an active destination shift'; end if;
 if p_instruction is null or char_length(trim(p_instruction)) not between 1 and 1000 or jsonb_typeof(p_actions) is distinct from 'array' or jsonb_array_length(p_actions) not between 1 and 8 then raise exception 'Enter concise instructions and actions'; end if;
 if exists(select 1 from jsonb_array_elements(p_actions) x where jsonb_typeof(x) is distinct from 'string' or char_length(trim(x#>>'{}')) not between 1 and 500) then raise exception 'Invalid action';end if;
 perform public.validate_response_resources(r.event_id,p_resources);
 update public.response_plans set target_shift_id=p_shift_id,instruction=trim(p_instruction),resources=p_resources,actions=p_actions,status='modified',
  processing_status='complete',processing_error=null,lease_until=null,revision=revision+1 where id=p_id;
 insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail) values(r.event_id,r.incident_id,auth.uid(),'response_modified','Coordinator reviewed destination, actions, resources and instructions');
end; $$;
create or replace function public.dismiss_response(p_id uuid,p_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.response_plans;
begin
 select * into r from public.response_plans where id=p_id for update;
 if r.id is null or not public.is_event_manager(r.event_id) or r.revision<>p_revision or r.status not in ('proposed','modified') then raise exception 'Response unavailable'; end if;
 update public.response_plans set status='dismissed',revision=revision+1,processing_status='complete',lease_until=null where id=p_id;
 insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail) values(r.event_id,r.incident_id,auth.uid(),'response_dismissed','Coordinator dismissed the response');
end; $$;
create or replace function public.retry_response_processing(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.response_plans;
begin
 select * into r from public.response_plans where id=p_id for update;
 if r.id is null or not public.is_event_manager(r.event_id) or r.status<>'proposed' then raise exception 'Response unavailable'; end if;
 if r.processing_status='processing' and r.lease_until>now() then return; end if;
 update public.response_plans set processing_status='queued',processing_failures=0,next_attempt_at=now(),lease_until=null where id=p_id;
 begin perform public.wake_incident_worker(); exception when others then null; end;
end; $$;

drop function if exists public.approve_response(uuid,text);
create or replace function public.approve_response(p_response_id uuid,p_revision bigint,p_selections jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.response_plans;eid uuid;s public.shifts;sel jsonb;req jsonb;uid uuid;src public.assignments;aid uuid;idx integer;problem text;
begin
 select event_id into eid from public.response_plans where id=p_response_id;
 if eid is null or not public.is_event_manager(eid) then raise exception 'Response unavailable'; end if;
 perform 1 from public.events where id=eid for update;
 select * into r from public.response_plans where id=p_response_id for update;
 if r.status in ('approved','completed') then return to_jsonb(r); end if;
 if r.status not in ('proposed','modified') or r.revision<>p_revision or r.processing_status<>'complete' then raise exception 'Review the current completed response draft'; end if;
 if (r.incident_id is not null and not exists(select 1 from public.incidents where id=r.incident_id and status<>'resolved')) or (r.risk_alert_id is not null and not exists(select 1 from public.risk_alerts where id=r.risk_alert_id and status='open')) then raise exception 'Response source has been resolved';end if;
 if char_length(trim(r.instruction)) not between 1 and 1000 then raise exception 'Review the volunteer instruction'; end if;
 perform public.validate_response_resources(eid,r.resources);
 if jsonb_typeof(p_selections) is distinct from 'array' or jsonb_array_length(p_selections)<>(select sum((value->>'count')::integer) from jsonb_array_elements(r.resources)) then raise exception 'Select the required volunteers for every resource'; end if;
 if exists(select 1 from jsonb_array_elements(p_selections) x where x->>'userId' is null or x->>'resourceIndex' is null or (x->>'resourceIndex')::integer not between 0 and jsonb_array_length(r.resources)-1) then raise exception 'Invalid volunteer selection'; end if;
 if (select count(distinct value->>'userId') from jsonb_array_elements(p_selections))<>jsonb_array_length(p_selections) then raise exception 'Each volunteer can fill only one response role'; end if;
 for idx in 0..jsonb_array_length(r.resources)-1 loop
  if (select count(*) from jsonb_array_elements(p_selections) x where (x->>'resourceIndex')::integer=idx)<>(r.resources->idx->>'count')::integer then raise exception 'Resource selection does not match the reviewed plan'; end if;
 end loop;
 perform 1 from public.profiles where id in(select (value->>'userId')::uuid from jsonb_array_elements(p_selections)) order by id for update;
 select * into s from public.shifts where id=r.target_shift_id;
 for sel in select value from jsonb_array_elements(p_selections) loop
  uid:=(sel->>'userId')::uuid;req:=r.resources->((sel->>'resourceIndex')::integer);
  problem:=public.live_candidate_problem(s.id,uid,req);
  if problem is not null then raise exception 'Selection no longer feasible: %',problem; end if;
  src:=null;
  select a.* into src from public.assignments a join public.shifts x on x.id=a.shift_id join public.rosters ro on ro.id=a.roster_id join public.check_ins c on c.assignment_id=a.id
  where a.user_id=uid and ro.event_id=eid and ro.status='published' and c.status='checked_in' and coalesce(a.effective_starts_at,x.starts_at)<=now() and coalesce(a.effective_ends_at,x.ends_at)>now() limit 1 for update of a;
  if src.id is not null then
   update public.assignments set effective_ends_at=now() where id=src.id;
   update public.check_ins set status='completed',checked_out_at=now(),updated_at=now() where assignment_id=src.id;
  end if;
  insert into public.assignments(roster_id,shift_id,user_id,locked,effective_starts_at,effective_ends_at,reassigned_from_id,response_plan_id)
   values(s.roster_id,s.id,uid,true,now(),s.ends_at,src.id,r.id) returning id into aid;
  insert into public.check_ins(assignment_id,user_id,status) values(aid,uid,'scheduled');
  insert into public.dispatch_requests(response_plan_id,assignment_id,volunteer_id,instruction) values(r.id,aid,uid,r.instruction);
  delete from public.event_standby where event_id=eid and user_id=uid;
  insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail) values(eid,r.incident_id,auth.uid(),'volunteer_reassigned',
   jsonb_build_object('userId',uid,'sourceAssignmentId',src.id,'targetAssignmentId',aid,'instruction',r.instruction)::text);
 end loop;
 -- Projected destination coverage includes the explicitly approved arriving crew, not missing originals.
 select count(*) into idx from public.assignments a join public.check_ins c on c.assignment_id=a.id where a.shift_id=s.id and coalesce(a.effective_ends_at,s.ends_at)>now() and (c.status='checked_in' or a.response_plan_id=r.id);
 if idx<s.minimum_coverage then raise exception 'Selected crew do not restore destination minimum staffing';end if;
 for req in select value from jsonb_array_elements(s.requirements) loop
  select count(*) into idx from public.assignments a join public.check_ins c on c.assignment_id=a.id where a.shift_id=s.id and coalesce(a.effective_ends_at,s.ends_at)>now() and (c.status='checked_in' or a.response_plan_id=r.id) and public.user_meets_shift_requirement(a.user_id,eid,req);
  if idx<(req->>'minimum_count')::integer then raise exception 'Selected crew do not restore destination qualification coverage';end if;
 end loop;
 update public.response_plans set status='approved',approved_by=auth.uid(),approved_at=now(),revision=revision+1 where id=r.id returning * into r;
 insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail) values(eid,r.incident_id,auth.uid(),'response_approved','Coordinator approved the reviewed people and actions; assignments updated');
 return to_jsonb(r);
end; $$;

create or replace function public.update_dispatch(p_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.dispatch_requests;r public.response_plans;allowed boolean;
begin
 select * into d from public.dispatch_requests where id=p_id and volunteer_id=auth.uid() for update;
 if d.id is null then raise exception 'Dispatch unavailable'; end if;
 if d.status=p_status then return to_jsonb(d); end if;
 allowed:=(d.status='pending' and p_status in ('accepted','declined')) or (d.status='accepted' and p_status in ('en_route','declined')) or
  (d.status='en_route' and p_status='arrived') or (d.status='arrived' and p_status='completed');
 if not allowed then raise exception 'Use the next response status'; end if;
 select * into r from public.response_plans where id=d.response_plan_id;
 if r.status='completed' then raise exception 'This response is completed'; end if;
 update public.dispatch_requests set status=p_status,acknowledged_at=coalesce(acknowledged_at,now()),updated_at=now() where id=d.id returning * into d;
 if p_status='arrived' then update public.check_ins set status='checked_in',checked_in_at=now(),updated_at=now() where assignment_id=d.assignment_id; end if;
 if p_status in ('declined','completed') then
  update public.assignments set effective_ends_at=least(coalesce(effective_ends_at,now()),now()) where id=d.assignment_id;
  update public.check_ins set status='completed',checked_out_at=now(),updated_at=now() where assignment_id=d.assignment_id;
 end if;
 insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail) values(r.event_id,r.incident_id,auth.uid(),'dispatch_'||p_status,d.instruction);
 return to_jsonb(d);
end; $$;

create or replace function public.resolve_incident(p_id uuid,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.incidents;
begin
 select * into i from public.incidents where id=p_id for update;
 if i.id is null or not public.is_event_manager(i.event_id) or char_length(trim(p_notes)) not between 1 and 2000 then raise exception 'Incident unavailable or resolution notes missing'; end if;
 if i.status='resolved' then return to_jsonb(i); end if;
 update public.incidents set status='resolved',resolution_notes=trim(p_notes),resolved_at=now(),updated_at=now(),processing_status='complete',processing_lease_until=null where id=p_id returning * into i;
 update public.response_plans set status='completed',revision=revision+1,processing_status='complete',lease_until=null where incident_id=p_id and status not in ('dismissed','completed');
 update public.dispatch_requests d set status='completed',updated_at=now() from public.response_plans r where d.response_plan_id=r.id and r.incident_id=p_id and d.status not in ('completed','declined');
 update public.assignments a set effective_ends_at=least(coalesce(a.effective_ends_at,s.ends_at),now()) from public.shifts s,public.response_plans r where a.shift_id=s.id and a.response_plan_id=r.id and r.incident_id=p_id;
 update public.check_ins c set status='completed',checked_out_at=coalesce(checked_out_at,now()),updated_at=now() from public.assignments a,public.response_plans r where c.assignment_id=a.id and a.response_plan_id=r.id and r.incident_id=p_id;
 update public.risk_alerts r set status='resolved',resolved_at=now(),updated_at=now() where r.event_id=i.event_id and r.status='open'
  and r.evidence->'incidentIds' @> jsonb_build_array(p_id::text) and not exists(select 1 from jsonb_array_elements_text(r.evidence->'incidentIds') ref join public.incidents z on z.id=ref::uuid where z.status<>'resolved');
 insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail) values(i.event_id,p_id,auth.uid(),'incident_resolved',trim(p_notes));
 return to_jsonb(i);
end; $$;
create or replace function public.complete_response(p_id uuid,p_notes text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.response_plans;
begin
 select * into r from public.response_plans where id=p_id for update;
 if r.id is null or not public.is_event_manager(r.event_id) or char_length(trim(p_notes)) not between 1 and 2000 then raise exception 'Response unavailable or outcome missing'; end if;
 if r.status='completed' then return; end if;
 update public.response_plans set status='completed',revision=revision+1,processing_status='complete',lease_until=null where id=p_id;
 update public.dispatch_requests set status='completed',updated_at=now() where response_plan_id=p_id and status not in ('completed','declined');
 update public.assignments a set effective_ends_at=least(coalesce(a.effective_ends_at,s.ends_at),now()) from public.shifts s where a.shift_id=s.id and a.response_plan_id=p_id;
 update public.check_ins c set status='completed',checked_out_at=coalesce(c.checked_out_at,now()),updated_at=now() from public.assignments a where c.assignment_id=a.id and a.response_plan_id=p_id;
 insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail) values(r.event_id,r.incident_id,auth.uid(),'response_completed',trim(p_notes));
end; $$;
create or replace function public.mark_live_attendance(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare grace integer;changed integer;
begin
 if not public.is_event_manager(p_event_id) and auth.role() is distinct from 'service_role' then raise exception 'Event unavailable'; end if;
 select no_show_grace_minutes into grace from public.events where id=p_event_id;
 insert into public.check_ins(assignment_id,user_id,status) select a.id,a.user_id,'scheduled' from public.assignments a join public.rosters r on r.id=a.roster_id where r.event_id=p_event_id and r.status='published' on conflict(assignment_id) do nothing;
 update public.check_ins c set status=case when coalesce(a.effective_starts_at,s.starts_at)<=now()-make_interval(mins=>grace) then 'missing' else 'late' end,updated_at=now()
 from public.assignments a join public.shifts s on s.id=a.shift_id join public.rosters r on r.id=a.roster_id
 where c.assignment_id=a.id and r.event_id=p_event_id and r.status='published' and c.status in ('scheduled','late')
 and coalesce(a.effective_starts_at,s.starts_at)<=now() and coalesce(a.effective_ends_at,s.ends_at)>now();
 get diagnostics changed=row_count;
 return jsonb_build_object('updated',changed);
end; $$;
create or replace function public.process_live_attendance()
returns void language plpgsql security definer set search_path='' as $$
declare e record;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 for e in select id from public.events where status='live' loop perform public.mark_live_attendance(e.id); end loop;
end; $$;

create or replace function public.set_check_in(p_assignment_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.assignments;r public.rosters;s public.shifts;c public.check_ins;
begin
 select * into a from public.assignments where id=p_assignment_id for update;
 select * into r from public.rosters where id=a.roster_id;select * into s from public.shifts where id=a.shift_id;
 if a.id is null or r.status<>'published' or a.user_id is distinct from auth.uid() or not public.is_event_member(r.event_id)
  or not exists(select 1 from public.events where id=r.event_id and status='live') then raise exception 'Active assignment unavailable'; end if;
 if coalesce(a.effective_starts_at,s.starts_at)>now()+interval '15 minutes' or coalesce(a.effective_ends_at,s.ends_at)<=now() then raise exception 'Check in during your shift (up to 15 minutes early)'; end if;
 if a.response_plan_id is not null then raise exception 'Use the response arrival/completion controls for this assignment'; end if;
 select * into c from public.check_ins where assignment_id=a.id;
 if p_action='check_in' then
  if c.status='completed' then raise exception 'This assignment is completed'; end if;
  insert into public.check_ins(assignment_id,user_id,status,checked_in_at) values(a.id,auth.uid(),'checked_in',now())
   on conflict(assignment_id) do update set status='checked_in',checked_in_at=coalesce(public.check_ins.checked_in_at,now()),updated_at=now() returning * into c;
 elsif p_action='check_out' then
  if c.status='completed' then return to_jsonb(c); end if;
  if c.status is distinct from 'checked_in' then raise exception 'Check in before checking out'; end if;
  update public.check_ins set status='completed',checked_out_at=now(),updated_at=now() where id=c.id returning * into c;
 else raise exception 'Unsupported check-in action'; end if;
 insert into public.operational_timeline(event_id,actor_id,event_type,detail) values(r.event_id,auth.uid(),p_action,'Volunteer attendance updated');
 return to_jsonb(c);
end; $$;
create or replace function public.my_live_assignments(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_member(p_event_id) then raise exception 'Event unavailable'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('assignment_id',a.id,'shift_id',s.id,'post',p.name,'location',l.name,'starts_at',coalesce(a.effective_starts_at,s.starts_at),
 'ends_at',coalesce(a.effective_ends_at,s.ends_at),'instructions',coalesce((select instruction from public.response_plans where id=a.response_plan_id),s.instructions),
 'status',coalesce(c.status,'scheduled'),'checked_in_at',c.checked_in_at,'response_plan_id',a.response_plan_id) order by s.starts_at)
 from public.assignments a join public.rosters r on r.id=a.roster_id and r.status='published' join public.shifts s on s.id=a.shift_id join public.posts p on p.id=s.post_id join public.locations l on l.id=p.location_id left join public.check_ins c on c.assignment_id=a.id
 where r.event_id=p_event_id and a.user_id=auth.uid() and coalesce(a.effective_ends_at,s.ends_at)>now()-interval '12 hours'),'[]');
end; $$;
create or replace function public.my_event_schedule(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_member(p_event_id) then raise exception 'Event unavailable'; end if;
 return jsonb_build_object('published',exists(select 1 from public.rosters where event_id=p_event_id and status='published'),
 'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'starts_at',coalesce(a.effective_starts_at,s.starts_at),'ends_at',coalesce(a.effective_ends_at,s.ends_at),'post',p.name,'location',l.name,'instructions',coalesce((select instruction from public.response_plans where id=a.response_plan_id),s.instructions),'supervisor',p.supervisor,'escalation',p.escalation) order by s.starts_at)
 from public.assignments a join public.rosters r on r.id=a.roster_id and r.status='published' join public.shifts s on s.id=a.shift_id join public.posts p on p.id=s.post_id join public.locations l on l.id=p.location_id where r.event_id=p_event_id and a.user_id=auth.uid()),'[]'));
end; $$;

create or replace function public.intelligence_snapshot(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable'; end if;
 return jsonb_build_object(
 'incidents',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from public.incidents i where event_id=p_event_id and status<>'resolved'),'[]'),
 'relations',coalesce((select jsonb_agg(to_jsonb(x)) from public.incident_relations x join public.incidents i on i.id=x.incident_id where i.event_id=p_event_id),'[]'),
 'risks',coalesce((select jsonb_agg(to_jsonb(x)) from public.risk_alerts x where event_id=p_event_id and status='open'),'[]'),
 'responses',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from public.response_plans x where event_id=p_event_id and status not in ('dismissed','completed')),'[]'),
 'dispatches',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('name',p.display_name)) from public.dispatch_requests d join public.response_plans r on r.id=d.response_plan_id join public.profiles p on p.id=d.volunteer_id where r.event_id=p_event_id),'[]'),
 'procedures',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'content',content,'document_type','operating_procedure')) from public.event_procedures where event_id=p_event_id),'[]'),
 'timeline',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.operational_timeline where event_id=p_event_id order by created_at desc limit 100) x),'[]'),
 'locations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.locations where event_id=p_event_id),'[]'),
 'observations',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.event_observations where event_id=p_event_id order by observed_at desc limit 20) x),'[]'),
 'activeShifts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'post',p.name,'location',l.name,'ends_at',s.ends_at)) from public.shifts s join public.rosters r on r.id=s.roster_id and r.status='published' join public.posts p on p.id=s.post_id join public.locations l on l.id=p.location_id where s.event_id=p_event_id and s.starts_at<=now() and s.ends_at>now()),'[]'),
 'summary',public.event_summary_status(p_event_id),
 'coverage',public.live_coverage(p_event_id),'readiness',public.event_operational_readiness(p_event_id));
end; $$;

-- All operational entry points are event/role scoped; workers cannot approve.
revoke all on function public.claim_response_processing(),public.response_ai_context(uuid),public.finish_response_processing(uuid,integer,jsonb,text),public.process_live_attendance() from public,anon,authenticated;
grant execute on function public.claim_response_processing(),public.response_ai_context(uuid),public.finish_response_processing(uuid,integer,jsonb,text),public.process_live_attendance() to service_role;
revoke all on function public.set_standby(uuid,timestamptz),public.response_candidates(uuid),public.modify_response(uuid,bigint,uuid,text,jsonb,jsonb),public.dismiss_response(uuid,bigint),public.retry_response_processing(uuid),public.approve_response(uuid,bigint,jsonb),public.complete_response(uuid,text) from public,anon;
grant execute on function public.set_standby(uuid,timestamptz),public.response_candidates(uuid),public.modify_response(uuid,bigint,uuid,text,jsonb,jsonb),public.dismiss_response(uuid,bigint),public.retry_response_processing(uuid),public.approve_response(uuid,bigint,jsonb),public.complete_response(uuid,text) to authenticated;
create or replace function public.live_event_snapshot(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_event_manager(p_event_id) then raise exception 'You cannot view live operations'; end if;
  perform public.mark_live_attendance(p_event_id);
  select jsonb_build_object(
    'event',jsonb_build_object('id',e.id,'name',e.name,'status',e.status,'timezone',e.timezone,'is_demo',e.is_demo,'demo_source_id',e.demo_source_id),
    'staffing',(select jsonb_build_object(
      'assigned',count(a.id) filter(where coalesce(a.effective_ends_at,s.ends_at)>now()),
      'checked_in',count(*) filter(where c.status='checked_in' and coalesce(a.effective_ends_at,s.ends_at)>now()),
      'late',count(*) filter(where c.status='late' and coalesce(a.effective_ends_at,s.ends_at)>now()),
      'missing',count(*) filter(where c.status='missing' and coalesce(a.effective_ends_at,s.ends_at)>now()),
      'completed',count(*) filter(where c.status='completed')
    ) from public.assignments a
      join public.rosters r on r.id=a.roster_id and r.status='published' join public.shifts s on s.id=a.shift_id
      left join public.check_ins c on c.assignment_id=a.id
      where r.event_id=e.id),
    'coverage',coalesce((select jsonb_agg(jsonb_build_object(
      'post',p.name,'location',l.name,'required',s.minimum_coverage,
      'assigned',(select count(*) from public.assignments where shift_id=s.id),
      'checked_in',(select count(*) from public.check_ins c join public.assignments a on a.id=c.assignment_id where a.shift_id=s.id and c.status='checked_in' and coalesce(a.effective_ends_at,s.ends_at)>now()),
      'missing',(select count(*) from public.check_ins c join public.assignments a on a.id=c.assignment_id where a.shift_id=s.id and c.status='missing' and coalesce(a.effective_ends_at,s.ends_at)>now()),
      'criticality',s.criticality
    )) from public.shifts s join public.posts p on p.id=s.post_id join public.locations l on l.id=p.location_id
      join public.rosters rr on rr.id=s.roster_id and rr.status='published'
      where rr.event_id=e.id and s.starts_at<=now() and s.ends_at>now()),'[]'::jsonb),
    'incidents',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'raw_report',i.raw_report,'status',i.status,'severity',i.severity,'created_at',i.created_at
    ) order by i.created_at desc) from public.incidents i where i.event_id=e.id and i.status<>'resolved' limit 20),'[]'::jsonb)
  ) into result
  from public.events e where e.id=p_event_id;
  return result;
end; $$;
commit;
