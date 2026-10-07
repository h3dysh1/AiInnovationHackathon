begin;
-- Scheduled attendance creates recommendations, never autonomous moves.
alter table public.response_plans add column if not exists coverage_shift_id uuid references public.shifts(id);
create unique index if not exists active_coverage_response on public.response_plans(coverage_shift_id) where coverage_shift_id is not null and status in ('proposed','modified','approved');
create or replace function public.process_live_attendance()
returns void language plpgsql security definer set search_path='' as $$
declare e record;s record;c jsonb;q jsonb;resources jsonb;gap integer;qualified integer;total integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 for e in select id from public.events where status='live' loop
  perform 1 from public.events where id=e.id for update;
  perform public.mark_live_attendance(e.id);
  for c in select value from jsonb_array_elements(public.live_coverage(e.id)) loop
   if not exists(select 1 from public.check_ins ci join public.assignments a on a.id=ci.assignment_id where a.shift_id=(c->>'shift_id')::uuid and ci.status='missing' and coalesce(a.effective_ends_at,(select ends_at from public.shifts where id=a.shift_id))>now()) then continue;end if;
   resources:='[]';total:=0;gap:=greatest(0,(c->>'required')::integer-(c->>'checked_in')::integer);
   for q in select value from jsonb_array_elements(c->'qualifications') loop
    qualified:=greatest(0,(q->>'required')::integer-(q->>'actual')::integer);
    if qualified>0 then
     select value into q from public.shifts sh,jsonb_array_elements(sh.requirements) where sh.id=(c->>'shift_id')::uuid and coalesce(value->>'certification_type',value->>'experience_requirement')=q->>'label' limit 1;
     if qualified>6 or jsonb_array_length(resources)>=6 then continue;end if;
     resources:=resources||jsonb_build_array(jsonb_build_object('label',coalesce(q->>'certification_type',q->>'experience_requirement'),'certificationType',q->>'certification_type','experienceRequirement',q->>'experience_requirement','count',qualified));
     total:=total+qualified;
    end if;
   end loop;
   gap:=greatest(0,gap-total);
   if gap>0 and gap<=6 and jsonb_array_length(resources)<6 then resources:=resources||jsonb_build_array(jsonb_build_object('label','General support','certificationType',null,'experienceRequirement',null,'count',gap));total:=total+gap;end if;
   if total=0 or total>12 then continue;end if;
   select sh.id,sh.instructions,p.name into s from public.shifts sh join public.posts p on p.id=sh.post_id where sh.id=(c->>'shift_id')::uuid;
   insert into public.response_plans(event_id,coverage_shift_id,target_shift_id,target_location_id,title,rationale,actions,resources,instruction,processing_status)
    values(e.id,s.id,s.id,(c->>'location_id')::uuid,'Replace missing crew at '||s.name,'Attendance and qualification coverage show a gap after the configured grace period. Review eligible reserves and protect source posts.',jsonb_build_array('Confirm the missing volunteer cannot attend','Review and approve a qualified replacement'),resources,'Report to '||s.name||'. '||coalesce(s.instructions,'Confirm instructions with the coordinator.'),'complete')
    on conflict(coverage_shift_id) where coverage_shift_id is not null and status in ('proposed','modified','approved') do nothing;
  end loop;
 end loop;
end; $$;

-- Closeout AI is a durable, reviewable draft. It cannot close an event.
create table if not exists public.event_summary_jobs(event_id uuid primary key references public.events(id),status text not null default 'queued' check(status in ('queued','processing','complete','failed')),
 attempt integer not null default 0,failures integer not null default 0,lease_until timestamptz,next_attempt_at timestamptz not null default now(),summary text,error text,updated_at timestamptz not null default now());
