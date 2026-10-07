-- Direct image-map editing. Run after 006. Safe to rerun.
-- Image circles describe areas; they do not verify a device's GPS position.
begin;

alter table public.zones add column if not exists map_radius_percent numeric;
alter table public.locations add column if not exists map_radius_percent numeric;
alter table public.posts add column if not exists map_radius_percent numeric;
alter table public.posts add column if not exists check_in_x numeric(5,2);
alter table public.posts add column if not exists check_in_y numeric(5,2);
alter table public.posts add column if not exists check_in_radius_percent numeric;

alter table public.zones drop constraint if exists zone_map_circle;
alter table public.zones add constraint zone_map_circle check (
  map_radius_percent is null or (map_x is not null and map_y is not null and map_radius_percent between 0.5 and 50)
);
alter table public.locations drop constraint if exists location_map_circle;
alter table public.locations add constraint location_map_circle check (
  map_radius_percent is null or (map_x is not null and map_y is not null and map_radius_percent between 0.5 and 50)
);
alter table public.posts drop constraint if exists post_map_circle;
alter table public.posts add constraint post_map_circle check (
  map_radius_percent is null or (map_x is not null and map_y is not null and map_radius_percent between 0.5 and 50)
);
alter table public.posts drop constraint if exists post_check_in_circle;
alter table public.posts add constraint post_check_in_circle check (
  num_nonnulls(check_in_x, check_in_y, check_in_radius_percent) = 0
  or (num_nonnulls(check_in_x, check_in_y, check_in_radius_percent) = 3
    and map_x is not null and map_y is not null
    and check_in_x between 0 and 100 and check_in_y between 0 and 100
    and check_in_radius_percent between 0.5 and 50)
);

create or replace function public.reset_replaced_site_map()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.event_id <> old.event_id then raise exception 'A site map cannot be moved to another event'; end if;
  if new.storage_path is distinct from old.storage_path or new.width <> old.width or new.height <> old.height then
    update public.zones set map_x = null, map_y = null, map_radius_percent = null where event_id = new.event_id;
    update public.locations set map_x = null, map_y = null, map_radius_percent = null where event_id = new.event_id;
    update public.posts set map_x = null, map_y = null, map_radius_percent = null,
      check_in_x = null, check_in_y = null, check_in_radius_percent = null where event_id = new.event_id;
    new.scale_start_x := null; new.scale_start_y := null;
    new.scale_end_x := null; new.scale_end_y := null; new.scale_distance_metres := null;
  end if;
  return new;
end;
$$;

-- Keep the older pin API compatible with circles and clearing a post.
create or replace function public.set_site_pin(
  p_event_id uuid, p_kind text, p_entity_id uuid,
  p_expected_path text, p_x numeric, p_y numeric
) returns void language plpgsql security invoker set search_path = '' as $$
declare current_path text; changed integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.events e where e.id = p_event_id and e.created_by = auth.uid()
  ) then raise exception 'You cannot edit this event'; end if;
  if (p_x is null) <> (p_y is null) or p_x not between 0 and 100 or p_y not between 0 and 100 then
    raise exception 'Pin coordinates must both be empty or between 0 and 100';
  end if;
  select em.storage_path into current_path from public.event_maps em where em.event_id = p_event_id for share;
  if p_expected_path is null or current_path is null or current_path <> p_expected_path then
    raise exception 'The site map changed. Reopen the map before placing this pin';
  end if;
  if p_kind = 'zone' then
    update public.zones set map_x = p_x, map_y = p_y,
      map_radius_percent = case when p_x is null then null else map_radius_percent end where id = p_entity_id and event_id = p_event_id;
  elsif p_kind = 'location' then
    update public.locations set map_x = p_x, map_y = p_y,
      map_radius_percent = case when p_x is null then null else map_radius_percent end where id = p_entity_id and event_id = p_event_id;
  elsif p_kind = 'post' then
    update public.posts set map_x = p_x, map_y = p_y,
      map_radius_percent = case when p_x is null then null else map_radius_percent end,
      check_in_x = case when p_x is null then null else check_in_x end,
      check_in_y = case when p_x is null then null else check_in_y end,
      check_in_radius_percent = case when p_x is null then null else check_in_radius_percent end
      where id = p_entity_id and event_id = p_event_id;
  else raise exception 'Unknown pin type'; end if;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'This site item could not be found'; end if;
end;
$$;

