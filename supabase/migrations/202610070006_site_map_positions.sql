-- Venue selection, image-map pins, and a measured scale for distance estimates.
-- Keep existing events and notes. Safe to rerun after a partial setup.
begin;

create table if not exists public.event_site_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now()
);
alter table public.event_site_settings enable row level security;
revoke all on public.event_site_settings from anon, authenticated;
grant select, insert, update on public.event_site_settings to authenticated;
drop policy if exists "Coordinator manages own venue position" on public.event_site_settings;
create policy "Coordinator manages own venue position" on public.event_site_settings
  for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid())))
  with check (exists (select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid())));

alter table public.zones add column if not exists map_x numeric(5,2) check (map_x between 0 and 100);
alter table public.zones add column if not exists map_y numeric(5,2) check (map_y between 0 and 100);
alter table public.posts add column if not exists map_x numeric(5,2) check (map_x between 0 and 100);
alter table public.posts add column if not exists map_y numeric(5,2) check (map_y between 0 and 100);
alter table public.zones drop constraint if exists zone_coordinates_pair;
alter table public.zones add constraint zone_coordinates_pair check ((map_x is null) = (map_y is null));
alter table public.posts drop constraint if exists post_coordinates_pair;
alter table public.posts add constraint post_coordinates_pair check ((map_x is null) = (map_y is null));

alter table public.event_maps add column if not exists scale_start_x numeric(5,2) check (scale_start_x between 0 and 100);
alter table public.event_maps add column if not exists scale_start_y numeric(5,2) check (scale_start_y between 0 and 100);
alter table public.event_maps add column if not exists scale_end_x numeric(5,2) check (scale_end_x between 0 and 100);
alter table public.event_maps add column if not exists scale_end_y numeric(5,2) check (scale_end_y between 0 and 100);
alter table public.event_maps add column if not exists scale_distance_metres numeric check (scale_distance_metres > 0 and scale_distance_metres <= 1000000);
alter table public.event_maps drop constraint if exists map_scale_complete;
alter table public.event_maps add constraint map_scale_complete check (
  num_nonnulls(scale_start_x, scale_start_y, scale_end_x, scale_end_y, scale_distance_metres) = 0
  or (num_nonnulls(scale_start_x, scale_start_y, scale_end_x, scale_end_y, scale_distance_metres) = 5
    and (scale_start_x <> scale_end_x or scale_start_y <> scale_end_y))
);

-- Replacing an image changes its coordinate system. Clear positions and scale
-- in the same transaction, while retaining the zones, locations and posts.
create or replace function public.reset_replaced_site_map()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.event_id <> old.event_id then
    raise exception 'A site map cannot be moved to another event';
  end if;
  if new.storage_path is distinct from old.storage_path or new.width <> old.width or new.height <> old.height then
    update public.zones set map_x = null, map_y = null where event_id = new.event_id;
    update public.locations set map_x = null, map_y = null where event_id = new.event_id;
    update public.posts set map_x = null, map_y = null where event_id = new.event_id;
    new.scale_start_x := null;
    new.scale_start_y := null;
    new.scale_end_x := null;
    new.scale_end_y := null;
    new.scale_distance_metres := null;
  end if;
  return new;
end;
$$;
drop trigger if exists on_site_map_replaced on public.event_maps;
create trigger on_site_map_replaced before update on public.event_maps
  for each row execute function public.reset_replaced_site_map();

-- Check the map revision and lock it while placing a pin, so a simultaneous
-- replacement cannot attach old-image coordinates to the new image.
create or replace function public.set_site_pin(
  p_event_id uuid, p_kind text, p_entity_id uuid,
  p_expected_path text, p_x numeric, p_y numeric
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  current_path text;
  changed integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.events e where e.id = p_event_id and e.created_by = auth.uid()
  ) then
    raise exception 'You cannot edit this event';
  end if;
  if (p_x is null) <> (p_y is null) or p_x not between 0 and 100 or p_y not between 0 and 100 then
    raise exception 'Pin coordinates must both be empty or between 0 and 100';
  end if;
  select em.storage_path into current_path from public.event_maps em
    where em.event_id = p_event_id for share;
  if p_expected_path is null or current_path is null or current_path <> p_expected_path then
    raise exception 'The site map changed. Reopen the map before placing this pin';
  end if;
  if p_kind = 'zone' then
    update public.zones set map_x = p_x, map_y = p_y where id = p_entity_id and event_id = p_event_id;
  elsif p_kind = 'location' then
    update public.locations set map_x = p_x, map_y = p_y where id = p_entity_id and event_id = p_event_id;
  elsif p_kind = 'post' then
    update public.posts set map_x = p_x, map_y = p_y where id = p_entity_id and event_id = p_event_id;
  else
    raise exception 'Unknown pin type';
  end if;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'This site item could not be found'; end if;
end;
$$;
revoke all on function public.set_site_pin(uuid, text, uuid, text, numeric, numeric) from public, anon;
grant execute on function public.set_site_pin(uuid, text, uuid, text, numeric, numeric) to authenticated;

-- Read the pins and the image they belong to together. Hold the image lock
-- while reading so a concurrent replacement cannot mix two coordinate systems.
create or replace function public.get_site_structure(p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_path text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.events e where e.id = p_event_id and e.created_by = auth.uid()
  ) then
    raise exception 'You cannot view this event';
  end if;
  select em.storage_path into current_path from public.event_maps em
    where em.event_id = p_event_id for share;
  return jsonb_build_object(
    'mapPath', current_path,
    'zones', coalesce((select jsonb_agg(to_jsonb(z) order by z.name) from public.zones z where z.event_id = p_event_id), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(l) order by l.name) from public.locations l where l.event_id = p_event_id), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.posts p where p.event_id = p_event_id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_site_structure(uuid) from public, anon;
grant execute on function public.get_site_structure(uuid) to authenticated;

commit;
