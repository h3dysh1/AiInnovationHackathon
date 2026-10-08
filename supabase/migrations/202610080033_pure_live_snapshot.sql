begin;
-- Reading the live snapshot used to call mark_live_attendance, so every poll
-- of the Alerts screen inserted and updated check-in rows. Late and missing
-- are now derived at read time with the same rule, which lets the function be
-- STABLE: Postgres rejects any write from it. Stored statuses are still
-- maintained by process_live_attendance on the worker schedule.
create or replace function public.live_attendance_status(p_stored text,p_starts timestamptz,p_ends timestamptz,p_grace integer)
returns text language sql stable set search_path='' as $$
 select case when coalesce(p_stored,'scheduled') in ('scheduled','late') and p_starts<=now() and p_ends>now()
  then case when p_starts<=now()-make_interval(mins=>p_grace) then 'missing' else 'late' end
  else coalesce(p_stored,'scheduled') end
$$;
revoke all on function public.live_attendance_status(text,timestamptz,timestamptz,integer) from public,anon,authenticated;
create or replace function public.live_event_snapshot(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_event_manager(p_event_id) then raise exception 'You cannot view live operations'; end if;
  select jsonb_build_object(
    'event',jsonb_build_object('id',e.id,'name',e.name,'status',e.status,'timezone',e.timezone,'is_demo',e.is_demo,'demo_source_id',e.demo_source_id),
    'staffing',(select jsonb_build_object(
      'assigned',count(a.id) filter(where coalesce(a.effective_ends_at,s.ends_at)>now()),
      'checked_in',count(*) filter(where c.status='checked_in' and coalesce(a.effective_ends_at,s.ends_at)>now()),
      'late',count(*) filter(where public.live_attendance_status(c.status,coalesce(a.effective_starts_at,s.starts_at),coalesce(a.effective_ends_at,s.ends_at),e.no_show_grace_minutes)='late' and coalesce(a.effective_ends_at,s.ends_at)>now()),
      'missing',count(*) filter(where public.live_attendance_status(c.status,coalesce(a.effective_starts_at,s.starts_at),coalesce(a.effective_ends_at,s.ends_at),e.no_show_grace_minutes)='missing' and coalesce(a.effective_ends_at,s.ends_at)>now()),
      'completed',count(*) filter(where c.status='completed')
    ) from public.assignments a
      join public.rosters r on r.id=a.roster_id and r.status='published' join public.shifts s on s.id=a.shift_id
      left join public.check_ins c on c.assignment_id=a.id
      where r.event_id=e.id),
    'coverage',coalesce((select jsonb_agg(jsonb_build_object(
      'post',p.name,'location',l.name,'required',s.minimum_coverage,
      'assigned',(select count(*) from public.assignments where shift_id=s.id),
      'checked_in',(select count(*) from public.check_ins c join public.assignments a on a.id=c.assignment_id where a.shift_id=s.id and c.status='checked_in' and coalesce(a.effective_ends_at,s.ends_at)>now()),
      'missing',(select count(*) from public.assignments a left join public.check_ins c on c.assignment_id=a.id where a.shift_id=s.id and public.live_attendance_status(c.status,coalesce(a.effective_starts_at,s.starts_at),coalesce(a.effective_ends_at,s.ends_at),e.no_show_grace_minutes)='missing' and coalesce(a.effective_ends_at,s.ends_at)>now()),
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
