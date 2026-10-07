begin;

create table if not exists public.check_ins(
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.assignments(id),
  user_id uuid not null references auth.users(id),
  status text not null default 'scheduled' check(status in ('scheduled','checked_in','late','missing','completed')),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  updated_at timestamptz not null default now(),
  check(status<>'checked_in' or checked_in_at is not null),
  check(status<>'completed' or checked_out_at is not null)
);

create table if not exists public.incidents(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  reporter_id uuid not null references auth.users(id),
  assignment_id uuid references public.assignments(id),
  raw_report text not null check(char_length(trim(raw_report)) between 1 and 4000),
  status text not null default 'received' check(status in ('received','processing','needs_review','open','resolved')),
  category text,
  severity text check(severity is null or severity in ('low','medium','high','critical')),
  location_id uuid references public.locations(id),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checkins_user on public.check_ins(user_id);
create index if not exists incidents_event on public.incidents(event_id,created_at desc);

alter table public.check_ins enable row level security;
alter table public.incidents enable row level security;
revoke all on public.check_ins, public.incidents from anon, authenticated;
grant select on public.check_ins, public.incidents to authenticated;

drop policy if exists "Volunteers read own check-ins" on public.check_ins;
create policy "Volunteers read own check-ins" on public.check_ins for select to authenticated
  using(user_id=auth.uid() or exists(select 1 from public.assignments a join public.rosters r on r.id=a.roster_id where a.id=assignment_id and public.is_event_manager(r.event_id)));
drop policy if exists "Incident participants read" on public.incidents;
create policy "Incident participants read" on public.incidents for select to authenticated
  using(reporter_id=auth.uid() or public.is_event_manager(event_id));

create or replace function public.mark_live_attendance(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if not public.is_event_manager(p_event_id) then raise exception 'You cannot manage live attendance'; end if;
  insert into public.check_ins(assignment_id,user_id,status)
    select a.id,a.user_id,'scheduled'
    from public.assignments a
    join public.rosters r on r.id=a.roster_id
    where r.event_id=p_event_id and r.status='published'
    on conflict(assignment_id) do nothing;
  update public.check_ins c set status='late',updated_at=now()
  from public.assignments a join public.shifts s on s.id=a.shift_id join public.rosters r on r.id=a.roster_id
  where c.assignment_id=a.id and r.event_id=p_event_id and r.status='published'
    and c.status='scheduled' and s.starts_at <= now() and s.starts_at > now()-interval '30 minutes';
  get diagnostics changed = row_count;
  update public.check_ins c set status='missing',updated_at=now()
  from public.assignments a join public.shifts s on s.id=a.shift_id join public.rosters r on r.id=a.roster_id
  where c.assignment_id=a.id and r.event_id=p_event_id and r.status='published'
    and c.status in ('scheduled','late') and s.starts_at < now()-interval '30 minutes' and s.ends_at > now();
  return jsonb_build_object('updated',changed);
end; $$;

create or replace function public.my_live_assignments(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.is_event_member(p_event_id) then raise exception 'Join this event first'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'assignment_id',a.id,'shift_id',s.id,'post',p.name,'location',l.name,
      'starts_at',s.starts_at,'ends_at',s.ends_at,'instructions',s.instructions,
      'status',coalesce(c.status,'scheduled'),'checked_in_at',c.checked_in_at
    ) order by s.starts_at)
    from public.assignments a
    join public.rosters r on r.id=a.roster_id and r.status='published'
    join public.shifts s on s.id=a.shift_id
    join public.posts p on p.id=s.post_id
    join public.locations l on l.id=p.location_id
    left join public.check_ins c on c.assignment_id=a.id
    where r.event_id=p_event_id and a.user_id=auth.uid()
      and s.ends_at > now()-interval '12 hours'
  ),'[]'::jsonb);
end; $$;

