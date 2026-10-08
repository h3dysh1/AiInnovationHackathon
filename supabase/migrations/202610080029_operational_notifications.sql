begin;

create table if not exists public.operational_notifications (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
 recipient_id uuid not null references auth.users(id), audience text not null check(audience in ('manager','volunteer')),
 kind text not null, source_id uuid not null, dedupe_key text not null,
 title text not null, body text not null, urgent boolean not null default false,
 created_at timestamptz not null default now(), read_at timestamptz,
 unique(recipient_id,dedupe_key)
);
create index if not exists notification_inbox on public.operational_notifications(recipient_id,created_at desc);
create table if not exists public.push_devices (
 id uuid primary key, user_id uuid not null references auth.users(id), token text not null unique,
 enabled boolean not null default true, updated_at timestamptz not null default now()
);
create table if not exists public.push_deliveries (
 id uuid primary key default gen_random_uuid(), notification_id uuid not null references public.operational_notifications(id),
 device_id uuid not null references public.push_devices(id), status text not null default 'queued'
 check(status in ('queued','sending','ticketed','forwarded','failed','cancelled')),
 attempt integer not null default 0, next_at timestamptz not null default now(), lease_until timestamptz,
 ticket_id text, error text, updated_at timestamptz not null default now(), unique(notification_id,device_id)
);
create table if not exists public.operations_worker_wakeups (
 id uuid primary key default gen_random_uuid(), expires_at timestamptz not null default now()+interval '2 minutes'
);
do $$ declare t text; begin
 foreach t in array array['operational_notifications','push_devices','push_deliveries','operations_worker_wakeups'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end; $$;
grant select on public.operational_notifications to authenticated;
drop policy if exists "Own notifications with current access" on public.operational_notifications;
create policy "Own notifications with current access" on public.operational_notifications for select to authenticated
 using(recipient_id=auth.uid() and public.is_event_member(event_id) and (audience='volunteer' or public.is_event_manager(event_id)));
grant all on public.operational_notifications,public.push_devices,public.push_deliveries,public.operations_worker_wakeups to service_role;

create or replace function public.wake_operations_worker() returns void
language plpgsql security definer set search_path='' as $$
declare v_url text; v_ticket uuid;
begin
 if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then return; end if;
 select decrypted_secret into v_url from vault.decrypted_secrets where name='ground_control_project_url' limit 1;
 if v_url is null then return; end if;
 delete from public.operations_worker_wakeups where expires_at<=now();
 insert into public.operations_worker_wakeups default values returning id into v_ticket;
 perform net.http_post(url:=v_url||'/functions/v1/operations-worker',headers:=jsonb_build_object('Content-Type','application/json','x-operations-wakeup',v_ticket::text),body:='{}'::jsonb,timeout_milliseconds:=5000);
end; $$;
create or replace function public.consume_operations_wakeup(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 delete from public.operations_worker_wakeups where id=p_id and expires_at>now(); return found;
end; $$;

create or replace function public.enqueue_operational_notification(p_event_id uuid,p_recipient uuid,p_audience text,p_kind text,p_source uuid,p_key text,p_title text,p_body text,p_urgent boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare nid uuid;
begin
 insert into public.operational_notifications(event_id,recipient_id,audience,kind,source_id,dedupe_key,title,body,urgent)
 values(p_event_id,p_recipient,p_audience,p_kind,p_source,p_key,left(p_title,160),left(p_body,500),p_urgent)
 on conflict(recipient_id,dedupe_key) do nothing returning id into nid;
 if nid is null then return; end if;
 insert into public.push_deliveries(notification_id,device_id)
 select nid,id from public.push_devices where user_id=p_recipient and enabled on conflict do nothing;
 -- A wakeup failure must not roll back an incident, approval or publication.
 begin perform public.wake_operations_worker(); exception when others then null; end;
end; $$;
create or replace function public.notify_event_managers(p_event_id uuid,p_kind text,p_source uuid,p_key text,p_title text,p_body text,p_urgent boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare m record;
begin
 for m in select user_id from public.event_memberships where event_id=p_event_id and status='active' and event_role in ('coordinator','safety_lead') loop
  perform public.enqueue_operational_notification(p_event_id,m.user_id,'manager',p_kind,p_source,p_key,p_title,p_body,p_urgent);
 end loop;
end; $$;
create or replace function public.notification_on_incident() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  perform public.notify_event_managers(new.event_id,'incident',new.id,'incident:'||new.id,'New incident report','A report has been received. Review the original while analysis is pending.',false);
 elsif new.status<>'resolved' and new.severity in ('high','critical') and (old.severity is distinct from new.severity) then
  perform public.notify_event_managers(new.event_id,'incident',new.id,'incident:'||new.id||':'||new.severity,upper(new.severity)||' incident requires review','Open the report to review its evidence and decide the response.',true);
 end if;
 return new;
end; $$;
drop trigger if exists notification_incident on public.incidents;
create trigger notification_incident after insert or update on public.incidents for each row execute function public.notification_on_incident();
create or replace function public.notification_on_risk() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='open' and (tg_op='INSERT' or old.status is distinct from new.status or old.severity is distinct from new.severity) then
  perform public.notify_event_managers(new.event_id,'risk',new.id,'risk:'||new.id||':'||new.severity,'Risk needs review','Review the supporting evidence in event alerts. Human approval is required for action.',new.severity in ('high','critical'));
 end if; return new;
end; $$;
drop trigger if exists notification_risk on public.risk_alerts;
create trigger notification_risk after insert or update on public.risk_alerts for each row execute function public.notification_on_risk();
create or replace function public.notification_on_dispatch() returns trigger
language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 select event_id into eid from public.response_plans where id=new.response_plan_id;
 if tg_op='INSERT' then
  perform public.enqueue_operational_notification(eid,new.volunteer_id,'volunteer','dispatch',new.id,'dispatch:'||new.id,'New operational instruction','Your coordinator has approved an assignment. Open your event to review and respond.',true);
 elsif new.status in ('declined','arrived','completed') and old.status is distinct from new.status then
  perform public.notify_event_managers(eid,'dispatch_status',new.id,'dispatch:'||new.id||':'||new.status,'Response '||replace(new.status,'_',' '),'A volunteer updated their response progress. Review tracking in event alerts.',new.status='declined');
 end if; return new;
end; $$;
drop trigger if exists notification_dispatch on public.dispatch_requests;
create trigger notification_dispatch after insert or update on public.dispatch_requests for each row execute function public.notification_on_dispatch();
create or replace function public.notification_on_roster() returns trigger
language plpgsql security definer set search_path='' as $$
declare m record;
begin
 if new.status='published' and old.status is distinct from new.status then
  for m in select user_id from public.event_memberships where event_id=new.event_id and event_role='volunteer' and status='active' loop
   perform public.enqueue_operational_notification(new.event_id,m.user_id,'volunteer','roster',new.id,'roster:'||new.id||':'||new.revision,'Your roster is published','Open My shifts to review your current assignments.',false);
  end loop;
 end if; return new;
end; $$;
drop trigger if exists notification_roster on public.rosters;
create trigger notification_roster after update on public.rosters for each row execute function public.notification_on_roster();

create or replace function public.notification_on_response() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.processing_status='complete' and new.status in ('proposed','modified') and
 (tg_op='INSERT' or old.processing_status is distinct from new.processing_status) then
  perform public.notify_event_managers(new.event_id,'response',new.id,'response:'||new.id,'Response recommendation ready','Review the requirements and eligible volunteers. No crew move occurs until you approve.',false);
 end if;return new;
end; $$;
drop trigger if exists notification_response on public.response_plans;
create trigger notification_response after insert or update on public.response_plans for each row execute function public.notification_on_response();

create or replace function public.my_notifications(p_before timestamptz default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id),'[]'::jsonb) from (
  select n.*,e.name as event_name from public.operational_notifications n join public.events e on e.id=n.event_id
  where n.recipient_id=auth.uid() and public.is_event_member(n.event_id) and (n.audience='volunteer' or public.is_event_manager(n.event_id))
   and (p_before is null or n.created_at<p_before) order by n.created_at desc,n.id limit 50
 ) n;
$$;
create or replace function public.my_notification_count() returns integer
language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.operational_notifications n where recipient_id=auth.uid() and read_at is null
 and public.is_event_member(event_id) and (audience='volunteer' or public.is_event_manager(event_id));
$$;
create or replace function public.read_notification(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.operational_notifications set read_at=coalesce(read_at,now()) where recipient_id=auth.uid() and (p_id is null or id=p_id)
  and public.is_event_member(event_id) and (audience='volunteer' or public.is_event_manager(event_id));
end; $$;
create or replace function public.register_push_device(p_id uuid,p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare did uuid;
begin
 if auth.uid() is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' or char_length(p_token)>250 then raise exception 'Invalid device'; end if;
 -- A physical installation has one active account; logging into another account rebinds it.
 select id into did from public.push_devices where token=p_token;
 did:=coalesce(did,p_id);
 update public.push_deliveries set status='cancelled',updated_at=now() where device_id=did and status in ('queued','sending','ticketed')
 and exists(select 1 from public.push_devices where id=did and user_id<>auth.uid());
 insert into public.push_devices(id,user_id,token) values(did,auth.uid(),p_token)
 on conflict(id) do update set user_id=excluded.user_id,token=excluded.token,enabled=true,updated_at=now();
 return did;
end; $$;
create or replace function public.disable_push_device(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.push_devices set enabled=false,updated_at=now() where id=p_id and user_id=auth.uid();
 update public.push_deliveries set status='cancelled',updated_at=now() where device_id=p_id and status in ('queued','sending') and exists(select 1 from public.push_devices where id=p_id and user_id=auth.uid());
end; $$;

-- Provider-independent recovery: late completions cannot overwrite a timed-out job.
create or replace function public.expire_interrupted_jobs() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 update public.setup_ai_jobs set status='failed',error_message='Analysis was interrupted. Your inputs are saved; retry this analysis.',updated_at=now()
 where status in ('queued','running') and updated_at<now()-interval '5 minutes';
 update public.event_documents d set processing_status='failed',processing_error='Analysis was interrupted. Original document retained.'
 where d.processing_status='processing' and exists(select 1 from public.setup_ai_jobs j where j.event_id=d.event_id and j.status='failed' and j.updated_at>now()-interval '1 minute')
 and not exists(select 1 from public.setup_ai_jobs j where j.event_id=d.event_id and j.status in ('queued','running'));
 update public.certifications set status='failed',error_message='Processing was interrupted. Original evidence retained; retry processing.'
 where status='processing' and processing_started_at<now()-interval '5 minutes';
end; $$;

create or replace function public.claim_push_deliveries() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 update public.push_deliveries set status='failed',error='Push retry limit reached',updated_at=now()
 where attempt>=6 and (status='queued' or (status='sending' and lease_until<now()));
 update public.push_deliveries d set status='cancelled',updated_at=now() from public.operational_notifications n, public.push_devices p
 where d.notification_id=n.id and d.device_id=p.id and d.status in ('queued','sending')
 and (not p.enabled or p.user_id<>n.recipient_id or n.read_at is not null or n.created_at<now()-interval '24 hours'
 or not exists(select 1 from public.event_memberships m where m.event_id=n.event_id and m.user_id=n.recipient_id and m.status='active' and (n.audience='volunteer' or m.event_role in ('coordinator','safety_lead'))));
 with picked as (
  select id from public.push_deliveries where attempt<6 and ((status='queued' and next_at<=now()) or (status='sending' and lease_until<now()))
  order by next_at,id limit 50 for update skip locked
 ), claimed as (
  update public.push_deliveries d set status='sending',attempt=attempt+1,lease_until=now()+interval '2 minutes',updated_at=now()
  from picked where d.id=picked.id returning d.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'attempt',c.attempt,'token',p.token,'notification',to_jsonb(n))),'[]'::jsonb) into result
 from claimed c join public.push_devices p on p.id=c.device_id join public.operational_notifications n on n.id=c.notification_id;
 return result;
end; $$;
create or replace function public.finish_push_delivery(p_id uuid,p_attempt integer,p_ticket text,p_error text,p_permanent boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare d public.push_deliveries;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 select * into d from public.push_deliveries where id=p_id for update;
 if d.status<>'sending' or d.attempt<>p_attempt then return; end if;
 update public.push_deliveries set status=case when p_ticket is not null then 'ticketed' when p_permanent or attempt>=6 then 'failed' else 'queued' end,
 ticket_id=p_ticket,error=left(p_error,500),lease_until=null,next_at=now()+make_interval(secs=>least(3600,30*power(2,attempt)::integer)),updated_at=now() where id=p_id;
 if p_error='DeviceNotRegistered' then update public.push_devices set enabled=false where id=d.device_id; end if;
end; $$;
create or replace function public.pending_push_receipts() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 return coalesce((select jsonb_agg(to_jsonb(d)) from(select id,ticket_id,updated_at from public.push_deliveries where status='ticketed' and updated_at<now()-interval '15 minutes' order by updated_at limit 100)d),'[]'::jsonb);
end; $$;
create or replace function public.finish_push_receipt(p_id uuid,p_error text) returns void
language plpgsql security definer set search_path='' as $$
declare did uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 update public.push_deliveries set status=case when p_error is null then 'forwarded' else 'failed' end,error=left(p_error,500),updated_at=now()
 where id=p_id and status='ticketed' returning device_id into did;
 if p_error='DeviceNotRegistered' then update public.push_devices set enabled=false where id=did; end if;
end; $$;
do $$ declare f regprocedure; begin
 foreach f in array array['public.wake_operations_worker()'::regprocedure,'public.enqueue_operational_notification(uuid,uuid,text,text,uuid,text,text,text,boolean)'::regprocedure,'public.notify_event_managers(uuid,text,uuid,text,text,text,boolean)'::regprocedure,'public.notification_on_incident()'::regprocedure,'public.notification_on_risk()'::regprocedure,'public.notification_on_dispatch()'::regprocedure,'public.notification_on_roster()'::regprocedure,'public.notification_on_response()'::regprocedure] loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
 end loop;
 foreach f in array array['public.consume_operations_wakeup(uuid)'::regprocedure,'public.expire_interrupted_jobs()'::regprocedure,'public.claim_push_deliveries()'::regprocedure,'public.finish_push_delivery(uuid,integer,text,text,boolean)'::regprocedure,'public.pending_push_receipts()'::regprocedure,'public.finish_push_receipt(uuid,text)'::regprocedure] loop
  execute format('revoke all on function %s from public,anon,authenticated',f); execute format('grant execute on function %s to service_role',f);
 end loop;
 foreach f in array array['public.my_notifications(timestamptz)'::regprocedure,'public.my_notification_count()'::regprocedure,'public.read_notification(uuid)'::regprocedure,'public.register_push_device(uuid,text)'::regprocedure,'public.disable_push_device(uuid)'::regprocedure] loop
  execute format('revoke all on function %s from public,anon',f); execute format('grant execute on function %s to authenticated',f);
 end loop;
end; $$;
do $$ begin
 if to_regnamespace('cron') is not null then
  perform cron.schedule('ground-control-operations','* * * * *','select public.wake_operations_worker()');
 end if;
end; $$;
commit;
