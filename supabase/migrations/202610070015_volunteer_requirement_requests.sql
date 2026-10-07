begin;

create or replace function public.event_onboarding_context(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_event_member(p_event_id) then
    raise exception 'Join this event first';
  end if;

  return jsonb_build_object(
    'posts',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'location_name', l.name
      ))
      from public.posts p
      join public.locations l on l.id = p.location_id
      where p.event_id = p_event_id
    ), '[]'::jsonb),
    'requirements',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'certification_type', r.certification_type,
        'post_name', p.name,
        'location_name', l.name
      ) order by p.name, r.certification_type)
      from public.post_requirements r
      join public.posts p on p.id = r.post_id
      join public.locations l on l.id = p.location_id
      where p.event_id = p_event_id
        and r.certification_type is not null
    ), '[]'::jsonb),
    'preferences',
    (
      select to_jsonb(v)
      from public.event_volunteer_preferences v
      where v.event_id = p_event_id and v.user_id = auth.uid()
    ),
    'availability',
    coalesce((
      select jsonb_agg(to_jsonb(a) order by a.starts_at)
      from public.volunteer_availability a
      where a.event_id = p_event_id and a.user_id = auth.uid()
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.event_onboarding_context(uuid) from public, anon;
grant execute on function public.event_onboarding_context(uuid) to authenticated;

commit;