create or replace function public.set_check_in(p_assignment_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.assignments;r public.rosters;c public.check_ins;next_status text;
begin
  select * into a from public.assignments where id=p_assignment_id;
  select * into r from public.rosters where id=a.roster_id;
  if a.id is null or r.status<>'published' or a.user_id<>auth.uid() then raise exception 'Assignment unavailable'; end if;
  if p_action not in ('check_in','check_out') then raise exception 'Unsupported check-in action'; end if;
  select * into c from public.check_ins where assignment_id=a.id;
  if p_action='check_in' then
    next_status='checked_in';
    insert into public.check_ins(assignment_id,user_id,status,checked_in_at)
      values(a.id,auth.uid(),next_status,now())
      on conflict(assignment_id) do update set status='checked_in',checked_in_at=coalesce(public.check_ins.checked_in_at,now()),updated_at=now()
      returning * into c;
  else
    if c.id is null or c.status not in ('checked_in','late') then raise exception 'Check in before checking out'; end if;
    update public.check_ins set status='completed',checked_out_at=now(),updated_at=now() where id=c.id returning * into c;
  end if;
  return to_jsonb(c);
end; $$;

create or replace function public.report_incident(p_event_id uuid,p_raw_report text,p_assignment_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.incidents;
begin
  if not public.is_event_member(p_event_id) then raise exception 'Join this event before reporting'; end if;
  if p_raw_report is null or char_length(trim(p_raw_report)) not between 1 and 4000 then raise exception 'Describe what happened'; end if;
  if p_assignment_id is not null and not exists(select 1 from public.assignments a join public.rosters r on r.id=a.roster_id where a.id=p_assignment_id and a.user_id=auth.uid() and r.event_id=p_event_id) then raise exception 'Assignment unavailable'; end if;
  insert into public.incidents(event_id,reporter_id,assignment_id,raw_report,status)
    values(p_event_id,auth.uid(),p_assignment_id,trim(p_raw_report),'received') returning * into i;
  return to_jsonb(i);
end; $$;

create or replace function public.live_event_snapshot(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_event_manager(p_event_id) then raise exception 'You cannot view live operations'; end if;
  perform public.mark_live_attendance(p_event_id);
  select jsonb_build_object(
    'event',jsonb_build_object('id',e.id,'name',e.name,'status',e.status,'timezone',e.timezone),
    'staffing',jsonb_build_object(
      'assigned',count(a.id),
      'checked_in',count(*) filter(where c.status='checked_in'),
      'late',count(*) filter(where c.status='late'),
      'missing',count(*) filter(where c.status='missing'),
      'completed',count(*) filter(where c.status='completed')
    ),
    'coverage',coalesce((select jsonb_agg(jsonb_build_object(
      'post',p.name,'location',l.name,'required',s.minimum_coverage,
      'assigned',(select count(*) from public.assignments where shift_id=s.id),
      'checked_in',(select count(*) from public.check_ins c join public.assignments a on a.id=c.assignment_id where a.shift_id=s.id and c.status='checked_in'),
      'missing',(select count(*) from public.check_ins c join public.assignments a on a.id=c.assignment_id where a.shift_id=s.id and c.status='missing'),
      'criticality',s.criticality
    )) from public.shifts s join public.posts p on p.id=s.post_id join public.locations l on l.id=p.location_id
      join public.rosters rr on rr.id=s.roster_id and rr.status='published'
      where rr.event_id=e.id and s.starts_at<=now() and s.ends_at>now()),'[]'::jsonb),
    'incidents',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'raw_report',i.raw_report,'status',i.status,'severity',i.severity,'created_at',i.created_at
    ) order by i.created_at desc) from public.incidents i where i.event_id=e.id and i.status<>'resolved' limit 20),'[]'::jsonb)
  ) into result
  from public.events e where e.id=p_event_id group by e.id;
  return result;
end; $$;

revoke all on function public.mark_live_attendance(uuid),public.my_live_assignments(uuid),public.set_check_in(uuid,text),public.report_incident(uuid,text,uuid),public.live_event_snapshot(uuid) from public,anon;
grant execute on function public.mark_live_attendance(uuid),public.my_live_assignments(uuid),public.set_check_in(uuid,text),public.report_incident(uuid,text,uuid),public.live_event_snapshot(uuid) to authenticated;

commit;
