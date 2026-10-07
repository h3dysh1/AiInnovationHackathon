-- Phase 3: site map, zones, locations, posts and staffing requirements.
-- Run after the Phase 2 migration.

create table public.event_maps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  storage_path text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  uploaded_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint map_path_matches_event check (storage_path like event_id::text || '/%')
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  unique (id, event_id)
);
create unique index zones_event_name_key on public.zones (event_id, lower(name));

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  zone_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  map_x numeric(5, 2) check (map_x between 0 and 100),
  map_y numeric(5, 2) check (map_y between 0 and 100),
  created_at timestamptz not null default now(),
  constraint location_coordinates_pair check ((map_x is null) = (map_y is null)),
  constraint location_zone_in_same_event foreign key (zone_id, event_id)
    references public.zones (id, event_id),
  unique (id, event_id)
);
create unique index locations_zone_name_key on public.locations (zone_id, lower(name));

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  location_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  minimum_coverage integer not null check (minimum_coverage > 0),
  criticality text not null default 'normal' check (criticality in ('normal', 'important', 'critical')),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  created_at timestamptz not null default now(),
  constraint post_location_in_same_event foreign key (location_id, event_id)
    references public.locations (id, event_id)
);
create unique index posts_location_name_key on public.posts (location_id, lower(name));

create table public.post_requirements (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  certification_type text check (certification_type is null or char_length(trim(certification_type)) between 1 and 120),
  experience_requirement text check (experience_requirement is null or char_length(trim(experience_requirement)) between 1 and 120),
  minimum_count integer not null check (minimum_count > 0),
  created_at timestamptz not null default now(),
  constraint requirement_has_qualification check (certification_type is not null or experience_requirement is not null)
);

create or replace function public.check_requirement_coverage()
returns trigger language plpgsql set search_path = '' as $$
declare
  coverage integer;
begin
  select minimum_coverage into coverage from public.posts where id = new.post_id;
  if new.minimum_count > coverage then
    raise exception 'Requirement count cannot exceed post minimum coverage';
  end if;
  return new;
end;
$$;
create trigger on_post_requirement_coverage_ground_control
  before insert or update on public.post_requirements
  for each row execute function public.check_requirement_coverage();

create or replace function public.check_post_coverage()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.post_requirements
    where post_id = new.id and minimum_count > new.minimum_coverage) then
    raise exception 'Post minimum coverage cannot be below an existing requirement';
  end if;
  return new;
end;
$$;
create trigger on_post_coverage_ground_control
  before update of minimum_coverage on public.posts
  for each row execute function public.check_post_coverage();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-maps', 'site-maps', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

alter table public.event_maps enable row level security;
alter table public.zones enable row level security;
alter table public.locations enable row level security;
alter table public.posts enable row level security;
alter table public.post_requirements enable row level security;

revoke all on public.event_maps, public.zones, public.locations, public.posts, public.post_requirements from anon, authenticated;
grant select, insert, update on public.event_maps, public.zones, public.locations, public.posts to authenticated;
grant select, insert, update, delete on public.post_requirements to authenticated;

create policy "Coordinator reads own maps" on public.event_maps for select to authenticated
  using (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));
create policy "Coordinator creates own maps" on public.event_maps for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));
create policy "Coordinator updates own maps" on public.event_maps for update to authenticated
  using (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())))
  with check (uploaded_by = (select auth.uid()) and exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));

create policy "Coordinator reads own zones" on public.zones for select to authenticated
  using (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));
create policy "Coordinator creates own zones" on public.zones for insert to authenticated
  with check (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));
create policy "Coordinator updates own zones" on public.zones for update to authenticated
  using (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())))
  with check (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));

create policy "Coordinator reads own locations" on public.locations for select to authenticated
  using (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));
create policy "Coordinator creates own locations" on public.locations for insert to authenticated
  with check (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));
create policy "Coordinator updates own locations" on public.locations for update to authenticated
  using (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));

create policy "Coordinator reads own posts" on public.posts for select to authenticated
  using (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));
create policy "Coordinator creates own posts" on public.posts for insert to authenticated
  with check (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));
create policy "Coordinator updates own posts" on public.posts for update to authenticated
  using (exists (select 1 from public.events where id = event_id and created_by = (select auth.uid())));

create policy "Coordinator reads own requirements" on public.post_requirements for select to authenticated
  using (exists (select 1 from public.posts where id = post_id));
create policy "Coordinator creates own requirements" on public.post_requirements for insert to authenticated
  with check (exists (select 1 from public.posts where id = post_id));
create policy "Coordinator updates own requirements" on public.post_requirements for update to authenticated
  using (exists (select 1 from public.posts where id = post_id))
  with check (exists (select 1 from public.posts where id = post_id));
create policy "Coordinator removes own requirements" on public.post_requirements for delete to authenticated
  using (exists (select 1 from public.posts where id = post_id));

create policy "Coordinator reads own map files" on storage.objects for select to authenticated
  using (bucket_id = 'site-maps' and exists (
    select 1 from public.events where id::text = (storage.foldername(storage.objects.name))[1] and created_by = (select auth.uid())
  ));
create policy "Coordinator uploads own map files" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-maps' and exists (
    select 1 from public.events where id::text = (storage.foldername(storage.objects.name))[1] and created_by = (select auth.uid())
  ));
create policy "Coordinator removes own map files" on storage.objects for delete to authenticated
  using (bucket_id = 'site-maps' and exists (
    select 1 from public.events where id::text = (storage.foldername(storage.objects.name))[1] and created_by = (select auth.uid())
  ));
