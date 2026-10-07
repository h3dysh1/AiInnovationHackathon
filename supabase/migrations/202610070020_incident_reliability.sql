begin;

alter table public.incidents add column if not exists transcript text;
alter table public.incidents
  add column if not exists request_id uuid,
  add column if not exists processing_status text not null default 'queued'
    check(processing_status in ('queued','processing','complete','failed')),
  add column if not exists processing_attempt integer not null default 0,
  add column if not exists processing_failures integer not null default 0,
  add column if not exists processing_error text,
  add column if not exists processing_lease_until timestamptz,
  add column if not exists processing_next_at timestamptz not null default now();
create unique index if not exists incident_request_id on public.incidents(reporter_id,request_id)
  where request_id is not null;
create index if not exists incident_processing_queue on public.incidents(processing_next_at)
  where processing_status in ('queued','failed','processing');

create table if not exists public.incident_processing_history(
  incident_id uuid not null references public.incidents(id),
  attempt integer not null,
  outcome text not null check(outcome in ('complete','failed','interrupted')),
  transcript text,
  analysis jsonb,
  error text,
  created_at timestamptz not null default now(),
  primary key(incident_id,attempt)
);
alter table public.incident_processing_history enable row level security;
revoke all on public.incident_processing_history from public,anon,authenticated;
grant select on public.incident_processing_history to authenticated;
drop policy if exists "Incident processing history participants read" on public.incident_processing_history;
create policy "Incident processing history participants read" on public.incident_processing_history
  for select to authenticated using(exists(select 1 from public.incidents i
    where i.id=incident_id and (i.reporter_id=auth.uid() or public.is_event_manager(i.event_id))));

-- Single-use, short-lived permission to wake the queue, never to choose a person
-- or write incident analysis. No reusable credential enters pg_net's tables.
create table if not exists public.incident_worker_wakeups(
  id uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null default now()+interval '2 minutes'
);
alter table public.incident_worker_wakeups enable row level security;
revoke all on public.incident_worker_wakeups from public,anon,authenticated;
create or replace function public.consume_incident_wakeup(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
  delete from public.incident_worker_wakeups where id=p_id and expires_at>now() returning id into v_id;
  return v_id is not null;
end; $$;
revoke all on function public.consume_incident_wakeup(uuid) from public,anon,authenticated;
grant execute on function public.consume_incident_wakeup(uuid) to service_role;

-- Replaced by the scheduling migration. The queue itself requires no network extensions.
create or replace function public.wake_incident_worker()
returns void language plpgsql security definer set search_path='' as $$
begin null; end; $$;
revoke all on function public.wake_incident_worker() from public,anon,authenticated;

create or replace function public.incident_received()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail)
    values(new.event_id,new.id,new.reporter_id,'incident_received','Original report saved; processing queued');
  -- A webhook/configuration outage must not roll back receipt of the original report.
  begin perform public.wake_incident_worker(); exception when others then null; end;
  return new;
end; $$;
revoke all on function public.incident_received() from public,anon,authenticated;
drop trigger if exists incident_received on public.incidents;
create trigger incident_received after insert on public.incidents
  for each row execute function public.incident_received();

