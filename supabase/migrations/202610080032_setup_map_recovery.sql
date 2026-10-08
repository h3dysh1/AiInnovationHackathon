begin;
-- The image uploaded in event setup is also an authoritative extraction source.
create or replace function public.get_setup_ai_context(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.setup_ai_jobs; e public.events;
begin
 select * into j from public.setup_ai_jobs where id=p_job_id;
 if j.id is null or not public.is_event_manager(j.event_id) then raise exception 'Analysis is unavailable';end if;
 select * into e from public.events where id=j.event_id for share;
 if e.setup_revision<>j.input_revision then raise exception 'Setup changed before analysis. Start again';end if;
 return jsonb_build_object('event',to_jsonb(e),
  'description',(select description from public.event_setup_sessions where event_id=e.id),
  'site_map',(select to_jsonb(m) from public.event_maps m where m.event_id=e.id),
  'documents',coalesce((select jsonb_agg(to_jsonb(d)) from public.event_documents d where d.event_id=e.id and d.include_in_setup),'[]'::jsonb),
  'locations',coalesce((select jsonb_agg(to_jsonb(l)) from public.locations l where l.event_id=e.id),'[]'::jsonb),
  'posts',coalesce((select jsonb_agg(to_jsonb(p)) from public.posts p where p.event_id=e.id),'[]'::jsonb),
  'requirements',coalesce((select jsonb_agg(to_jsonb(r)) from public.post_requirements r join public.posts p on p.id=r.post_id where p.event_id=e.id),'[]'::jsonb),
  'windows',coalesce((select jsonb_agg(to_jsonb(w)) from public.post_operating_windows w where w.event_id=e.id),'[]'::jsonb),
  'procedures',coalesce((select jsonb_agg(to_jsonb(p)) from public.event_procedures p where p.event_id=e.id),'[]'::jsonb),
  'answers',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.setup_answers a where a.event_id=e.id),'[]'::jsonb));
end; $$;
create or replace function public.setup_source_valid(p_event_id uuid,p_source jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select case p_source->>'sourceType'
  when 'description' then p_source->>'sourceId'=p_event_id::text and exists(select 1 from public.event_setup_sessions where event_id=p_event_id)
  when 'document' then exists(select 1 from public.event_documents where event_id=p_event_id and id::text=p_source->>'sourceId')
    or exists(select 1 from public.event_maps where event_id=p_event_id and id::text=p_source->>'sourceId')
  when 'answer' then exists(select 1 from public.setup_answers where event_id=p_event_id and id::text=p_source->>'sourceId')
  when 'manual' then p_source->>'sourceId' is null
  when 'inference' then p_source->>'sourceId' is null else false end;
$$;
create or replace function public.invalidate_setup_map_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.storage_path=old.storage_path then return new;end if;
 update public.events set setup_revision=setup_revision+1,model_status='needs_review',verified_at=null,verified_by=null,verified_revision=null where id=new.event_id;
 update public.setup_entity_reviews set status='needs_review',confirmed_by=null,confirmed_at=null where event_id=new.event_id;
 return new;
end; $$;
drop trigger if exists setup_map_source_changed on public.event_maps;
create trigger setup_map_source_changed after insert or update of storage_path on public.event_maps
 for each row execute function public.invalidate_setup_map_source();

-- Recover interrupted extraction even when no coordinator has the app open.
create or replace function public.recover_setup_jobs() returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.setup_ai_jobs set status='failed',error_message='Analysis was interrupted. Your inputs and map are saved; retry this analysis.',updated_at=now()
 where status in ('queued','running') and updated_at<now()-interval '5 minutes';
 update public.event_documents d set processing_status='failed',processing_error='Analysis was interrupted. Original document retained.'
 where processing_status='processing'
 and exists(select 1 from public.setup_ai_jobs j where j.event_id=d.event_id and j.status='failed')
 and not exists(select 1 from public.setup_ai_jobs j where j.event_id=d.event_id and j.status in ('queued','running'));
end; $$;
revoke all on function public.invalidate_setup_map_source(),public.recover_setup_jobs() from public,anon,authenticated;
grant execute on function public.recover_setup_jobs() to service_role;
do $$ begin
 if to_regnamespace('cron') is not null then
  perform cron.schedule('ground-control-setup-recovery','* * * * *','select public.recover_setup_jobs()');
 end if;
end; $$;
commit;
