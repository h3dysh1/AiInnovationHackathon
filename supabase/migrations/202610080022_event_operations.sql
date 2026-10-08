begin;
alter table public.events add column if not exists no_show_grace_minutes integer not null default 30 check(no_show_grace_minutes between 0 and 120);
alter table public.events add column if not exists is_demo boolean not null default false;

create or replace function public.start_event(p_event_id uuid,p_grace_minutes integer default 30)
returns void language plpgsql security definer set search_path='' as $$
declare e public.events; r uuid; ready jsonb;
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable'; end if;
 select * into e from public.events where id=p_event_id for update;
 if e.status='live' then return; end if;
 if e.status<>'published' or p_grace_minutes not between 0 and 120 then raise exception 'Publish a roster before starting operations'; end if;
 select id into r from public.rosters where event_id=e.id and status='published';
 ready:=public.get_roster_readiness(r);
 if r is null or not (ready->>'ready')::boolean then raise exception 'Resolve readiness issues before starting operations'; end if;
 if not e.is_demo and (now() at time zone e.timezone)::date not between e.start_date and e.end_date then raise exception 'Start operations during the event dates'; end if;
 update public.events set status='live',no_show_grace_minutes=p_grace_minutes where id=e.id;
 insert into public.operational_timeline(event_id,actor_id,event_type,detail) values(e.id,auth.uid(),'event_started','Coordinator started live operations');
end; $$;
create or replace function public.event_operational_readiness(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid; setup jsonb; roster jsonb;
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable'; end if;
 select id into r from public.rosters where event_id=p_event_id and status in ('draft','published') order by (status='draft') desc limit 1;
 setup:=public.get_event_readiness(p_event_id);
 roster:=case when r is null then jsonb_build_object('ready',false,'issues',jsonb_build_array('Generate and publish a roster')) else public.get_roster_readiness(r) end;
 return jsonb_build_object('setup',setup,'roster',roster,
 'pendingCertificates',(select count(*) from public.certifications c where c.status in ('uploaded','processing','requires_review','failed') and exists(select 1 from public.event_memberships m where m.event_id=p_event_id and m.user_id=c.user_id and m.status='active')),
 'onboardingMissing',(select count(*) from public.event_memberships m where m.event_id=p_event_id and m.event_role='volunteer' and m.status='active' and not exists(select 1 from public.event_volunteer_preferences v where v.event_id=p_event_id and v.user_id=m.user_id)),
 'missingAcknowledgements',(select count(*) from public.event_memberships m join public.events e on e.id=m.event_id where m.event_id=p_event_id and m.status='active' and m.event_role='volunteer' and not exists(select 1 from public.event_acknowledgements a where a.event_id=m.event_id and a.user_id=m.user_id and a.setup_revision=e.setup_revision)),
 'safetyProcedures',(select count(*) from public.event_procedures where event_id=p_event_id),
 'safetyDocuments',(select count(*) from public.event_documents where event_id=p_event_id and document_type in ('emergency_plan','medical_plan','heat_plan','operations') and processing_status='ready'));
end; $$;
revoke all on function public.start_event(uuid,integer),public.event_operational_readiness(uuid) from public,anon;
grant execute on function public.start_event(uuid,integer),public.event_operational_readiness(uuid) to authenticated;
commit;
