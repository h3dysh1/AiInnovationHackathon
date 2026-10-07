-- Phase 2: organisations and events. Run after the Phase 1 migration.
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index organisations_creator_name_key
  on public.organisations (created_by, lower(name));

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  venue_name text not null check (char_length(trim(venue_name)) between 1 and 160),
  address text check (address is null or char_length(address) <= 300),
  start_date date not null,
  end_date date not null,
  operating_start_time time not null,
  operating_end_time time not null,
  timezone text not null check (char_length(trim(timezone)) between 1 and 80),
  expected_attendance integer check (expected_attendance is null or expected_attendance > 0),
  status text not null default 'draft' check (status in ('draft', 'recruiting', 'rostering', 'published', 'live', 'completed')),
  join_code text unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_dates_in_order check (end_date >= start_date),
  constraint event_operating_hours_in_order check (operating_end_time > operating_start_time)
);

create index events_created_by_start_date_idx on public.events (created_by, start_date);

create or replace function public.touch_event_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger on_event_updated_ground_control
  before update on public.events
  for each row execute function public.touch_event_updated_at();

alter table public.organisations enable row level security;
alter table public.events enable row level security;

revoke all on public.organisations from anon, authenticated;
revoke all on public.events from anon, authenticated;
grant select, insert on public.organisations to authenticated;
grant select, insert on public.events to authenticated;
grant update (name, description, venue_name, address, start_date, end_date,
  operating_start_time, operating_end_time, timezone, expected_attendance, status)
  on public.events to authenticated;

create policy "Coordinators read own organisations" on public.organisations
  for select to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.account_roles
      where user_id = (select auth.uid()) and role = 'coordinator'
    )
  );

create policy "Coordinators create own organisations" on public.organisations
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.account_roles
      where user_id = (select auth.uid()) and role = 'coordinator'
    )
  );

create policy "Coordinators read own events" on public.events
  for select to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.organisations
      where id = organisation_id and created_by = (select auth.uid())
    )
  );

create policy "Coordinators create events in own organisations" on public.events
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'draft'
    and exists (
      select 1 from public.organisations
      where id = organisation_id and created_by = (select auth.uid())
    )
  );

create policy "Coordinators edit own events" on public.events
  for update to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.organisations
      where id = organisation_id and created_by = (select auth.uid())
    )
  )
  with check (
    created_by = (select auth.uid())
    and status in ('draft', 'recruiting')
    and exists (
      select 1 from public.organisations
      where id = organisation_id and created_by = (select auth.uid())
    )
  );
