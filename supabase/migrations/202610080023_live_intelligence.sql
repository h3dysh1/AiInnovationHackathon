begin;
alter table public.incidents add column if not exists ai_evidence text, add column if not exists ai_model text;
alter table public.incident_relations add column if not exists explanation text;
alter table public.risk_alerts add column if not exists risk_key text,add column if not exists location_id uuid references public.locations(id),
 add column if not exists confidence numeric,add column if not exists updated_at timestamptz not null default now();
create unique index if not exists active_risk_key on public.risk_alerts(event_id,risk_key) where status='open' and risk_key is not null;
create table if not exists public.event_observations(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id),location_id uuid references public.locations(id),
 kind text not null check(kind in ('temperature','crowd','water','infrastructure','weather','other')),value text not null check(char_length(value) between 1 and 500),
 observed_at timestamptz not null default now(),reported_by uuid not null references auth.users(id));
alter table public.event_observations enable row level security;
revoke all on public.event_observations from public,anon,authenticated;
grant select on public.event_observations to authenticated;
drop policy if exists "Managers read observations" on public.event_observations;
create policy "Managers read observations" on public.event_observations for select to authenticated using(public.is_event_manager(event_id));
create or replace function public.record_event_observation(p_event_id uuid,p_location_id uuid,p_kind text,p_value text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable'; end if;
 if p_location_id is not null and not exists(select 1 from public.locations where id=p_location_id and event_id=p_event_id) then raise exception 'Location unavailable'; end if;
 insert into public.event_observations(event_id,location_id,kind,value,reported_by) values(p_event_id,p_location_id,p_kind,trim(p_value),auth.uid());
 perform public.request_event_intelligence(p_event_id);
end; $$;

create or replace function public.incident_intelligence_context(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.incidents;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 select * into i from public.incidents where id=p_id;
 if i.id is null then raise exception 'Incident unavailable'; end if;
 return jsonb_build_object('incident',to_jsonb(i),
 'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'posts',coalesce((select jsonb_agg(p.name) from public.posts p where p.location_id=l.id),'[]'))) from (select * from public.locations where event_id=i.event_id order by id limit 100) l),'[]'),
 'recent',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,raw_report,transcript,summary,category,location_id,created_at from public.incidents where event_id=i.event_id and id<>i.id and status<>'resolved' and created_at>now()-interval '2 hours' order by created_at desc limit 20) x),'[]'),
 'observations',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,location_id,kind,value,observed_at from public.event_observations where event_id=i.event_id and observed_at>now()-interval '2 hours' order by observed_at desc limit 20) x),'[]'),
 'coverage',public.live_coverage(i.event_id));
end; $$;

