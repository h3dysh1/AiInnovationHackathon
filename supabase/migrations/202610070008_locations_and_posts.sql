-- Simplify the operational model to Event -> Location -> Post.
-- Run after 007. Safe to rerun. Existing IDs, posts and requirements survive.
begin;

-- Retain the older parent column and its foreign key for historical records,
-- while allowing all new locations to belong directly to an event.
alter table public.locations alter column zone_id drop not null;

-- Preserve previously drawn areas as locations, including their circles.
-- Original rows remain available as legacy data; existing locations and their
-- posts keep their IDs and are never regrouped or deleted.
insert into public.locations(id, event_id, name, description, map_x, map_y, map_radius_percent)
select z.id, z.event_id, z.name, z.description, z.map_x, z.map_y, z.map_radius_percent
from public.zones z where z.map_x is not null and z.map_y is not null
on conflict do nothing;

create unique index if not exists locations_direct_event_name_key
  on public.locations(event_id, lower(name)) where zone_id is null;

create or replace function public.save_location_post(
  p_event_id uuid, p_expected_path text, p_entity_id uuid, p_kind text, p_creating boolean,
  p_name text, p_description text, p_x numeric, p_y numeric, p_radius numeric,
  p_location_id uuid, p_check_x numeric, p_check_y numeric, p_check_radius numeric
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  current_path text;
  already_exists boolean;
  current_location uuid;
  changed integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.events e where e.id = p_event_id and e.created_by = auth.uid()
  ) then raise exception 'You cannot edit this event'; end if;
  if p_entity_id is null or p_creating is null or p_kind is null or p_kind not in ('location', 'post') then
    raise exception 'Choose a location or post';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 120 or p_description is null or char_length(p_description) > 1000 then
    raise exception 'Enter a name of 1–120 characters and a description of at most 1,000 characters';
  end if;
  if (p_x is null) <> (p_y is null) or p_x not between 0 and 100 or p_y not between 0 and 100
    or (p_creating and p_x is null) then raise exception 'Choose a point inside the site map'; end if;
  if p_radius is not null and (p_x is null or p_radius not between 0.5 and 50) then
    raise exception 'Circle size must be between 0.5 and 50 percent of the shorter map edge';
  end if;
  if num_nonnulls(p_check_x, p_check_y, p_check_radius) <> 0 and (
    num_nonnulls(p_check_x, p_check_y, p_check_radius) <> 3 or p_kind <> 'post' or p_x is null
    or p_check_x not between 0 and 100 or p_check_y not between 0 and 100 or p_check_radius not between 0.5 and 50
  ) then raise exception 'Choose a valid check-in circle for a placed post'; end if;
  select em.storage_path into current_path from public.event_maps em where em.event_id = p_event_id for update;
  if p_expected_path is null or current_path is null or current_path <> p_expected_path then
    raise exception 'The site map changed. Reopen it before saving this item';
  end if;
  if p_kind = 'location' then
    select exists(select 1 from public.locations where id = p_entity_id and event_id = p_event_id) into already_exists;
  else
    if p_location_id is null or not exists (
      select 1 from public.locations where id = p_location_id and event_id = p_event_id
    ) then raise exception 'Choose a location in this event for the post'; end if;
    select p.location_id into current_location from public.posts p where p.id = p_entity_id and p.event_id = p_event_id;
    already_exists := current_location is not null;
    if already_exists and current_location <> p_location_id then
      raise exception 'The post location changed. Reopen it before saving';
    end if;
  end if;
  if not p_creating and not already_exists then raise exception 'This site item could not be found'; end if;

  if not already_exists then
    if p_kind = 'location' then
      insert into public.locations(id, event_id, name) values (p_entity_id, p_event_id, trim(p_name));
    else
      -- Several posts may share one location. Staffing remains per post.
      insert into public.posts(id, event_id, location_id, name, minimum_coverage)
        values (p_entity_id, p_event_id, p_location_id, trim(p_name), 1);
    end if;
  end if;
  if p_kind = 'location' then
    update public.locations set name = trim(p_name), description = nullif(trim(p_description), ''),
      map_x = p_x, map_y = p_y, map_radius_percent = p_radius where id = p_entity_id and event_id = p_event_id;
  else
    update public.posts set name = trim(p_name), description = trim(p_description),
      map_x = p_x, map_y = p_y, map_radius_percent = p_radius,
      check_in_x = p_check_x, check_in_y = p_check_y, check_in_radius_percent = p_check_radius
      where id = p_entity_id and event_id = p_event_id;
  end if;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'This site item could not be saved'; end if;
end;
$$;
revoke all on function public.save_location_post(uuid, text, uuid, text, boolean, text, text, numeric, numeric, numeric, uuid, numeric, numeric, numeric) from public, anon;
grant execute on function public.save_location_post(uuid, text, uuid, text, boolean, text, text, numeric, numeric, numeric, uuid, numeric, numeric, numeric) to authenticated;

create or replace function public.get_site_structure(p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_path text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.events e where e.id = p_event_id and e.created_by = auth.uid()
  ) then raise exception 'You cannot view this event'; end if;
  select em.storage_path into current_path from public.event_maps em where em.event_id = p_event_id for share;
  return jsonb_build_object(
    'mapPath', current_path,
    'locations', coalesce((select jsonb_agg(to_jsonb(l) order by l.name) from public.locations l where l.event_id = p_event_id), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.posts p where p.event_id = p_event_id), '[]'::jsonb)
  );
end;
$$;

commit;
