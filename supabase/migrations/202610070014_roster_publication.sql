begin;
create table if not exists public.certification_history(id uuid primary key default gen_random_uuid(),certificate_id uuid not null references public.certifications(id),previous_data jsonb,next_data jsonb not null,changed_by uuid,changed_at timestamptz not null default now());
alter table public.certification_history enable row level security;
grant select on public.certification_history to authenticated;
drop policy if exists "Certificate audit visibility" on public.certification_history;
create policy "Certificate audit visibility" on public.certification_history for select to authenticated using(exists(select 1 from public.certifications c where c.id=certificate_id and (c.user_id=auth.uid() or public.can_review_volunteer(c.user_id))));
create or replace function public.audit_certification() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.certification_history(certificate_id,previous_data,next_data,changed_by) values(new.id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid());return new;end; $$;
drop trigger if exists certification_audit on public.certifications;create trigger certification_audit after insert or update on public.certifications for each row execute function public.audit_certification();
create or replace function public.event_crew_context(p_event_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
if not public.is_event_manager(p_event_id) then raise exception 'Crew unavailable';end if;
return coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',p.display_name,'onboarding',(select to_jsonb(v) from public.event_volunteer_preferences v where v.event_id=p_event_id and v.user_id=m.user_id),'availability',coalesce((select jsonb_agg(to_jsonb(v)) from public.volunteer_availability v where v.event_id=p_event_id and v.user_id=m.user_id),'[]'::jsonb),'certifications',coalesce((select jsonb_agg(to_jsonb(c)) from public.certifications c where c.user_id=m.user_id and status<>'archived'),'[]'::jsonb))) from public.event_memberships m join public.profiles p on p.id=m.user_id where m.event_id=p_event_id and m.status='active'),'[]'::jsonb);end; $$;
create or replace function public.get_roster_readiness(p_roster_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rosters;e public.events;s public.shifts;current_assignment public.assignments;q jsonb;w public.post_operating_windows;d date;issues jsonb:='[]';warnings jsonb:='[]';problem text;n integer;
begin select * into r from public.rosters where id=p_roster_id;if r.id is null or not public.is_event_manager(r.event_id) then raise exception 'Roster unavailable';end if;
select * into e from public.events where id=r.event_id;
if e.model_status<>'verified' or e.verified_revision is distinct from e.setup_revision or r.model_revision<>e.setup_revision or jsonb_array_length(public.get_event_readiness(e.id)->'issues')>0 then issues:=issues||jsonb_build_array('Verify the current operating model and create a draft from that model.');end if;
if not exists(select 1 from public.shifts where roster_id=r.id) then issues:=issues||jsonb_build_array('No shifts generated.');end if;
for s in select * from public.shifts where roster_id=r.id loop
select count(*) into n from public.assignments where shift_id=s.id;
if n<>s.minimum_coverage then issues:=issues||jsonb_build_array(jsonb_build_object('shiftId',s.id,'message',format('Staffing: %s assigned; %s required',n,s.minimum_coverage)));end if;
for q in select value from jsonb_array_elements(s.requirements) loop
select count(*) into n from public.assignments a where a.shift_id=s.id and public.user_meets_shift_requirement(a.user_id,e.id,q);
if n<(q->>'minimum_count')::integer then issues:=issues||jsonb_build_array(jsonb_build_object('shiftId',s.id,'message',format('Qualification gap: %s / %s (%s of %s)',q->>'certification_type',q->>'experience_requirement',n,q->>'minimum_count')));end if;end loop;
for current_assignment in select * from public.assignments where shift_id=s.id loop problem:=public.assignment_problem(r.id,s.id,current_assignment.user_id,current_assignment.id);if problem is not null then issues:=issues||jsonb_build_array(jsonb_build_object('shiftId',s.id,'message',problem));end if;end loop;end loop;
-- A manually shortened shift must not silently leave an operating period uncovered.
for w in select * from public.post_operating_windows where event_id=e.id loop d:=w.start_date;while d<=w.end_date loop
if not coalesce((select range_agg(tstzrange(starts_at,ends_at,'[)')) @> tstzrange((d+w.start_time) at time zone e.timezone,(d+w.end_time) at time zone e.timezone,'[)') from public.shifts where roster_id=r.id and post_id=w.post_id and minimum_coverage>=coalesce(w.minimum_coverage,(select minimum_coverage from public.posts where id=w.post_id))),false) then issues:=issues||jsonb_build_array(format('Operating period not covered: %s on %s',(select name from public.posts where id=w.post_id),d));end if;d:=d+1;end loop;end loop;
select coalesce(jsonb_agg(format('%s has not submitted availability',p.display_name)),'[]'::jsonb) into warnings from public.event_memberships m join public.profiles p on p.id=m.user_id where m.event_id=e.id and m.status='active' and not exists(select 1 from public.event_volunteer_preferences v where v.event_id=e.id and v.user_id=m.user_id);
return jsonb_build_object('issues',issues,'warnings',warnings,'revision',r.revision,'staffingRevision',e.staffing_revision,'ready',jsonb_array_length(issues)=0);end; $$;
create or replace function public.publish_roster(p_roster_id uuid,p_revision bigint,p_staffing_revision bigint) returns void language plpgsql security definer set search_path='' as $$ declare r public.rosters;ready jsonb;
begin select * into r from public.rosters where id=p_roster_id;
if r.status='published' and r.revision=p_revision+1 and public.is_event_manager(r.event_id) then return;end if;
r:=public.lock_roster_draft(p_roster_id,p_revision);
perform 1 from public.profiles where id in(select user_id from public.assignments where roster_id=r.id) order by id for update;
if (select staffing_revision from public.events where id=r.event_id)<>p_staffing_revision then raise exception 'Volunteer inputs changed. Review coverage again';end if;
ready:=public.get_roster_readiness(r.id);if not (ready->>'ready')::boolean then raise exception 'Resolve roster coverage and assignment issues before publishing';end if;
update public.rosters set status='superseded' where event_id=r.event_id and status='published';update public.rosters set status='published',published_at=now(),published_by=auth.uid(),revision=revision+1 where id=r.id;
update public.events set status='published' where id=r.event_id;
insert into public.setup_change_history(event_id,entity_kind,entity_id,next_data,changed_by) values(r.event_id,'roster_published',r.id,ready,auth.uid());end; $$;
create or replace function public.my_event_schedule(p_event_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
if not public.is_event_member(p_event_id) then raise exception 'Join this event first';end if;
return jsonb_build_object('published',exists(select 1 from public.rosters where event_id=p_event_id and status='published'),'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'starts_at',s.starts_at,'ends_at',s.ends_at,'post',p.name,'location',l.name,'instructions',s.instructions,'supervisor',p.supervisor,'escalation',p.escalation) order by s.starts_at) from public.assignments a join public.rosters r on r.id=a.roster_id join public.shifts s on s.id=a.shift_id join public.posts p on p.id=s.post_id join public.locations l on l.id=p.location_id where r.event_id=p_event_id and r.status='published' and a.user_id=auth.uid()),'[]'::jsonb));end; $$;
do $$ declare f regprocedure;begin foreach f in array array['public.event_crew_context(uuid)'::regprocedure,'public.get_roster_readiness(uuid)'::regprocedure,'public.publish_roster(uuid,bigint,bigint)'::regprocedure,'public.my_event_schedule(uuid)'::regprocedure] loop execute format('revoke all on function %s from public,anon',f);execute format('grant execute on function %s to authenticated',f);end loop;end; $$;
create or replace function public.preview_event_join(p_join_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
 if auth.uid() is null then raise exception 'Sign in to preview an event';end if;
 select * into e from public.events where upper(join_code)=upper(trim(p_join_code)) and status in ('recruiting','published')
  and model_status='verified' and verified_revision=setup_revision;
 if e.id is null then raise exception 'This code is invalid or the event is not currently accepting volunteers';end if;
 return jsonb_build_object('id',e.id,'name',e.name,'description',e.description,'venue_name',e.venue_name,'start_date',e.start_date,'end_date',e.end_date,'timezone',e.timezone);
end; $$;
create or replace function public.join_event(p_join_code text,p_expected_event_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
 if auth.uid() is null then raise exception 'Sign in to join an event';end if;
 select * into e from public.events where upper(join_code)=upper(trim(p_join_code)) for update;
 if e.id is distinct from p_expected_event_id or e.id is null or e.status not in ('recruiting','published') or e.model_status<>'verified' or e.verified_revision is distinct from e.setup_revision then
  raise exception 'The event changed or is no longer accepting volunteers. Preview it again';end if;
 insert into public.event_memberships(event_id,user_id,event_role) values(e.id,auth.uid(),'volunteer')
  on conflict(event_id,user_id) do nothing;
 -- Existing coordinator/safety roles are preserved. Inactive memberships need
 -- an explicit coordinator decision instead of being silently reactivated.
 if not public.is_event_member(e.id) then raise exception 'Your membership is inactive. Contact the event coordinator';end if;
 return e.id;
end; $$;
commit;
