begin;

-- Drafting may start automatically after supported intelligence is persisted, but
-- approval, volunteer selection and dispatch remain coordinator actions.
create or replace function public.queue_incident_response(p_incident_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  i public.incidents;
  existing uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
  select * into i from public.incidents where id=p_incident_id;
  if i.id is null or i.status='resolved' then return; end if;
  select id into existing from public.response_plans
  where incident_id=i.id and status not in ('dismissed','completed')
  order by created_at desc limit 1;
  if existing is not null then return; end if;
  insert into public.response_plans(
    event_id,incident_id,title,rationale,actions,resources,processing_status,planning_stage
  ) values (
    i.event_id,i.id,'Response awaiting analysis',
    'Incident intelligence is complete. The coordinator reviews the grounded draft before any crew move.',
    '[]','[]','queued','retrieve'
  );
  insert into public.operational_timeline(event_id,incident_id,event_type,detail)
  values(i.event_id,i.id,'response_requested','Incident intelligence completed; response drafting queued');
  begin perform public.wake_incident_worker(); exception when others then null; end;
end;
$$;

create or replace function public.auto_response_on_risk()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare existing uuid;
begin
  if new.status<>'open' or auth.role() is distinct from 'service_role' then return new; end if;
  select id into existing from public.response_plans
  where risk_alert_id=new.id and status not in ('dismissed','completed')
  order by created_at desc limit 1;
  if existing is null then
    insert into public.response_plans(
      event_id,risk_alert_id,title,rationale,actions,resources,processing_status,planning_stage
    ) values (
      new.event_id,new.id,'Response awaiting analysis',
      'An evidence-backed risk was identified. The coordinator reviews the grounded draft before any crew move.',
      '[]','[]','queued','retrieve'
    );
    insert into public.operational_timeline(event_id,event_type,detail)
    values(new.event_id,'response_requested','Risk detection completed; response drafting queued');
    begin perform public.wake_incident_worker(); exception when others then null; end;
  end if;
  return new;
end;
$$;

create or replace function public.auto_response_on_incident()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.processing_status='complete'
    and new.intelligence_stage='risk'
    and new.status<>'resolved'
    and auth.role() = 'service_role' then
    perform public.queue_incident_response(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists auto_response_incident on public.incidents;
create trigger auto_response_incident
after update of processing_status, intelligence_stage, status on public.incidents
for each row execute function public.auto_response_on_incident();

drop trigger if exists auto_response_risk on public.risk_alerts;
create trigger auto_response_risk
after insert or update of status,updated_at on public.risk_alerts
for each row execute function public.auto_response_on_risk();

create or replace function public.request_push_test(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare nid uuid;
begin
  if not public.is_event_member(p_event_id) then raise exception 'Event unavailable'; end if;
  perform public.enqueue_operational_notification(
    p_event_id,auth.uid(),
    case when public.is_event_manager(p_event_id) then 'manager' else 'volunteer' end,
    'push_test',p_event_id,'push-test:'||auth.uid()::text||':'||gen_random_uuid()::text,
    'Ground Control test notification',
    'This confirms the event operations push path for this device.',
    false
  );
  select id into nid from public.operational_notifications
  where event_id=p_event_id and recipient_id=auth.uid() and kind='push_test'
  order by created_at desc limit 1;
  return jsonb_build_object(
    'notificationId',nid,
    'deliveryCount',(select count(*) from public.push_deliveries where notification_id=nid)
  );
end;
$$;

create or replace function public.push_test_status(p_notification_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'status',d.status,'error',d.error,'updatedAt',d.updated_at
  ) order by d.updated_at desc),'[]'::jsonb)
  from public.push_deliveries d
  join public.operational_notifications n on n.id=d.notification_id
  where d.notification_id=p_notification_id
    and n.recipient_id=auth.uid()
    and public.is_event_member(n.event_id);
$$;

do $$
declare f regprocedure;
begin
  foreach f in array array[
    'public.queue_incident_response(uuid)'::regprocedure,
    'public.auto_response_on_risk()'::regprocedure,
    'public.auto_response_on_incident()'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
  foreach f in array array[
    'public.request_push_test(uuid)'::regprocedure,
    'public.push_test_status(uuid)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated',f);
  end loop;
end;
$$;

commit;
