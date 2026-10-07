-- Phases 16–18. Versioned draft rosters and independently checked assignments.
begin;
create table if not exists public.rosters(id uuid primary key,event_id uuid not null references public.events(id),model_revision bigint not null,revision bigint not null default 0,status text not null default 'draft' check(status in ('draft','published','superseded')),last_generation_id uuid,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),published_at timestamptz,published_by uuid references auth.users(id));
create unique index if not exists one_draft_roster on public.rosters(event_id) where status='draft';
create unique index if not exists one_published_roster on public.rosters(event_id) where status='published';
create table if not exists public.shifts(id uuid primary key default gen_random_uuid(),roster_id uuid not null references public.rosters(id),event_id uuid not null references public.events(id),post_id uuid not null references public.posts(id),starts_at timestamptz not null,ends_at timestamptz not null,minimum_coverage integer not null check(minimum_coverage between 1 and 10000),requirements jsonb not null default '[]',criticality text not null,instructions text,check(ends_at>starts_at),check(ends_at-starts_at<=interval '24 hours'));
create table if not exists public.assignments(id uuid primary key default gen_random_uuid(),roster_id uuid not null references public.rosters(id),shift_id uuid not null references public.shifts(id),user_id uuid not null references auth.users(id),locked boolean not null default false,assigned_at timestamptz not null default now(),unique(shift_id,user_id));
create index if not exists shifts_roster on public.shifts(roster_id);
create index if not exists assignments_roster on public.assignments(roster_id);
create index if not exists assignments_user on public.assignments(user_id);
do $$ declare t text;begin foreach t in array array['rosters','shifts','assignments'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);end loop;end; $$;
drop policy if exists "Roster managers" on public.rosters;create policy "Roster managers" on public.rosters for select to authenticated using(public.is_event_manager(event_id));
drop policy if exists "Shift managers" on public.shifts;create policy "Shift managers" on public.shifts for select to authenticated using(public.is_event_manager(event_id));
drop policy if exists "Assignment managers" on public.assignments;create policy "Assignment managers" on public.assignments for select to authenticated using(exists(select 1 from public.rosters r where r.id=roster_id and public.is_event_manager(r.event_id)));
-- Changes to membership invalidate a candidate calculated against the old crew.
create or replace function public.touch_membership_staffing() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.events set staffing_revision=staffing_revision+1 where id=coalesce(new.event_id,old.event_id);if tg_op='DELETE' then return old;end if;return new;end; $$;
drop trigger if exists crew_membership_changed on public.event_memberships;create trigger crew_membership_changed after insert or update or delete on public.event_memberships for each row execute function public.touch_membership_staffing();
create or replace function public.user_meets_shift_requirement(p_user_id uuid,p_event_id uuid,p_req jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select (p_req->>'certification_type' is null or exists(select 1 from public.certifications c join public.events e on e.id=p_event_id where c.user_id=p_user_id and c.status in ('verified','expired') and public.qualification_key(c.type)=public.qualification_key(p_req->>'certification_type') and (c.issued_at is null or c.issued_at<=e.start_date) and (c.expires_at>=e.end_date or c.expires_at is null and c.never_expires)))
 and (p_req->>'experience_requirement' is null or exists(select 1 from public.event_volunteer_preferences p,unnest(p.experience_tags) tag where p.event_id=p_event_id and p.user_id=p_user_id and p.experience_reviewed and public.qualification_key(tag)=public.qualification_key(p_req->>'experience_requirement')));
$$;
create or replace function public.assignment_problem(p_roster_id uuid,p_shift_id uuid,p_user_id uuid,p_exclude_id uuid default null) returns text
language plpgsql stable security definer set search_path='' as $$
declare s public.shifts;p public.event_volunteer_preferences;tz text;hours numeric;dayhours numeric;
begin
 select * into s from public.shifts where id=p_shift_id and roster_id=p_roster_id;
 if s.id is null then return 'Shift unavailable';end if;
 if not exists(select 1 from public.event_memberships where event_id=s.event_id and user_id=p_user_id and status='active') then return 'Inactive event membership';end if;
 select * into p from public.event_volunteer_preferences where event_id=s.event_id and user_id=p_user_id;
 if p.user_id is null then return 'Availability not submitted';end if;
 if not coalesce((select range_agg(tstzrange(starts_at,ends_at,'[)')) @> tstzrange(s.starts_at,s.ends_at,'[)') from public.volunteer_availability where event_id=s.event_id and user_id=p_user_id),false) then return 'Outside availability';end if;
 if exists(select 1 from public.assignments a join public.shifts x on x.id=a.shift_id join public.rosters r on r.id=a.roster_id where a.user_id=p_user_id and a.id is distinct from p_exclude_id and r.status in ('draft','published') and (r.id=p_roster_id or r.event_id<>s.event_id) and x.starts_at<s.ends_at and x.ends_at>s.starts_at) then return 'Overlapping shifts';end if;
 select timezone into tz from public.events where id=s.event_id;
 select coalesce(sum(extract(epoch from (x.ends_at-x.starts_at))/3600),0) into hours from public.assignments a join public.shifts x on x.id=a.shift_id where a.roster_id=p_roster_id and a.user_id=p_user_id and a.id is distinct from p_exclude_id;
 select coalesce(sum(extract(epoch from (x.ends_at-x.starts_at))/3600),0) into dayhours from public.assignments a join public.shifts x on x.id=a.shift_id where a.roster_id=p_roster_id and a.user_id=p_user_id and a.id is distinct from p_exclude_id and (x.starts_at at time zone tz)::date=(s.starts_at at time zone tz)::date;
 if hours+extract(epoch from (s.ends_at-s.starts_at))/3600>p.maximum_hours then return 'Maximum hours exceeded';end if;
 if dayhours+extract(epoch from (s.ends_at-s.starts_at))/3600>p.maximum_daily_hours then return 'Maximum daily hours exceeded';end if;return null;
end; $$;
create or replace function public.create_shift_draft(p_event_id uuid,p_roster_id uuid,p_shift_hours integer,p_expected_model_revision bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.events;w public.post_operating_windows;p public.posts;day date;s timestamptz;t timestamptz;finish timestamptz;req jsonb;count integer:=0;
begin
 if not public.is_event_manager(p_event_id) then raise exception 'You cannot generate shifts';end if;
 select * into e from public.events where id=p_event_id for update;
 if exists(select 1 from public.rosters where id=p_roster_id and event_id=e.id) then return p_roster_id;end if;
 if e.model_status<>'verified' or e.verified_revision is distinct from e.setup_revision or e.setup_revision is distinct from p_expected_model_revision or jsonb_array_length(public.get_event_readiness(e.id)->'issues')>0 then raise exception 'Verify the latest operating model before generating shifts';end if;
 if p_shift_hours is null or p_shift_hours not between 1 and 12 then raise exception 'Use shift lengths between 1 and 12 hours';end if;
 if e.end_date-e.start_date>365 then raise exception 'Generate shifts for an event of at most 366 days';end if;
 if exists(select 1 from public.rosters where event_id=e.id and status='draft') then raise exception 'Review or discard the current draft before creating another';end if;
 insert into public.rosters(id,event_id,model_revision,created_by) values(p_roster_id,e.id,e.setup_revision,auth.uid());
 for w in select * from public.post_operating_windows where event_id=e.id order by start_date,start_time,post_id loop
 select * into p from public.posts where id=w.post_id;
 select coalesce(jsonb_agg(jsonb_build_object('certification_type',certification_type,'experience_requirement',experience_requirement,'minimum_count',minimum_count)),'[]'::jsonb) into req from public.post_requirements where post_id=p.id;
 day:=w.start_date;while day<=w.end_date loop
 s:=(day+w.start_time) at time zone e.timezone;finish:=(day+w.end_time) at time zone e.timezone;
 if (s at time zone e.timezone)::time<>w.start_time or (finish at time zone e.timezone)::time<>w.end_time then raise exception 'Operating window contains a nonexistent local clock time';end if;
 while s<finish loop t:=least(s+make_interval(hours=>p_shift_hours),finish);count:=count+1;if count>2000 then raise exception 'This draft exceeds 2,000 shifts. Reduce the generation range';end if;
 insert into public.shifts(roster_id,event_id,post_id,starts_at,ends_at,minimum_coverage,requirements,criticality,instructions) values(p_roster_id,e.id,p.id,s,t,coalesce(w.minimum_coverage,p.minimum_coverage),req,p.criticality,p.instructions);s:=t;end loop;day:=day+1;end loop;end loop;
 if count=0 then raise exception 'No operating windows generated shifts';end if;
 insert into public.setup_change_history(event_id,entity_kind,entity_id,next_data,changed_by) values(e.id,'shift_draft_created',p_roster_id,jsonb_build_object('shifts',count),auth.uid());return p_roster_id;
end; $$;
create or replace function public.get_roster_context(p_roster_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rosters;e public.events;
begin select * into r from public.rosters where id=p_roster_id;
 if r.id is null or not public.is_event_manager(r.event_id) then raise exception 'Roster unavailable';end if;
 select * into e from public.events where id=r.event_id for share;
 return jsonb_build_object('event',jsonb_build_object('id',e.id,'name',e.name,'start_date',e.start_date,'end_date',e.end_date,'timezone',e.timezone,'setup_revision',e.setup_revision,'model_status',e.model_status,'staffing_revision',e.staffing_revision),'roster',to_jsonb(r),
 'shifts',coalesce((select jsonb_agg(to_jsonb(s) order by starts_at,post_id) from public.shifts s where roster_id=r.id),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a)) from public.assignments a where roster_id=r.id),'[]'::jsonb),
 'crew',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',p.display_name,'onboarding',(select to_jsonb(v) from public.event_volunteer_preferences v where v.event_id=e.id and v.user_id=m.user_id),'availability',coalesce((select jsonb_agg(to_jsonb(v)) from public.volunteer_availability v where v.event_id=e.id and v.user_id=m.user_id),'[]'::jsonb),'certifications',coalesce((select jsonb_agg(to_jsonb(c)) from public.certifications c where c.user_id=m.user_id and status<>'archived'),'[]'::jsonb))) from public.event_memberships m join public.profiles p on p.id=m.user_id where m.event_id=e.id and m.status='active'),'[]'::jsonb),
 'externalAssignments',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'starts_at',s.starts_at,'ends_at',s.ends_at)) from public.assignments a join public.shifts s on s.id=a.shift_id join public.rosters x on x.id=a.roster_id where x.id<>r.id and x.status in ('draft','published') and x.event_id<>e.id and exists(select 1 from public.event_memberships m where m.event_id=e.id and m.user_id=a.user_id and m.status='active')),'[]'::jsonb),
 'posts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'location_name',l.name)) from public.posts p join public.locations l on l.id=p.location_id where p.event_id=e.id),'[]'::jsonb));
