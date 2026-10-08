-- Repair the live summary's undefined assignment/check-in aliases.
-- Scope staffing totals to this event's published roster, including future shifts.
begin;
create or replace function public.live_event_snapshot(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_event_manager(p_event_id) then raise exception 'You cannot view live operations'; end if;
  perform public.mark_live_attendance(p_event_id);
  select jsonb_build_object(
    'event',jsonb_build_object('id',e.id,'name',e.name,'status',e.status,'timezone',e.timezone),
    'staffing',(select jsonb_build_object(
      'assigned',count(a.id),
      'checked_in',count(*) filter(where c.status='checked_in'),
      'late',count(*) filter(where c.status='late'),
      'missing',count(*) filter(where c.status='missing'),
      'completed',count(*) filter(where c.status='completed')
    ) from public.assignments a
      join public.rosters r on r.id=a.roster_id and r.status='published'
      left join public.check_ins c on c.assignment_id=a.id
      where r.event_id=e.id),
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
  from public.events e where e.id=p_event_id;
  return result;
end; $$;
commit;
