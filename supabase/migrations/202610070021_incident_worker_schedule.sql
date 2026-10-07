begin;

-- Hosted Supabase supports these extensions. Embedded SQL tests exercise queue
-- semantics separately; deployment verifies the actual extensions and schedule.
do $$ begin
  if exists(select 1 from pg_available_extensions where name='pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    create extension if not exists pg_cron;
  end if;
end; $$;

create or replace function public.wake_incident_worker()
returns void language plpgsql security definer set search_path='' as $$
declare v_url text; v_ticket uuid;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='ground_control_project_url' limit 1;
  if v_url is null then return; end if;
  delete from public.incident_worker_wakeups where expires_at<=now();
  insert into public.incident_worker_wakeups default values returning id into v_ticket;
  perform net.http_post(url:=v_url||'/functions/v1/incident-ai',
    headers:=jsonb_build_object('Content-Type','application/json','x-incident-wakeup',v_ticket::text),
    body:='{}'::jsonb,timeout_milliseconds:=5000);
end; $$;
revoke all on function public.wake_incident_worker() from public,anon,authenticated;

do $$ begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('ground-control-incident-processing','* * * * *',
      $job$select public.wake_incident_worker()
        where exists(select 1 from public.incidents where status<>'resolved' and processing_failures<3
          and ((processing_status in ('queued','failed') and processing_next_at<=now())
            or (processing_status='processing' and processing_lease_until<now())));$job$);
  end if;
end; $$;

commit;
