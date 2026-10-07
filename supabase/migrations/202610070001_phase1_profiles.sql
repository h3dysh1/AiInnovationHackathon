-- Phase 1: account roles and editable profiles. Run in the Supabase SQL editor.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  phone text check (phone is null or char_length(phone) <= 40),
  created_at timestamptz not null default now()
);

create table if not exists public.account_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'volunteer' check (role in ('volunteer', 'coordinator'))
);

create table if not exists public.volunteer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  emergency_contact_name text check (emergency_contact_name is null or char_length(emergency_contact_name) <= 120),
  emergency_contact_phone text check (emergency_contact_phone is null or char_length(emergency_contact_phone) <= 40),
  experience_level text check (experience_level is null or char_length(experience_level) <= 200)
);

alter table public.profiles enable row level security;
alter table public.account_roles enable row level security;
alter table public.volunteer_profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.account_roles from anon, authenticated;
revoke all on public.volunteer_profiles from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, phone) on public.profiles to authenticated;
grant select on public.account_roles to authenticated;
grant select, insert, update on public.volunteer_profiles to authenticated;

create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Edit own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Read own role" on public.account_roles
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Read own volunteer details" on public.volunteer_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own volunteer details" on public.volunteer_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Edit own volunteer details" on public.volunteer_profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.create_account_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Volunteer'), 120));
  insert into public.account_roles (user_id, role) values (new.id, 'volunteer');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_ground_control on auth.users;
create trigger on_auth_user_created_ground_control
  after insert on auth.users
  for each row execute function public.create_account_profile();

-- Backfill accounts created before this migration.
insert into public.profiles (id, display_name)
select id, left(coalesce(nullif(trim(raw_user_meta_data ->> 'display_name'), ''), split_part(email, '@', 1), 'Volunteer'), 120)
from auth.users
on conflict (id) do nothing;
insert into public.account_roles (user_id, role)
select id, 'volunteer' from auth.users
on conflict (user_id) do nothing;