alter table public.event_summary_jobs enable row level security;
revoke all on public.event_summary_jobs from public,anon,authenticated;
grant select on public.event_summary_jobs to authenticated;
drop policy if exists "Managers read summaries" on public.event_summary_jobs;
create policy "Managers read summaries" on public.event_summary_jobs for select to authenticated using(public.is_event_manager(event_id));
create or replace function public.request_event_summary(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable'; end if;
 insert into public.event_summary_jobs(event_id) values(p_event_id) on conflict(event_id) do update set status='queued',failures=0,next_attempt_at=now(),lease_until=null;
 begin perform public.wake_incident_worker();exception when others then null;end;
end; $$;
create or replace function public.claim_event_summary()
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.event_summary_jobs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only';end if;
 select * into j from public.event_summary_jobs where failures<3 and ((status in ('queued','failed') and next_attempt_at<=now()) or(status='processing' and lease_until<now())) for update skip locked limit 1;
 if j.event_id is null then return null;end if;
 update public.event_summary_jobs set status='processing',attempt=attempt+1,lease_until=now()+interval '3 minutes',failures=failures+case when status='processing' then 1 else 0 end where event_id=j.event_id returning * into j;
 return to_jsonb(j)||jsonb_build_object('evidence',jsonb_build_object(
 'event',(select jsonb_build_object('name',name,'status',status) from public.events where id=j.event_id),
 'incidents',coalesce((select jsonb_agg(jsonb_build_object('report',raw_report,'summary',summary,'severity',severity,'resolution',resolution_notes)) from public.incidents where event_id=j.event_id),'[]'),
 'timeline',coalesce((select jsonb_agg(to_jsonb(t)) from (select event_type,detail,created_at from public.operational_timeline where event_id=j.event_id order by created_at desc limit 100)t),'[]')));
end; $$;
create or replace function public.finish_event_summary(p_event_id uuid,p_attempt integer,p_summary text,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only';end if;
 if p_error is null and (p_summary is null or char_length(trim(p_summary)) not between 1 and 6000) then raise exception 'Invalid summary';end if;
 update public.event_summary_jobs set status=case when p_error is null then 'complete' else 'failed' end,summary=case when p_error is null then p_summary else summary end,error=left(p_error,1000),lease_until=null,failures=case when p_error is null then 0 else failures+1 end,next_attempt_at=now()+interval '2 minutes',updated_at=now()
 where event_id=p_event_id and attempt=p_attempt and status='processing';
 return found;
end; $$;
create or replace function public.close_event(p_event_id uuid,p_summary text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare metrics jsonb;
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable';end if;
 perform 1 from public.events where id=p_event_id for update;
 if not exists(select 1 from public.events where id=p_event_id and status='live') then raise exception 'Only live events can be closed';end if;
 if p_summary is null or char_length(trim(p_summary)) not between 1 and 6000 then raise exception 'Review and enter a closeout summary';end if;
 if exists(select 1 from public.incidents where event_id=p_event_id and status<>'resolved') or exists(select 1 from public.risk_alerts where event_id=p_event_id and status='open') or exists(select 1 from public.response_plans where event_id=p_event_id and status in ('proposed','modified','approved')) then raise exception 'Resolve incidents, risks and responses before closeout';end if;
 metrics:=jsonb_build_object('incidents',(select count(*) from public.incidents where event_id=p_event_id),'responses',(select count(*) from public.response_plans where event_id=p_event_id),'reassignments',(select count(*) from public.assignments a join public.rosters r on r.id=a.roster_id where r.event_id=p_event_id and a.reassigned_from_id is not null),'missing',(select count(*) from public.check_ins c join public.assignments a on a.id=c.assignment_id join public.rosters r on r.id=a.roster_id where r.event_id=p_event_id and c.status='missing'));
 insert into public.event_closeouts(event_id,summary,metrics,completed_by) values(p_event_id,trim(p_summary),metrics,auth.uid());
 update public.events set status='completed' where id=p_event_id;
 insert into public.operational_timeline(event_id,actor_id,event_type,detail) values(p_event_id,auth.uid(),'event_closed','Coordinator reviewed the closeout summary; operational history retained');
 return metrics;
end; $$;

create or replace function public.become_coordinator(p_organisation_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 if auth.uid() is null or p_organisation_name is null or char_length(trim(p_organisation_name)) not between 1 and 120 then raise exception 'Enter your organisation name';end if;
 insert into public.account_roles(user_id,role) values(auth.uid(),'coordinator') on conflict(user_id) do update set role='coordinator';
 insert into public.organisations(name,created_by) values(trim(p_organisation_name),auth.uid()) on conflict(created_by,lower(name)) do update set name=excluded.name returning id into oid;
 return oid;
end; $$;
revoke all on function public.request_event_summary(uuid),public.become_coordinator(text) from public,anon;
grant execute on function public.request_event_summary(uuid),public.become_coordinator(text) to authenticated;
revoke all on function public.claim_event_summary(),public.finish_event_summary(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.claim_event_summary(),public.finish_event_summary(uuid,integer,text,text) to service_role;
do $$ begin
 if to_regnamespace('cron') is not null then
 perform cron.schedule('ground-control-incident-processing','* * * * *',
 $job$select public.wake_incident_worker() where
 exists(select 1 from public.events where status='live') or
 exists(select 1 from public.incidents where status<>'resolved' and processing_failures<3 and ((processing_status in ('queued','failed') and processing_next_at<=now()) or(processing_status='processing' and processing_lease_until<now()))) or
 exists(select 1 from public.response_plans where status='proposed' and processing_failures<3 and ((processing_status in ('queued','failed') and next_attempt_at<=now()) or(processing_status='processing' and lease_until<now()))) or
 exists(select 1 from public.event_summary_jobs where failures<3 and ((status in ('queued','failed') and next_attempt_at<=now()) or(status='processing' and lease_until<now())));$job$);
 end if;
end; $$;
create or replace function public.event_summary_status(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable';end if;
 return coalesce((select to_jsonb(j) from public.event_summary_jobs j where event_id=p_event_id),jsonb_build_object('status','not_requested'));
end; $$;
revoke all on function public.event_summary_status(uuid) from public,anon;
grant execute on function public.event_summary_status(uuid) to authenticated;
-- Risk resolution also closes its response and assignment history through the same reviewed operation.
create or replace function public.finish_risk_responses() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if new.status in ('resolved','dismissed') and old.status='open' then
  for r in select id from public.response_plans where risk_alert_id=new.id and status not in ('completed','dismissed') loop
   update public.response_plans set status=case when new.status='dismissed' and status in ('proposed','modified') then 'dismissed' else 'completed' end,revision=revision+1,processing_status='complete',lease_until=null where id=r.id;
   update public.dispatch_requests set status='completed',updated_at=now() where response_plan_id=r.id and status not in ('completed','declined');
   update public.assignments a set effective_ends_at=least(coalesce(a.effective_ends_at,sh.ends_at),now()) from public.shifts sh where a.shift_id=sh.id and a.response_plan_id=r.id;
   update public.check_ins ci set status='completed',checked_out_at=coalesce(ci.checked_out_at,now()) from public.assignments a where ci.assignment_id=a.id and a.response_plan_id=r.id;
  end loop;
 end if;return new;
end; $$;
drop trigger if exists resolve_risk_responses on public.risk_alerts;
create trigger resolve_risk_responses after update of status on public.risk_alerts for each row execute function public.finish_risk_responses();
commit;