create or replace function public.persist_incident_ai(
 p_id uuid,p_attempt integer,p_transcript text,p_analysis jsonb,p_relations jsonb,p_risks jsonb,p_error text,p_model text
) returns boolean language plpgsql security definer set search_path='' as $$
declare i public.incidents;a jsonb:=p_analysis;x jsonb;v_failure text:=p_error;loc uuid;rid uuid;k text;refs jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 select * into i from public.incidents where id=p_id for no key update;
 if i.id is null or i.processing_attempt<>p_attempt or i.processing_status<>'processing' then return false; end if;
 if p_transcript is not null then
  if char_length(trim(p_transcript)) not between 1 and 4000 then v_failure:='Invalid transcription; original retained';
  else update public.incidents set transcript=trim(p_transcript) where id=p_id; end if;
 end if;
 if a is not null and i.status<>'resolved' then
 begin
  if a is null or not (a ?& array['category','severity','summary','confidence','evidence','needsReview','locationId','peopleAffected']) or jsonb_typeof(a)<>'object' or a->>'category' not in ('medical','heat','crowding','lost_child','security','infrastructure','weather','other')
   or a->>'category' is null or a->>'severity' is null or a->>'summary' is null or a->>'evidence' is null or a->>'confidence' is null or a->>'severity' not in ('low','medium','high','critical') or char_length(a->>'summary') not between 1 and 1000
   or char_length(a->>'evidence') not between 1 and 1200 or (a->>'confidence')::numeric not between 0 and 1
   or jsonb_typeof(a->'needsReview')<>'boolean' then raise exception 'Invalid incident analysis'; end if;
  loc:=(a->>'locationId')::uuid;
  if loc is not null and not exists(select 1 from public.locations where id=loc and event_id=i.event_id) then raise exception 'Unknown AI location'; end if;
  if a->>'peopleAffected' is not null and ((a->>'peopleAffected')::integer not between 0 and 10000) then raise exception 'Invalid affected count'; end if;
  update public.incidents set category=a->>'category',severity=a->>'severity',summary=a->>'summary',location_id=loc,
   people_affected=(a->>'peopleAffected')::integer,confidence=(a->>'confidence')::numeric,ai_evidence=a->>'evidence',ai_model=left(p_model,160),
   status=case when (a->>'needsReview')::boolean or (a->>'confidence')::numeric<.8 or loc is null then 'needs_review' else 'open' end,
   analyzed_at=now(),updated_at=now() where id=p_id;
  if jsonb_typeof(p_relations)<>'array' or jsonb_array_length(p_relations)>20 or jsonb_typeof(p_risks)<>'array' or jsonb_array_length(p_risks)>5 then raise exception 'Invalid intelligence output'; end if;
  for x in select value from jsonb_array_elements(p_relations) loop
   if not exists(select 1 from public.incidents where id=(x->>'relatedIncidentId')::uuid and event_id=i.event_id and id<>i.id and status<>'resolved' and created_at>now()-interval '2 hours')
    or x->>'relationType' not in ('possible_duplicate','related','same_area','possible_escalation') or (x->>'confidence')::numeric not between 0 and 1 then raise exception 'Unknown related evidence'; end if;
   insert into public.incident_relations(incident_id,related_incident_id,relation_type,confidence,explanation)
    values(i.id,(x->>'relatedIncidentId')::uuid,x->>'relationType',(x->>'confidence')::numeric,left(x->>'explanation',800))
    on conflict(incident_id,related_incident_id,relation_type) do update set confidence=excluded.confidence,explanation=excluded.explanation;
  end loop;
  -- Serialize risk updates per event and validate every cited signal against it.
  perform 1 from public.events where id=i.event_id for update;
  for x in select value from jsonb_array_elements(p_risks) loop
   if x->>'kind' not in ('medical','heat','crowding','lost_child','security','infrastructure','weather','other') or x->>'severity' not in ('low','medium','high','critical')
    or (x->>'confidence')::numeric not between 0 and 1 then raise exception 'Invalid risk'; end if;
   loc:=(x->>'locationId')::uuid;
   if loc is not null and not exists(select 1 from public.locations where id=loc and event_id=i.event_id) then raise exception 'Unknown risk location'; end if;
   if jsonb_array_length(x->'incidentIds')+jsonb_array_length(x->'observationIds')+jsonb_array_length(x->'shiftIds')<2 then raise exception 'Insufficient risk evidence'; end if;
   if exists(select 1 from jsonb_array_elements_text(x->'incidentIds') ref(value) where not exists(select 1 from public.incidents z where z.id=ref.value::uuid and z.event_id=i.event_id and z.status<>'resolved' and z.created_at>now()-interval '2 hours'))
    or exists(select 1 from jsonb_array_elements_text(x->'observationIds') ref(value) where not exists(select 1 from public.event_observations z where z.id=ref.value::uuid and z.event_id=i.event_id and z.observed_at>now()-interval '2 hours'))
    or exists(select 1 from jsonb_array_elements_text(x->'shiftIds') ref(value) where not exists(select 1 from public.shifts z join public.rosters r on r.id=z.roster_id where z.id=ref.value::uuid and z.event_id=i.event_id and r.status='published' and z.starts_at<=now() and z.ends_at>now())) then raise exception 'Unknown risk evidence'; end if;
   k:=(x->>'kind')||':'||coalesce(loc::text,'event');
   refs:=jsonb_build_object('incidentIds',x->'incidentIds','observationIds',x->'observationIds','shiftIds',x->'shiftIds');
   if exists(select 1 from public.risk_alerts where event_id=i.event_id and risk_key=k and status in ('dismissed','resolved') and evidence @> refs) then continue; end if;
   insert into public.risk_alerts(event_id,risk_key,location_id,title,explanation,severity,confidence,evidence)
    values(i.event_id,k,loc,left(x->>'title',160),left(x->>'explanation',1500),x->>'severity',(x->>'confidence')::numeric,refs)
    on conflict(event_id,risk_key) where status='open' and risk_key is not null
    do update set title=excluded.title,explanation=excluded.explanation,severity=excluded.severity,confidence=excluded.confidence,evidence=excluded.evidence,updated_at=now()
    returning id into rid;
  end loop;
 exception when others then v_failure:='Intelligence could not be validated against the event. Original report retained; retry or review manually.'; end;
 end if;
 update public.incidents set processing_status=case when v_failure is null then 'complete' else 'failed' end,
  processing_error=left(v_failure,1000),processing_lease_until=null,processing_failures=case when v_failure is null then 0 else processing_failures+1 end,
  processing_next_at=now()+interval '1 minute'*power(2,least(processing_failures,3)),updated_at=now() where id=p_id;
 insert into public.incident_processing_history(incident_id,attempt,outcome,transcript,analysis,error)
  values(p_id,p_attempt,case when v_failure is null then 'complete' else 'failed' end,p_transcript,
   jsonb_build_object('interpretation',p_analysis,'relations',p_relations,'risks',p_risks,'model',p_model),left(v_failure,1000)) on conflict do nothing;
 insert into public.operational_timeline(event_id,incident_id,event_type,detail) values(i.event_id,p_id,
  case when v_failure is null then 'intelligence_completed' else 'intelligence_failed' end,
  case when v_failure is null then 'AI interpretation, relationships and evidence-backed risks updated' else 'AI failed; original report retained' end);
 return true;