end; $$;
create or replace function public.lock_roster_draft(p_id uuid,p_revision bigint) returns public.rosters language plpgsql security definer set search_path='' as $$
declare r public.rosters;e public.events;
begin select * into r from public.rosters where id=p_id;
 if r.id is null or not public.is_event_manager(r.event_id) then raise exception 'Roster unavailable';end if;
 select * into e from public.events where id=r.event_id for update;select * into r from public.rosters where id=p_id for update;
 if r.status<>'draft' or r.revision is distinct from p_revision then raise exception 'The roster changed. Refresh before editing';end if;
 if e.model_status<>'verified' or e.setup_revision<>r.model_revision then raise exception 'The operating model changed. Verify it and create a fresh shift draft';end if;return r;
end; $$;
create or replace function public.apply_roster_generation(p_roster_id uuid,p_revision bigint,p_staffing_revision bigint,p_generation_id uuid,p_assignments jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.rosters;a jsonb;problem text;sid uuid;uid uuid;
begin
 select * into r from public.rosters where id=p_roster_id;
 if r.id is null or not public.is_event_manager(r.event_id) then raise exception 'Roster unavailable';end if;
 if r.last_generation_id=p_generation_id then return;end if;
 r:=public.lock_roster_draft(p_roster_id,p_revision);
 if (select staffing_revision from public.events where id=r.event_id) is distinct from p_staffing_revision then raise exception 'Volunteer inputs changed. Generate again with current information';end if;
 if jsonb_typeof(p_assignments) is distinct from 'array' or jsonb_array_length(p_assignments)>10000 then raise exception 'Invalid or oversized assignment draft';end if;
 -- Lock volunteer rows in a stable order to serialize assignments across events.
 perform 1 from public.profiles where id in (select (value->>'userId')::uuid from jsonb_array_elements(p_assignments)) order by id for update;
 delete from public.assignments where roster_id=r.id and not locked;
 for a in select value from jsonb_array_elements(p_assignments) loop
 sid:=(a->>'shiftId')::uuid;uid:=(a->>'userId')::uuid;
 if exists(select 1 from public.assignments where roster_id=r.id and shift_id=sid and user_id=uid and locked) then continue;end if;
 problem:=public.assignment_problem(r.id,sid,uid);if problem is not null then raise exception '%',problem;end if;
 if (select count(*) from public.assignments where shift_id=sid)>=(select minimum_coverage from public.shifts where id=sid and roster_id=r.id) then raise exception 'Shift is already fully staffed';end if;
 insert into public.assignments(roster_id,shift_id,user_id,locked) values(r.id,sid,uid,false);end loop;
 update public.rosters set revision=revision+1,last_generation_id=p_generation_id where id=r.id;
 insert into public.setup_change_history(event_id,entity_kind,entity_id,next_data,changed_by) values(r.event_id,'roster_generated',r.id,jsonb_build_object('assignments',jsonb_array_length(p_assignments)),auth.uid());
end; $$;
create or replace function public.set_roster_assignment(p_roster_id uuid,p_revision bigint,p_shift_id uuid,p_user_id uuid,p_replace_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.rosters;problem text;
begin r:=public.lock_roster_draft(p_roster_id,p_revision);perform 1 from public.profiles where id=p_user_id for update;
 if p_replace_id is not null then delete from public.assignments where id=p_replace_id and roster_id=r.id and shift_id=p_shift_id;if not found then raise exception 'Assignment to replace is unavailable';end if;end if;
 problem:=public.assignment_problem(r.id,p_shift_id,p_user_id);if problem is not null then raise exception '%',problem;end if;
 if (select count(*) from public.assignments where shift_id=p_shift_id)>=(select minimum_coverage from public.shifts where id=p_shift_id and roster_id=r.id) then raise exception 'Replace a volunteer or remove an assignment before adding another';end if;
 insert into public.assignments(roster_id,shift_id,user_id,locked) values(r.id,p_shift_id,p_user_id,true);
 update public.rosters set revision=revision+1 where id=r.id;
 insert into public.setup_change_history(event_id,entity_kind,entity_id,next_data,changed_by) values(r.event_id,'manual_assignment',p_shift_id,jsonb_build_object('userId',p_user_id,'replaced',p_replace_id),auth.uid());end; $$;
create or replace function public.remove_roster_assignment(p_roster_id uuid,p_revision bigint,p_assignment_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.rosters;old public.assignments;
begin r:=public.lock_roster_draft(p_roster_id,p_revision);select * into old from public.assignments where id=p_assignment_id and roster_id=r.id;
 delete from public.assignments where id=p_assignment_id and roster_id=r.id;if not found then raise exception 'Assignment unavailable';end if;
 update public.rosters set revision=revision+1 where id=r.id;insert into public.setup_change_history(event_id,entity_kind,entity_id,previous_data,changed_by) values(r.event_id,'assignment_removed',old.id,to_jsonb(old),auth.uid());end; $$;
create or replace function public.edit_shift(p_roster_id uuid,p_revision bigint,p_shift_id uuid,p_start text,p_end text,p_coverage integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.rosters;s public.shifts;tz text;w public.post_operating_windows;start_at timestamptz;end_at timestamptz;
begin r:=public.lock_roster_draft(p_roster_id,p_revision);select * into s from public.shifts where id=p_shift_id and roster_id=r.id;
 select timezone into tz from public.events where id=r.event_id;start_at:=p_start::timestamp at time zone tz;end_at:=p_end::timestamp at time zone tz;
 if (start_at at time zone tz)<>p_start::timestamp or (end_at at time zone tz)<>p_end::timestamp then raise exception 'This local clock time does not exist';end if;
 if s.id is null or start_at>=end_at or (start_at at time zone tz)::date<>(end_at at time zone tz)::date then raise exception 'Use a same-day shift within its operating window';end if;
 if exists(select 1 from public.assignments where shift_id=s.id) then raise exception 'Remove assignments before changing a shift';end if;
 select * into w from public.post_operating_windows where post_id=s.post_id and (start_at at time zone tz)::date between start_date and end_date and (start_at at time zone tz)::time>=start_time and (end_at at time zone tz)::time<=end_time limit 1;
 if w.id is null or p_coverage<coalesce(w.minimum_coverage,(select minimum_coverage from public.posts where id=s.post_id)) then raise exception 'A shift cannot weaken verified operating coverage';end if;
 if exists(select 1 from jsonb_array_elements(s.requirements) q where (q->>'minimum_count')::integer>p_coverage) then raise exception 'Qualification coverage exceeds staffing';end if;
 if exists(select 1 from public.shifts where roster_id=r.id and post_id=s.post_id and id<>s.id and starts_at<end_at and ends_at>start_at) then raise exception 'Shifts at this post overlap';end if;
 update public.shifts set starts_at=start_at,ends_at=end_at,minimum_coverage=p_coverage where id=s.id;update public.rosters set revision=revision+1 where id=r.id;
 insert into public.setup_change_history(event_id,entity_kind,entity_id,previous_data,next_data,changed_by) values(r.event_id,'shift_edited',s.id,to_jsonb(s),jsonb_build_object('start',start_at,'end',end_at,'coverage',p_coverage),auth.uid());end; $$;
create or replace function public.discard_roster_draft(p_roster_id uuid,p_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare r public.rosters;
begin select * into r from public.rosters where id=p_roster_id;
 if r.id is null or not public.is_event_manager(r.event_id) then raise exception 'Roster unavailable';end if;
 perform 1 from public.events where id=r.event_id for update;
 update public.rosters set status='superseded',revision=revision+1 where id=r.id and status='draft' and revision=p_revision;if not found then raise exception 'Draft changed. Refresh before discarding';end if;
 insert into public.setup_change_history(event_id,entity_kind,entity_id,next_data,changed_by) values(r.event_id,'draft_discarded',r.id,jsonb_build_object('retained',true),auth.uid());end; $$;
-- Helper functions are internal; only event-scoped entry points are callable.
revoke all on function public.user_meets_shift_requirement(uuid,uuid,jsonb),public.assignment_problem(uuid,uuid,uuid,uuid),public.lock_roster_draft(uuid,bigint) from public,anon,authenticated;
do $$ declare f regprocedure;begin foreach f in array array['public.create_shift_draft(uuid,uuid,integer,bigint)'::regprocedure,'public.get_roster_context(uuid)'::regprocedure,'public.apply_roster_generation(uuid,bigint,bigint,uuid,jsonb)'::regprocedure,'public.set_roster_assignment(uuid,bigint,uuid,uuid,uuid)'::regprocedure,'public.remove_roster_assignment(uuid,bigint,uuid)'::regprocedure,'public.edit_shift(uuid,bigint,uuid,text,text,integer)'::regprocedure,'public.discard_roster_draft(uuid,bigint)'::regprocedure] loop execute format('revoke all on function %s from public,anon',f);execute format('grant execute on function %s to authenticated',f);end loop;end; $$;
commit;
