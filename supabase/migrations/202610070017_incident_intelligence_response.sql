begin;

alter table public.incidents add column if not exists people_affected integer;
alter table public.incidents add column if not exists confidence numeric check(confidence is null or confidence between 0 and 1);
alter table public.incidents add column if not exists analyzed_at timestamptz;
alter table public.incidents add column if not exists resolution_notes text;
alter table public.incidents add column if not exists resolved_at timestamptz;

create table if not exists public.incident_relations(
  id uuid primary key default gen_random_uuid(), incident_id uuid not null references public.incidents(id),
  related_incident_id uuid not null references public.incidents(id), relation_type text not null
    check(relation_type in ('possible_duplicate','related','same_area','possible_escalation')),
  confidence numeric not null check(confidence between 0 and 1), created_at timestamptz not null default now(),
  unique(incident_id,related_incident_id,relation_type), check(incident_id<>related_incident_id)
);
create table if not exists public.operational_timeline(
  id bigint generated always as identity primary key, event_id uuid not null references public.events(id),
  incident_id uuid references public.incidents(id), actor_id uuid references auth.users(id),
  event_type text not null, detail text not null, created_at timestamptz not null default now()
);
create table if not exists public.risk_alerts(
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
  title text not null, explanation text not null, severity text not null check(severity in ('low','medium','high','critical')),
  status text not null default 'open' check(status in ('open','dismissed','resolved')),
  evidence jsonb not null default '[]', created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create table if not exists public.response_plans(
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
  incident_id uuid references public.incidents(id), risk_alert_id uuid references public.risk_alerts(id),
  status text not null default 'proposed' check(status in ('proposed','approved','modified','dismissed','completed')),
  title text not null, rationale text not null, actions jsonb not null default '[]',
  resources jsonb not null default '[]', approved_by uuid references auth.users(id),
  approved_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.dispatch_requests(
  id uuid primary key default gen_random_uuid(), response_plan_id uuid not null references public.response_plans(id),
  assignment_id uuid references public.assignments(id), volunteer_id uuid not null references auth.users(id),
  instruction text not null, status text not null default 'pending'
    check(status in ('pending','accepted','declined','en_route','arrived','completed')),
  acknowledged_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.event_closeouts(
  event_id uuid primary key references public.events(id), summary text not null,
  metrics jsonb not null default '{}', completed_at timestamptz not null default now(), completed_by uuid not null references auth.users(id)
);

create index if not exists incident_relations_incident on public.incident_relations(incident_id);
create index if not exists timeline_event on public.operational_timeline(event_id,created_at);
create index if not exists risk_event on public.risk_alerts(event_id,status);
create index if not exists response_event on public.response_plans(event_id,status);

do $$ declare t text; begin
  foreach t in array array['incident_relations','operational_timeline','risk_alerts','response_plans','dispatch_requests','event_closeouts'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

create or replace function public.analyze_incident(p_incident_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.incidents; txt text; cat text; sev text; summary text; loc uuid; confidence numeric;
begin
  select * into i from public.incidents where id=p_incident_id;
  if i.id is null or (not public.is_event_manager(i.event_id) and auth.role()<>'service_role') then raise exception 'Incident unavailable'; end if;
  txt:=lower(i.raw_report);
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
  summary:=left(regexp_replace(trim(i.raw_report),'\s+',' ','g'),240);
  confidence:=case when loc is not null then .85 else .65 end;
  update public.incidents set category=cat,severity=sev,summary=summary,location_id=loc,
    people_affected=case when txt like '%two %' or txt like '%2 %' then 2 else 1 end,
    confidence=confidence,status='open',analyzed_at=now(),updated_at=now() where id=i.id;
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
declare count_heat integer; loc uuid; name text; rid uuid;
begin
  if not public.is_event_manager(p_event_id) and auth.role()<>'service_role' then raise exception 'You cannot review risk'; end if;
  select count(*),max(location_id) into count_heat from public.incidents
    where event_id=p_event_id and category='heat' and created_at>now()-interval '30 minutes' and status<>'resolved';
  if count_heat>=2 then
    select coalesce(l.name,'Event-wide') into name from public.locations l where l.id=loc;
    insert into public.risk_alerts(event_id,title,explanation,severity,evidence)
      values(p_event_id,'Emerging heat risk',count_heat||' heat-related reports in the last 30 minutes. Review staffing and water access.',case when count_heat>=4 then 'high' else 'medium' end,
        (select coalesce(jsonb_agg(id),'[]') from public.incidents where event_id=p_event_id and category='heat' and created_at>now()-interval '30 minutes'))
      returning id into rid;
    insert into public.operational_timeline(event_id,event_type,detail) values(p_event_id,'risk_detected','Emerging heat risk detected from recent incident reports');
  end if;
  return coalesce((select to_jsonb(r) from public.risk_alerts r where r.id=rid),'{}');
end; $$;

create or replace function public.propose_response(p_incident_id uuid default null,p_risk_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid; title text; rationale text; pid uuid;
begin
  if p_incident_id is not null then
    select event_id,coalesce(summary,raw_report) into eid,rationale from public.incidents where id=p_incident_id;
  else select event_id,title||': '||explanation into eid,rationale from public.risk_alerts where id=p_risk_id; end if;
  if eid is null or not public.is_event_manager(eid) then raise exception 'Response source unavailable'; end if;
  title:=case when p_risk_id is not null then 'Review response to emerging risk' else 'Review incident response' end;
  insert into public.response_plans(event_id,incident_id,risk_alert_id,title,rationale,actions,resources)
    values(eid,p_incident_id,p_risk_id,title,rationale,
      jsonb_build_array('Confirm affected location','Review available qualified staff','Communicate approved instructions'),
      jsonb_build_array(jsonb_build_object('type','human_review','required',true))) returning id into pid;
  insert into public.operational_timeline(event_id,incident_id,event_type,detail) values(eid,p_incident_id,'response_proposed','A response draft is ready for coordinator approval');
  return (select to_jsonb(r) from public.response_plans r where r.id=pid);
end; $$;

create or replace function public.approve_response(p_response_id uuid,p_instruction text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.response_plans; i public.incidents; a public.assignments; d public.dispatch_requests; did uuid;
begin
  select * into r from public.response_plans where id=p_response_id;
  if r.id is null or not public.is_event_manager(r.event_id) then raise exception 'Response unavailable'; end if;
  update public.response_plans set status='approved',approved_by=auth.uid(),approved_at=now() where id=r.id;
  select * into i from public.incidents where id=r.incident_id;
  if i.id is not null then update public.incidents set status='open',updated_at=now() where id=i.id; end if;
  for a in select a.* from public.assignments a join public.rosters x on x.id=a.roster_id
    where x.event_id=r.event_id and x.status='published' limit 1 loop
    insert into public.dispatch_requests(response_plan_id,assignment_id,volunteer_id,instruction)
      values(r.id,a.id,a.user_id,coalesce(nullif(trim(p_instruction),''),'Please report to the coordinator for approved response instructions.')) returning id into did;
    exit;
  end loop;
  insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail)
    values(r.event_id,r.incident_id,auth.uid(),'response_approved','Coordinator approved a response for dispatch');
  return (select to_jsonb(x) from public.response_plans x where x.id=r.id);
end; $$;

create or replace function public.update_dispatch(p_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.dispatch_requests;
begin
  select * into d from public.dispatch_requests where id=p_id and volunteer_id=auth.uid();
  if d.id is null or p_status not in ('accepted','declined','en_route','arrived','completed') then raise exception 'Dispatch unavailable'; end if;
  update public.dispatch_requests set status=p_status,acknowledged_at=coalesce(acknowledged_at,now()),updated_at=now() where id=d.id returning * into d;
  return to_jsonb(d);
end; $$;

create or replace function public.my_dispatch_requests(p_event_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'instruction',d.instruction,'status',d.status,'updated_at',d.updated_at,
    'event_id',r.event_id
  ) order by d.updated_at desc),'[]')
  from public.dispatch_requests d
  join public.response_plans r on r.id=d.response_plan_id
  where d.volunteer_id=auth.uid() and r.event_id=p_event_id and d.status<>'completed';
$$;

create or replace function public.resolve_incident(p_id uuid,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.incidents;
begin
  select * into i from public.incidents where id=p_id;
  if i.id is null or not public.is_event_manager(i.event_id) then raise exception 'Incident unavailable'; end if;
  update public.incidents set status='resolved',resolution_notes=left(trim(p_notes),2000),resolved_at=now(),updated_at=now() where id=i.id returning * into i;
  insert into public.operational_timeline(event_id,incident_id,actor_id,event_type,detail) values(i.event_id,i.id,auth.uid(),'incident_resolved',coalesce(nullif(trim(p_notes),''),'Incident resolved'));
  return to_jsonb(i);
end; $$;

create or replace function public.close_event(p_event_id uuid,p_summary text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_event_manager(p_event_id) then raise exception 'You cannot close this event'; end if;
  if exists(select 1 from public.incidents where event_id=p_event_id and status<>'resolved') then raise exception 'Resolve active incidents before closeout'; end if;
  result:=jsonb_build_object('incidents',(select count(*) from public.incidents where event_id=p_event_id),'missing',(select count(*) from public.check_ins c join public.assignments a on a.id=c.assignment_id join public.rosters r on r.id=a.roster_id where r.event_id=p_event_id and c.status='missing'));
  insert into public.event_closeouts(event_id,summary,metrics,completed_by) values(p_event_id,coalesce(nullif(trim(p_summary),''),'Event closed'),result,auth.uid())
    on conflict(event_id) do update set summary=excluded.summary,metrics=excluded.metrics,completed_at=now(),completed_by=auth.uid();
  update public.events set status='completed' where id=p_event_id;
  return result;
end; $$;

create or replace function public.intelligence_snapshot(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.is_event_manager(p_event_id) then raise exception 'You cannot view intelligence'; end if;
  return jsonb_build_object(
    'incidents',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from public.incidents i where i.event_id=p_event_id and i.status<>'resolved'),'[]'),
    'relations',coalesce((select jsonb_agg(to_jsonb(r)) from public.incident_relations r join public.incidents i on i.id=r.incident_id where i.event_id=p_event_id),'[]'),
    'risks',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.risk_alerts r where r.event_id=p_event_id and r.status='open'),'[]'),
    'responses',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.response_plans r where r.event_id=p_event_id and r.status not in ('dismissed','completed')),'[]'),
    'procedures',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'document_type',d.document_type)) from public.event_documents d where d.event_id=p_event_id and d.processing_status='ready' and d.document_type in ('emergency_plan','medical_plan','heat_plan','operations')),'[]')
  );
end; $$;

revoke all on function public.analyze_incident(uuid),public.correlate_incident(uuid),public.detect_risk(uuid),public.propose_response(uuid,uuid),public.approve_response(uuid,text),public.update_dispatch(uuid,text),public.resolve_incident(uuid,text),public.close_event(uuid,text),public.intelligence_snapshot(uuid) from public,anon;
grant execute on function public.analyze_incident(uuid),public.correlate_incident(uuid),public.detect_risk(uuid),public.propose_response(uuid,uuid),public.approve_response(uuid,text),public.resolve_incident(uuid,text),public.close_event(uuid,text) to authenticated;
grant execute on function public.update_dispatch(uuid,text),public.my_dispatch_requests(uuid) to authenticated;
grant execute on function public.intelligence_snapshot(uuid) to authenticated;

commit;
