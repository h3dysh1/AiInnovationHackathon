-- Updated Phase 3: retain the coordinator's natural-language setup context.
-- Run after the earlier migrations on projects that already used the manual site editor.
-- Safe to rerun: keep existing notes and refresh this migration's access policies.
begin;

create table if not exists public.event_setup_sessions (
  event_id uuid primary key references public.events(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 20000),
  notes_reviewed_at timestamptz,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.event_setup_sessions enable row level security;
revoke all on public.event_setup_sessions from anon, authenticated;
grant select, insert on public.event_setup_sessions to authenticated;
grant update (description, notes_reviewed_at, updated_by, updated_at) on public.event_setup_sessions to authenticated;

drop policy if exists "Coordinator reads own setup session" on public.event_setup_sessions;
drop policy if exists "Coordinator creates own setup session" on public.event_setup_sessions;
drop policy if exists "Coordinator updates own setup session" on public.event_setup_sessions;

create policy "Coordinator reads own setup session" on public.event_setup_sessions
  for select to authenticated using (
    exists (select 1 from public.events where id = event_id and created_by = (select auth.uid()))
  );

create policy "Coordinator creates own setup session" on public.event_setup_sessions
  for insert to authenticated with check (
    updated_by = (select auth.uid())
    and notes_reviewed_at is null
    and exists (select 1 from public.events where id = event_id and created_by = (select auth.uid()))
  );
create policy "Coordinator updates own setup session" on public.event_setup_sessions
  for update to authenticated using (
    exists (select 1 from public.events where id = event_id and created_by = (select auth.uid()))
  ) with check (
    updated_by = (select auth.uid())
    and exists (select 1 from public.events where id = event_id and created_by = (select auth.uid()))
  );

commit;