end; $$;

create or replace function public.request_event_intelligence(p_event_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare iid uuid;
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable'; end if;
 select id into iid from public.incidents where event_id=p_event_id and status<>'resolved' order by created_at desc limit 1;
 if iid is not null then perform public.retry_incident_processing(iid); end if;
end; $$;
create or replace function public.review_incident(p_id uuid,p_category text,p_severity text,p_location_id uuid,p_summary text)
returns void language plpgsql security definer set search_path='' as $$
declare i public.incidents;
begin
 select * into i from public.incidents where id=p_id for no key update;
 if i.id is null or not public.is_event_manager(i.event_id) or i.status='resolved' then raise exception 'Incident unavailable'; end if;
 if p_category not in ('medical','heat','crowding','lost_child','security','infrastructure','weather','other') or p_severity not in ('low','medium','high','critical')
  or char_length(trim(p_summary)) not between 1 and 1000 then raise exception 'Invalid review'; end if;
 if p_location_id is not null and not exists(select 1 from public.locations where id=p_location_id and event_id=i.event_id) then raise exception 'Location unavailable'; end if;
 update public.incidents set category=p_category,severity=p_severity,location_id=p_location_id,summary=trim(p_summary),status='open',updated_at=now(),
  processing_status='complete',processing_lease_until=null,processing_error=null where id=p_id;
 insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail) values(i.event_id,p_id,auth.uid(),'incident_reviewed',trim(p_summary));
end; $$;
create or replace function public.set_risk_status(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 select event_id into eid from public.risk_alerts where id=p_id;
 if eid is null or not public.is_event_manager(eid) or p_status not in ('open','dismissed','resolved') then raise exception 'Risk unavailable'; end if;
 update public.risk_alerts set status=p_status,resolved_at=case when p_status='resolved' then now() end,updated_at=now() where id=p_id;
 insert into public.operational_timeline(event_id,actor_id,event_type,detail) values(eid,auth.uid(),'risk_reviewed','Risk marked '||p_status);
end; $$;
revoke all on function public.incident_intelligence_context(uuid),public.persist_incident_ai(uuid,integer,text,jsonb,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.incident_intelligence_context(uuid),public.persist_incident_ai(uuid,integer,text,jsonb,jsonb,jsonb,text,text) to service_role;
revoke all on function public.request_event_intelligence(uuid),public.record_event_observation(uuid,uuid,text,text),public.review_incident(uuid,text,text,uuid,text),public.set_risk_status(uuid,text) from public,anon;
grant execute on function public.request_event_intelligence(uuid),public.record_event_observation(uuid,uuid,text,text),public.review_incident(uuid,text,text,uuid,text),public.set_risk_status(uuid,text) to authenticated;
commit;
