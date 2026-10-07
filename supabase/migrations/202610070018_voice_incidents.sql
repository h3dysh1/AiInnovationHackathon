begin;

alter table public.incidents
  add column if not exists audio_path text,
  add column if not exists audio_mime_type text,
  add column if not exists audio_size_bytes integer;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'incident-audio',
  'incident-audio',
  false,
  10485760,
  array['audio/mp4','audio/x-m4a','audio/m4a','audio/webm']
)
on conflict(id) do nothing;

drop policy if exists "Incident audio participants read" on storage.objects;
create policy "Incident audio participants read" on storage.objects for select to authenticated
  using (
    bucket_id = 'incident-audio'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_event_manager((storage.foldername(name))[2]::uuid)
    )
  );

drop policy if exists "Volunteers upload own incident audio" on storage.objects;
create policy "Volunteers upload own incident audio" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'incident-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.event_memberships m
      where m.user_id = auth.uid()
        and m.event_id = (storage.foldername(name))[2]::uuid
        and m.status = 'active'
    )
  );

drop policy if exists "Volunteers remove unused incident audio" on storage.objects;
create policy "Volunteers remove unused incident audio" on storage.objects for delete to authenticated
  using (
    bucket_id = 'incident-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (select 1 from public.incidents i where i.audio_path = name)
  );

create or replace function public.report_voice_incident(
  p_event_id uuid,
  p_audio_path text,
  p_audio_mime_type text,
  p_audio_size_bytes integer,
  p_assignment_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.incidents;
begin
  if not public.is_event_member(p_event_id) then
    raise exception 'Join this event before reporting';
  end if;
  if p_audio_path is null
    or p_audio_path <> auth.uid()::text || '/' || p_event_id::text || '/' || split_part(p_audio_path, '/', 3)
    or split_part(p_audio_path, '/', 3) !~ '^[0-9a-f-]{36}\.(m4a|mp4|webm)$'
  then
    raise exception 'Invalid incident audio';
  end if;
  if p_audio_mime_type not in ('audio/mp4','audio/x-m4a','audio/m4a','audio/webm')
    or p_audio_size_bytes is null or p_audio_size_bytes < 1 or p_audio_size_bytes > 10485760
  then
    raise exception 'Invalid incident audio';
  end if;
  if p_assignment_id is not null and not exists(
    select 1 from public.assignments a
    join public.rosters r on r.id=a.roster_id
    where a.id=p_assignment_id and a.user_id=auth.uid() and r.event_id=p_event_id
  ) then
    raise exception 'Assignment unavailable';
  end if;
  insert into public.incidents(
    event_id, reporter_id, assignment_id, raw_report, status,
    audio_path, audio_mime_type, audio_size_bytes
  )
  values(
    p_event_id, auth.uid(), p_assignment_id, 'Voice report attached.', 'received',
    p_audio_path, p_audio_mime_type, p_audio_size_bytes
  )
  returning * into i;
  return to_jsonb(i);
end; $$;

revoke all on function public.report_voice_incident(uuid,text,text,integer,uuid) from public,anon;
grant execute on function public.report_voice_incident(uuid,text,text,integer,uuid) to authenticated;

commit;
