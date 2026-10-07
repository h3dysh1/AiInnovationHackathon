begin;
-- Each narrow AI call has its own durable lease/retry. Slow providers cannot erase completed stages.
alter table public.incidents add column if not exists intelligence_stage text not null default 'interpret' check(intelligence_stage in ('interpret','correlate','risk')),
 add column if not exists validated_analysis jsonb;
alter table public.response_plans add column if not exists planning_stage text not null default 'retrieve' check(planning_stage in ('retrieve','draft'));
create or replace function public.advance_incident_intelligence(p_id uuid,p_attempt integer,p_transcript text,p_analysis jsonb,p_relations jsonb,p_risks jsonb,p_error text,p_model text)
returns boolean language plpgsql security definer set search_path='' as $$
declare stage text;accepted boolean;state text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only';end if;
 select intelligence_stage into stage from public.incidents where id=p_id for update;
 accepted:=public.persist_incident_ai(p_id,p_attempt,p_transcript,p_analysis,p_relations,p_risks,p_error,p_model);
 if not accepted then return false;end if;
 select processing_status into state from public.incidents where id=p_id;
 if state='complete' and stage<>'risk' then
  update public.incidents set intelligence_stage=case when stage='interpret' then 'correlate' else 'risk' end,validated_analysis=p_analysis,processing_status='queued',processing_next_at=now() where id=p_id;
  begin perform public.wake_incident_worker();exception when others then null;end;
 elsif state='complete' then update public.incidents set validated_analysis=p_analysis where id=p_id;
 end if;
 return true;
end; $$;
create or replace function public.finish_response_retrieval(p_id uuid,p_attempt integer,p_ids jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.response_plans;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only';end if;
 select * into r from public.response_plans where id=p_id for update;
 if r.id is null or r.status<>'proposed' or r.processing_status<>'processing' or r.processing_attempt<>p_attempt then return false;end if;
 if jsonb_typeof(p_ids) is distinct from 'array' or jsonb_array_length(p_ids) not between 1 and 6 or exists(select 1 from jsonb_array_elements_text(p_ids) ref where not exists(select 1 from public.event_procedures where event_id=r.event_id and id=ref::uuid)) then raise exception 'Unknown event procedure';end if;
 update public.response_plans set procedure_ids=p_ids,planning_stage='draft',processing_status='queued',processing_failures=0,lease_until=null,next_attempt_at=now() where id=p_id;
 begin perform public.wake_incident_worker();exception when others then null;end;
 return true;
end; $$;
-- AI retries start from the current saved stage; a human correction cancels the lease.
revoke all on function public.advance_incident_intelligence(uuid,integer,text,jsonb,jsonb,jsonb,text,text),public.finish_response_retrieval(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.advance_incident_intelligence(uuid,integer,text,jsonb,jsonb,jsonb,text,text),public.finish_response_retrieval(uuid,integer,jsonb) to service_role;
-- Preserve human corrections when a later risk refresh resumes.
create or replace function public.review_incident(p_id uuid,p_category text,p_severity text,p_location_id uuid,p_summary text)
returns void language plpgsql security definer set search_path='' as $$
declare i public.incidents;
begin
 select * into i from public.incidents where id=p_id for update;
 if i.id is null or not public.is_event_manager(i.event_id) or i.status='resolved' then raise exception 'Incident unavailable';end if;
 if p_category is null or p_category not in ('medical','heat','crowding','lost_child','security','infrastructure','weather','other') or p_severity is null or p_severity not in ('low','medium','high','critical') or p_summary is null or char_length(trim(p_summary)) not between 1 and 1000 then raise exception 'Invalid review';end if;
 if p_location_id is not null and not exists(select 1 from public.locations where id=p_location_id and event_id=i.event_id) then raise exception 'Location unavailable';end if;
 update public.incidents set category=p_category,severity=p_severity,location_id=p_location_id,summary=trim(p_summary),status='open',confidence=1,updated_at=now(),
 processing_status='complete',processing_lease_until=null,processing_error=null,intelligence_stage='risk',
 validated_analysis=jsonb_build_object('category',p_category,'severity',p_severity,'locationId',p_location_id,'summary',trim(p_summary),'confidence',1,'peopleAffected',i.people_affected,'evidence','Coordinator reviewed the interpretation; original AI evidence retained in processing history.','needsReview',false) where id=p_id;
 insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail) values(i.event_id,p_id,auth.uid(),'incident_reviewed',trim(p_summary));
end; $$;
commit;