-- Atomic creation/update of a site item and its geometry. Stable client IDs
-- make a retry after a lost reply update the same item instead of duplicating it.
-- Existing post staffing, instructions, requirements and parents are preserved.
create or replace function public.save_map_item(
  p_event_id uuid, p_expected_path text, p_entity_id uuid, p_kind text, p_creating boolean,
  p_name text, p_description text, p_x numeric, p_y numeric, p_radius numeric,
  p_zone_id uuid, p_zone_name text, p_location_id uuid,
  p_check_x numeric, p_check_y numeric, p_check_radius numeric
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  current_path text;
  target_zone uuid;
  target_location uuid;
  already_exists boolean;
  changed integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.events e where e.id = p_event_id and e.created_by = auth.uid()
  ) then raise exception 'You cannot edit this event'; end if;
  if p_entity_id is null or p_creating is null or p_kind is null or p_kind not in ('zone', 'location', 'post') then
    raise exception 'Choose a valid site item';
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

  -- Serialise saves and replacements for this event, including simultaneous
  -- retries of a new post. Check ownership through invoker RLS throughout.
  select em.storage_path into current_path from public.event_maps em where em.event_id = p_event_id for update;
  if p_expected_path is null or current_path is null or current_path <> p_expected_path then
    raise exception 'The site map changed. Reopen it before saving this item';
  end if;

  if p_kind = 'zone' then
    select exists(select 1 from public.zones where id = p_entity_id and event_id = p_event_id) into already_exists;
  elsif p_kind = 'location' then
    select exists(select 1 from public.locations where id = p_entity_id and event_id = p_event_id) into already_exists;
  else
    select exists(select 1 from public.posts where id = p_entity_id and event_id = p_event_id) into already_exists;
  end if;
  if not p_creating and not already_exists then raise exception 'This site item could not be found'; end if;

  if not already_exists then
    if p_kind <> 'zone' then
      if p_kind = 'post' and p_location_id is not null then
        select l.id into target_location from public.locations l where l.id = p_location_id and l.event_id = p_event_id;
        if target_location is null then raise exception 'Choose a location in this event'; end if;
      else
        if p_zone_id is not null then
          select z.id into target_zone from public.zones z where z.id = p_zone_id and z.event_id = p_event_id;
          if target_zone is null then raise exception 'Choose a zone in this event'; end if;
        else
          if p_zone_name is null or char_length(trim(p_zone_name)) not between 1 and 120 then
            raise exception 'Choose a zone or enter a zone name';
          end if;
          select z.id into target_zone from public.zones z where z.event_id = p_event_id and lower(z.name) = lower(trim(p_zone_name));
          if target_zone is null then
            insert into public.zones(event_id, name) values (p_event_id, trim(p_zone_name)) returning id into target_zone;
          end if;
        end if;
        if p_kind = 'post' then
          -- A post can be added directly without a separate location wizard.
          -- Reuse a location of the same name within the chosen zone, or create
          -- an unplaced location. The post owns its own explicit map position.
          select l.id into target_location from public.locations l where l.zone_id = target_zone
            and l.event_id = p_event_id and lower(l.name) = lower(trim(p_name));
          if target_location is null then
            insert into public.locations(event_id, zone_id, name) values (p_event_id, target_zone, trim(p_name)) returning id into target_location;
          end if;
        end if;
      end if;
    end if;
    if p_kind = 'zone' then
      insert into public.zones(id, event_id, name) values (p_entity_id, p_event_id, trim(p_name));
    elsif p_kind = 'location' then
      insert into public.locations(id, event_id, zone_id, name) values (p_entity_id, p_event_id, target_zone, trim(p_name));
    else
      insert into public.posts(id, event_id, location_id, name, minimum_coverage) values (p_entity_id, p_event_id, target_location, trim(p_name), 1);
    end if;
  end if;

  if p_kind = 'zone' then
    update public.zones set name = trim(p_name), description = nullif(trim(p_description), ''),
      map_x = p_x, map_y = p_y, map_radius_percent = p_radius where id = p_entity_id and event_id = p_event_id;
  elsif p_kind = 'location' then
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
revoke all on function public.save_map_item(uuid, text, uuid, text, boolean, text, text, numeric, numeric, numeric, uuid, text, uuid, numeric, numeric, numeric) from public, anon;
grant execute on function public.save_map_item(uuid, text, uuid, text, boolean, text, text, numeric, numeric, numeric, uuid, text, uuid, numeric, numeric, numeric) to authenticated;

commit;
