-- Correct the Phase 3 map-file policies on projects that already ran 003.
-- Only the file path lookup changes; access remains limited to the event creator.
drop policy if exists "Coordinator reads own map files" on storage.objects;
drop policy if exists "Coordinator uploads own map files" on storage.objects;
drop policy if exists "Coordinator removes own map files" on storage.objects;

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