-- Old callers remain supported; new clients retain a request ID until receipt is confirmed.
drop function if exists public.report_incident(uuid,text,uuid);
create or replace function public.report_incident(
  p_event_id uuid,p_raw_report text,p_assignment_id uuid default null,p_request_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_incident public.incidents;
begin
  if not public.is_event_member(p_event_id) then raise exception 'Join this event before reporting'; end if;
  if p_raw_report is null or char_length(trim(p_raw_report)) not between 1 and 4000 then raise exception 'Describe what happened (up to 4000 characters)'; end if;
  if p_assignment_id is not null and not exists(select 1 from public.assignments a
    join public.rosters r on r.id=a.roster_id where a.id=p_assignment_id and a.user_id=auth.uid() and r.event_id=p_event_id)
    then raise exception 'Assignment unavailable'; end if;
  insert into public.incidents(event_id,reporter_id,assignment_id,raw_report,status,request_id)
    values(p_event_id,auth.uid(),p_assignment_id,trim(p_raw_report),'received',p_request_id)
    on conflict(reporter_id,request_id) where request_id is not null do nothing
    returning * into v_incident;
  if v_incident.id is null then
    select * into v_incident from public.incidents where reporter_id=auth.uid() and request_id=p_request_id;
    if v_incident.event_id<>p_event_id or v_incident.raw_report<>trim(p_raw_report)
      or v_incident.assignment_id is distinct from p_assignment_id or v_incident.audio_path is not null
      then raise exception 'This report was already received with different details. Start a new report'; end if;
  end if;
  return to_jsonb(v_incident);
end; $$;

drop function if exists public.report_voice_incident(uuid,text,text,integer,uuid);
create or replace function public.report_voice_incident(
  p_event_id uuid,p_audio_path text,p_audio_mime_type text,p_audio_size_bytes integer,
  p_assignment_id uuid default null,p_written_context text default '',p_request_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_incident public.incidents; v_report text:=coalesce(nullif(trim(p_written_context),''),'Voice report attached.');
begin
  if not public.is_event_member(p_event_id) then raise exception 'Join this event before reporting'; end if;
  if char_length(v_report)>4000 then raise exception 'Keep written context under 4000 characters'; end if;
  if p_audio_path is null or p_audio_path<>auth.uid()::text||'/'||p_event_id::text||'/'||split_part(p_audio_path,'/',3)
    or split_part(p_audio_path,'/',3)!~'^[0-9a-f-]{36}\.(m4a|mp4|webm)$'
    or p_audio_mime_type is null or p_audio_mime_type not in ('audio/mp4','audio/x-m4a','audio/m4a','audio/webm')
    or p_audio_size_bytes is null or p_audio_size_bytes not between 1 and 10485760
    then raise exception 'Invalid incident audio'; end if;
  if p_assignment_id is not null and not exists(select 1 from public.assignments a
    join public.rosters r on r.id=a.roster_id where a.id=p_assignment_id and a.user_id=auth.uid() and r.event_id=p_event_id)
    then raise exception 'Assignment unavailable'; end if;
  if not exists(select 1 from storage.objects where bucket_id='incident-audio' and name=p_audio_path)
    then raise exception 'Upload the voice recording before sending'; end if;
  insert into public.incidents(event_id,reporter_id,assignment_id,raw_report,status,
    audio_path,audio_mime_type,audio_size_bytes,request_id)
    values(p_event_id,auth.uid(),p_assignment_id,v_report,'received',p_audio_path,p_audio_mime_type,p_audio_size_bytes,p_request_id)
    on conflict(reporter_id,request_id) where request_id is not null do nothing returning * into v_incident;
  if v_incident.id is null then
    select * into v_incident from public.incidents where reporter_id=auth.uid() and request_id=p_request_id;
    if v_incident.event_id<>p_event_id or v_incident.raw_report<>v_report
      or v_incident.assignment_id is distinct from p_assignment_id or v_incident.audio_path is distinct from p_audio_path
      or v_incident.audio_mime_type is distinct from p_audio_mime_type or v_incident.audio_size_bytes is distinct from p_audio_size_bytes
      then raise exception 'This report was already received with different details. Start a new report'; end if;
  end if;
  return to_jsonb(v_incident);
end; $$;

create or replace function public.analyze_incident(p_incident_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.incidents; txt text; cat text; sev text; v_summary text; loc uuid; v_confidence numeric;
begin
  select * into i from public.incidents where id=p_incident_id;
  if i.id is null or (not public.is_event_manager(i.event_id) and auth.role()<>'service_role') then raise exception 'Incident unavailable'; end if;
  txt:=lower(concat_ws(' ', nullif(i.transcript,''), nullif(i.raw_report,'Voice report attached.')));
  cat:=case when txt like '%heat%' or txt like '%dizz%' or txt like '%faint%' then 'heat'
    when txt like '%lost child%' or txt like '%missing child%' then 'lost_child'
    when txt like '%crowd%' or txt like '%queue%' then 'crowding'
    when txt like '%injur%' or txt like '%bleed%' or txt like '%medical%' then 'medical'
    when txt like '%fire%' or txt like '%security%' or txt like '%fight%' then 'security'
    when txt like '%storm%' or txt like '%weather%' then 'weather' else 'other' end;
  sev:=case when txt like '%unconscious%' or txt like '%fire%' or txt like '%danger%' then 'critical'
    when txt like '%injur%' or txt like '%faint%' or txt like '%lost child%' then 'high'
    when txt like '%dizz%' or txt like '%crowd%' then 'medium' else 'low' end;
  select l.id into loc from public.locations l where l.event_id=i.event_id
    and (txt like '%'||lower(l.name)||'%' or exists(select 1 from public.posts p where p.location_id=l.id and txt like '%'||lower(p.name)||'%'))
    order by length(l.name) desc limit 1;
  v_summary:=left(regexp_replace(trim(concat_ws(' ',nullif(i.transcript,''),nullif(i.raw_report,'Voice report attached.'))),'\s+',' ','g'),240);
  v_confidence:=case when loc is not null then .85 else .65 end;
  update public.incidents set category=cat,severity=sev,summary=v_summary,location_id=loc,
    people_affected=case when txt like '%two %' or txt like '%2 %' then 2 else 1 end,
    confidence=v_confidence,status=case when status='resolved' then 'resolved' else 'needs_review' end,analyzed_at=now(),updated_at=now() where id=i.id;
  insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail)
    values(i.event_id,i.id,auth.uid(),'incident_analyzed',cat||' incident classified as '||sev);
  return (select to_jsonb(x) from public.incidents x where x.id=i.id);
end; $$;

create or replace function public.correlate_incident(p_incident_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.incidents; x public.incidents; relation text; n integer:=0;
begin
  select * into i from public.incidents where id=p_incident_id;
  if i.id is null or (not public.is_event_manager(i.event_id) and auth.role()<>'service_role') then raise exception 'Incident unavailable'; end if;
  for x in select * from public.incidents where event_id=i.event_id and id<>i.id
    and created_at>now()-interval '2 hours' and status<>'resolved' loop
    if i.location_id is not null and i.location_id=x.location_id then relation:='same_area';
    elsif i.category is not null and i.category=x.category then relation:='related';
    else continue; end if;
    insert into public.incident_relations(incident_id,related_incident_id,relation_type,confidence)
      values(i.id,x.id,relation,case when relation='same_area' then .9 else .7 end)
      on conflict do nothing;
    n:=n+1;
  end loop;
  return jsonb_build_object('related',n);
end; $$;

create or replace function public.detect_risk(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare count_heat integer; rid uuid;
begin
  if not public.is_event_manager(p_event_id) and auth.role()<>'service_role' then raise exception 'You cannot review risk'; end if;
  perform 1 from public.events where id=p_event_id for update;
  select count(*) into count_heat from public.incidents
    where event_id=p_event_id and category='heat' and created_at>now()-interval '30 minutes' and status<>'resolved';
  if count_heat>=2 then
    select id into rid from public.risk_alerts where event_id=p_event_id and title='Emerging heat risk' and status='open' order by created_at desc limit 1;
    if rid is not null then return (select to_jsonb(r) from public.risk_alerts r where r.id=rid); end if;
    insert into public.risk_alerts(event_id,title,explanation,severity,evidence)
      values(p_event_id,'Emerging heat risk',count_heat||' heat-related reports in the last 30 minutes. Review staffing and water access.',case when count_heat>=4 then 'high' else 'medium' end,
        (select coalesce(jsonb_agg(id),'[]') from public.incidents where event_id=p_event_id and category='heat' and created_at>now()-interval '30 minutes' and status<>'resolved'))
      returning id into rid;
    insert into public.operational_timeline(event_id,event_type,detail) values(p_event_id,'risk_detected','Emerging heat risk detected from recent incident reports');
  end if;
  return coalesce((select to_jsonb(r) from public.risk_alerts r where r.id=rid),'{}');
end; $$;

-- Until the reviewed-candidate engine exists, the old arbitrary LIMIT 1 dispatch
-- must not become executable merely because its SQL alias defect is repaired.
create or replace function public.approve_response(p_response_id uuid,p_instruction text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_response public.response_plans;
begin
  select * into v_response from public.response_plans where id=p_response_id for update;
  if v_response.id is null or not public.is_event_manager(v_response.event_id) then raise exception 'Response unavailable'; end if;
  if v_response.status in ('approved','completed') then return to_jsonb(v_response); end if;
  raise exception 'A reviewed volunteer selection and coverage check are required before dispatch. Contact the crew using your event procedures';
end; $$;

create or replace function public.claim_incident_processing(p_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_incident public.incidents;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
  select * into v_incident from public.incidents
    where (p_id is null or id=p_id) and status<>'resolved' and processing_failures<3
    and ((processing_status in ('queued','failed') and processing_next_at<=now())
      or (processing_status='processing' and processing_lease_until<now()))
    order by processing_next_at,created_at for update skip locked limit 1;
  if v_incident.id is null then return null; end if;
  if v_incident.processing_status='processing' then
    insert into public.incident_processing_history(incident_id,attempt,outcome,error)
      values(v_incident.id,v_incident.processing_attempt,'interrupted','Processing lease expired; original retained')
      on conflict do nothing;
    v_incident.processing_failures:=v_incident.processing_failures+1;
    if v_incident.processing_failures>=3 then
      update public.incidents set processing_status='failed',processing_failures=3,
        processing_error='Processing repeatedly interrupted. Retry when the service is available.',processing_lease_until=null
        where id=v_incident.id;
      return null;
    end if;
  end if;
  update public.incidents set processing_status='processing',processing_attempt=processing_attempt+1,
    processing_failures=v_incident.processing_failures,processing_error=null,
    processing_lease_until=now()+interval '3 minutes',updated_at=now()
    where id=v_incident.id returning * into v_incident;
  return to_jsonb(v_incident);
end; $$;

create or replace function public.finish_incident_processing(
  p_id uuid,p_attempt integer,p_transcript text default null,p_error text default null
)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_incident public.incidents; v_failure text:=p_error; v_analysis jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
  select * into v_incident from public.incidents where id=p_id for update;
  if v_incident.id is null or v_incident.processing_attempt<>p_attempt
    or v_incident.processing_status<>'processing' then return false; end if;
  if p_transcript is not null and char_length(trim(p_transcript)) not between 1 and 4000 then
    v_failure:='Invalid transcription; original recording retained';
    p_transcript:=null;
  end if;
  if p_transcript is not null then
    update public.incidents set transcript=trim(p_transcript) where id=p_id;
  end if;
  if v_failure is null and v_incident.status<>'resolved' then
    begin
      v_analysis:=public.analyze_incident(p_id);
      perform public.correlate_incident(p_id);
      perform public.detect_risk(v_incident.event_id);
    exception when others then v_failure:='Incident processing failed. Original report retained; retry is available.'; end;
  end if;
  update public.incidents set
    processing_status=case when v_failure is null then 'complete' else 'failed' end,
    processing_error=left(v_failure,1000),processing_lease_until=null,
    processing_failures=case when v_failure is null then 0 else processing_failures+1 end,
    processing_next_at=now()+interval '1 minute'*power(2,least(processing_failures,3)),updated_at=now()
    where id=p_id;
  insert into public.incident_processing_history(incident_id,attempt,outcome,transcript,analysis,error)
    values(p_id,p_attempt,case when v_failure is null then 'complete' else 'failed' end,
      p_transcript,v_analysis,left(v_failure,1000)) on conflict do nothing;
  insert into public.operational_timeline(event_id,incident_id,event_type,detail)
    values(v_incident.event_id,p_id,case when v_failure is null then 'incident_processing_complete' else 'incident_processing_failed' end,
      case when v_failure is null then 'Processing completed; interpretation needs coordinator review'
        else 'Processing failed; original report retained' end);
  return true;
end; $$;

create or replace function public.retry_incident_processing(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_incident public.incidents;
begin
  select * into v_incident from public.incidents where id=p_id for update;
  if v_incident.id is null or (v_incident.reporter_id is distinct from auth.uid()
    and not public.is_event_manager(v_incident.event_id)) then raise exception 'Incident unavailable'; end if;
  if v_incident.status='resolved' then raise exception 'This incident is resolved'; end if;
  if v_incident.processing_status='processing' and v_incident.processing_lease_until>now() then return to_jsonb(v_incident); end if;
  if v_incident.processing_status='processing' then
    insert into public.incident_processing_history(incident_id,attempt,outcome,error)
      values(p_id,v_incident.processing_attempt,'interrupted','Processing interrupted; retry requested') on conflict do nothing;
  end if;
  update public.incidents set processing_status='queued',processing_failures=0,
    processing_error=null,processing_next_at=now(),processing_lease_until=null,updated_at=now()
    where id=p_id returning * into v_incident;
  insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail)
    values(v_incident.event_id,p_id,auth.uid(),'incident_processing_requested','Processing requested; original retained');
  begin perform public.wake_incident_worker(); exception when others then null; end;
  return to_jsonb(v_incident);
end; $$;

revoke all on function public.report_incident(uuid,text,uuid,uuid),
  public.report_voice_incident(uuid,text,text,integer,uuid,text,uuid),
  public.retry_incident_processing(uuid),public.claim_incident_processing(uuid),
  public.finish_incident_processing(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.report_incident(uuid,text,uuid,uuid),
  public.report_voice_incident(uuid,text,text,integer,uuid,text,uuid),public.retry_incident_processing(uuid) to authenticated;
grant execute on function public.claim_incident_processing(uuid),
  public.finish_incident_processing(uuid,integer,text,text),public.analyze_incident(uuid),
  public.correlate_incident(uuid),public.detect_risk(uuid) to service_role;

commit;
