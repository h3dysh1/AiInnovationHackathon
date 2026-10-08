begin;
create table if not exists public.event_roster_rules (
 event_id uuid primary key references public.events(id),minimum_rest_hours numeric not null default 0 check(minimum_rest_hours between 0 and 24),
 minimum_break_minutes integer not null default 30 check(minimum_break_minutes between 0 and 240),
 maximum_continuous_hours numeric not null default 0 check(maximum_continuous_hours between 0 and 24)
);
alter table public.event_roster_rules enable row level security;
revoke all on public.event_roster_rules from public,anon,authenticated;
grant select on public.event_roster_rules to authenticated;
drop policy if exists "Managers read roster rules" on public.event_roster_rules;
create policy "Managers read roster rules" on public.event_roster_rules for select to authenticated using(public.is_event_manager(event_id));
create or replace function public.get_roster_rules(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable'; end if;
 return (select to_jsonb(r) from public.event_roster_rules r where event_id=p_event_id);
end; $$;
create or replace function public.set_roster_rules(p_event_id uuid,p_rest numeric,p_break integer,p_continuous numeric) returns void
language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable'; end if;
 select * into e from public.events where id=p_event_id for update;
 if e.status in ('live','completed') then raise exception 'Change roster rules before the event starts'; end if;
 insert into public.event_roster_rules(event_id,minimum_rest_hours,minimum_break_minutes,maximum_continuous_hours)
 values(p_event_id,p_rest,p_break,p_continuous) on conflict(event_id) do update set minimum_rest_hours=excluded.minimum_rest_hours,minimum_break_minutes=excluded.minimum_break_minutes,maximum_continuous_hours=excluded.maximum_continuous_hours;
 update public.events set staffing_revision=staffing_revision+1 where id=p_event_id;
end; $$;
create or replace function public.roster_rest_problem(p_roster_id uuid,p_shift_id uuid,p_user_id uuid,p_exclude_id uuid default null) returns text
language plpgsql stable security definer set search_path='' as $$
declare s public.shifts;rules public.event_roster_rules;tz text;x record;last_start timestamptz;last_end timestamptz;block_start timestamptz;block_end timestamptz;gap numeric;
begin
 select * into s from public.shifts where id=p_shift_id and roster_id=p_roster_id;
 if s.id is null then return 'Shift unavailable'; end if;
 select * into rules from public.event_roster_rules where event_id=s.event_id;
 if rules.event_id is null then return null; end if;
 select timezone into tz from public.events where id=s.event_id;
 for x in select work.* from (
  select s.starts_at,s.ends_at union all
  select coalesce(a.effective_starts_at,t.starts_at),coalesce(a.effective_ends_at,t.ends_at) from public.assignments a join public.shifts t on t.id=a.shift_id join public.rosters r on r.id=a.roster_id
  where a.user_id=p_user_id and a.id is distinct from p_exclude_id and r.status in ('draft','published') and (r.id=p_roster_id or r.event_id<>s.event_id)
 ) work order by starts_at,ends_at loop
  gap:=extract(epoch from(x.starts_at-last_end))/3600;
  if last_end is not null and gap<0 then return 'Overlapping shifts'; end if;
  if last_start is not null and (last_start at time zone tz)::date<>(x.starts_at at time zone tz)::date and gap<rules.minimum_rest_hours then return 'Minimum rest between work days not met'; end if;
  if last_end is null or (gap*60>=rules.minimum_break_minutes and gap>0) then block_start:=x.starts_at;block_end:=x.ends_at;
  else block_end:=greatest(block_end,x.ends_at);end if;
  if rules.maximum_continuous_hours>0 and extract(epoch from(block_end-block_start))/3600>rules.maximum_continuous_hours then return 'Maximum continuous work exceeded; add a sufficient break between shifts'; end if;
  last_start:=x.starts_at;last_end:=x.ends_at;
 end loop;
 return null;
end; $$;
-- Preserve the existing constraints; add one check around the authoritative function.
do $$ declare body text; begin
 if to_regprocedure('public.assignment_problem_before_rest(uuid,uuid,uuid,uuid)') is null then
  body:=pg_get_functiondef('public.assignment_problem(uuid,uuid,uuid,uuid)'::regprocedure);
  execute replace(body,'FUNCTION public.assignment_problem(','FUNCTION public.assignment_problem_before_rest(');
 end if;
 body:=pg_get_functiondef('public.get_roster_context(uuid)'::regprocedure);
 if position('rosterRules' in body)=0 then
  execute replace(body,'''staffing_revision'',e.staffing_revision','''staffing_revision'',e.staffing_revision,''rosterRules'',(select to_jsonb(rules) from public.event_roster_rules rules where rules.event_id=e.id)');
 end if;
end; $$;
create or replace function public.assignment_problem(p_roster_id uuid,p_shift_id uuid,p_user_id uuid,p_exclude_id uuid default null) returns text
language plpgsql stable security definer set search_path='' as $$
declare problem text;
begin
 problem:=public.assignment_problem_before_rest(p_roster_id,p_shift_id,p_user_id,p_exclude_id);
 if problem is not null then return problem; end if;
 return public.roster_rest_problem(p_roster_id,p_shift_id,p_user_id,p_exclude_id);
end; $$;
revoke all on function public.assignment_problem_before_rest(uuid,uuid,uuid,uuid),public.roster_rest_problem(uuid,uuid,uuid,uuid) from public,anon,authenticated;
-- Live moves must also respect configured limits. Clip the source's remaining
-- window at now, then include its time already worked before the proposed move.
create or replace function public.live_rest_problem(p_shift_id uuid,p_user_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare s public.shifts;rules public.event_roster_rules;tz text;x record;last_start timestamptz;last_end timestamptz;block_start timestamptz;block_end timestamptz;gap numeric;
begin
 select * into s from public.shifts where id=p_shift_id;
 select * into rules from public.event_roster_rules where event_id=s.event_id;
 if rules.event_id is null then return null;end if;
 select timezone into tz from public.events where id=s.event_id;
 for x in select work.* from (
  select now() as starts_at,s.ends_at union all
  select coalesce(a.effective_starts_at,t.starts_at),
   case when c.status='checked_in' and coalesce(a.effective_starts_at,t.starts_at)<now() then least(coalesce(a.effective_ends_at,t.ends_at),now()) else coalesce(a.effective_ends_at,t.ends_at) end
  from public.assignments a join public.shifts t on t.id=a.shift_id join public.rosters r on r.id=a.roster_id left join public.check_ins c on c.assignment_id=a.id
  where a.user_id=p_user_id and r.status='published'
 )work where ends_at>starts_at order by starts_at,ends_at loop
  gap:=extract(epoch from(x.starts_at-last_end))/3600;
  if last_end is not null and gap<0 then return 'Overlapping shifts';end if;
  if last_start is not null and (last_start at time zone tz)::date<>(x.starts_at at time zone tz)::date and gap<rules.minimum_rest_hours then return 'Minimum rest between work days not met';end if;
  if last_end is null or (gap*60>=rules.minimum_break_minutes and gap>0) then block_start:=x.starts_at;block_end:=x.ends_at;
  else block_end:=greatest(block_end,x.ends_at);end if;
  if rules.maximum_continuous_hours>0 and extract(epoch from(block_end-block_start))/3600>rules.maximum_continuous_hours then return 'Maximum continuous work exceeded; choose a rested volunteer';end if;
  last_start:=x.starts_at;last_end:=x.ends_at;
 end loop;
 return null;
end; $$;
do $$ declare body text;begin
 if to_regprocedure('public.live_candidate_problem_before_rest(uuid,uuid,jsonb)') is null then
  body:=pg_get_functiondef('public.live_candidate_problem(uuid,uuid,jsonb)'::regprocedure);
  execute replace(body,'FUNCTION public.live_candidate_problem(','FUNCTION public.live_candidate_problem_before_rest(');
 end if;
end; $$;
create or replace function public.live_candidate_problem(p_shift_id uuid,p_user_id uuid,p_req jsonb) returns text
language plpgsql stable security definer set search_path='' as $$
declare problem text;
begin
 problem:=public.live_candidate_problem_before_rest(p_shift_id,p_user_id,p_req);
 if problem is not null then return problem;end if;
 return public.live_rest_problem(p_shift_id,p_user_id);
end; $$;
revoke all on function public.live_candidate_problem_before_rest(uuid,uuid,jsonb),public.live_rest_problem(uuid,uuid),public.live_candidate_problem(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.set_roster_rules(uuid,numeric,integer,numeric) from public,anon;
grant execute on function public.set_roster_rules(uuid,numeric,integer,numeric) to authenticated;
revoke all on function public.get_roster_rules(uuid) from public,anon;
grant execute on function public.get_roster_rules(uuid) to authenticated;
commit;
