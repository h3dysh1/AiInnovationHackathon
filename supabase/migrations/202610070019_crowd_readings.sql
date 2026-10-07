-- Phase 22: camera crowd readings feed explainable risk alerts.
--
-- A camera pipeline (cv/) signed in as an event manager records one reading at a time
-- for one location. Readings never contain images or identities: only counts, density,
-- trend and flow. Sustained crowding opens (or escalates) ONE crowding alert per location.
-- Alerts reuse the existing human-approved response flow: propose_response ->
-- approve_response -> dispatch. Nothing here moves people or contacts the public.
--
-- Density thresholds (people per m2, sustained over the last 3 readings within 2 minutes):
--   >= 3 and rising -> medium   >= 4 -> high   >= 5 -> critical
-- These are demo defaults; confirm them against current crowd-safety guidance.
--
-- detect_risk is extended: heat reports at a location the camera shows as crowded
-- raise the alert one level, and repeated checks update the open alert instead of
-- creating duplicates. Safe to rerun.

begin;

create table if not exists public.crowd_readings(
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id),
  location_id uuid not null references public.locations(id),
  camera_id text not null check(char_length(camera_id) between 1 and 64),
  captured_at timestamptz not null,
  people integer not null check(people between 0 and 100000),
  area_m2 numeric not null check(area_m2 > 0),
  density numeric not null check(density between 0 and 20),
  trend text not null check(trend in ('rising','steady','falling')),
  counterflow numeric check(counterflow is null or counterflow between 0 and 1),
  confidence numeric check(confidence is null or confidence between 0 and 1),
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists crowd_location_time on public.crowd_readings(event_id,location_id,captured_at desc);

alter table public.crowd_readings enable row level security;
revoke all on public.crowd_readings from anon,authenticated;
grant select on public.crowd_readings to authenticated;
drop policy if exists "Event managers read crowd readings" on public.crowd_readings;
create policy "Event managers read crowd readings" on public.crowd_readings for select to authenticated
  using(public.is_event_manager(event_id));

-- Alerts gain an optional place, kind and source so one open alert per place/kind can be kept.
alter table public.risk_alerts add column if not exists location_id uuid references public.locations(id);
alter table public.risk_alerts add column if not exists category text;
alter table public.risk_alerts add column if not exists source text;
alter table public.risk_alerts add column if not exists updated_at timestamptz;
create index if not exists risk_open_place on public.risk_alerts(event_id,location_id,category) where status='open';

create or replace function public.risk_severity_rank(p_severity text)
returns integer language sql immutable set search_path='' as $$
  select case p_severity when 'low' then 1 when 'medium' then 2 when 'high' then 3 when 'critical' then 4 else 0 end
$$;

create or replace function public.record_crowd_reading(
  p_event_id uuid,
  p_camera_id text,
  p_people integer,
  p_area_m2 numeric,
  p_trend text default 'steady',
  p_counterflow numeric default null,
  p_confidence numeric default null,
  p_location_id uuid default null,
  p_location_name text default null,
  p_captured_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare loc public.locations; r public.crowd_readings; at timestamptz; d numeric; n integer; sustained numeric;
  sev text; existing public.risk_alerts; rid uuid; detail text; reading jsonb; escalated boolean:=false;
begin
  if not public.is_event_manager(p_event_id) then raise exception 'You cannot record crowd readings for this event'; end if;
  if p_camera_id is null or char_length(trim(p_camera_id)) not between 1 and 64 then raise exception 'Name the camera'; end if;
  if p_people is null or p_people not between 0 and 100000 then raise exception 'Invalid people count'; end if;
  if p_area_m2 is null or p_area_m2 <= 0 or p_area_m2 > 1000000 then raise exception 'Invalid camera area'; end if;
  if p_trend is null or p_trend not in ('rising','steady','falling') then raise exception 'Invalid crowd trend'; end if;
  if p_counterflow is not null and p_counterflow not between 0 and 1 then raise exception 'Invalid counterflow'; end if;
  if p_confidence is not null and p_confidence not between 0 and 1 then raise exception 'Invalid confidence'; end if;
  at:=coalesce(p_captured_at,now());
  if at > now()+interval '5 minutes' then raise exception 'Reading time is in the future'; end if;
  d:=round(p_people::numeric/p_area_m2,2);
  if d > 20 then raise exception 'Density is implausible; check the camera area'; end if;

  if p_location_id is not null then
    select * into loc from public.locations where id=p_location_id and event_id=p_event_id;
  else
    select * into loc from public.locations where event_id=p_event_id
      and lower(name)=lower(trim(coalesce(p_location_name,''))) order by created_at limit 1;
  end if;
  if loc.id is null then raise exception 'Camera location not found for this event'; end if;

  insert into public.crowd_readings(event_id,location_id,camera_id,captured_at,people,area_m2,density,trend,counterflow,confidence,recorded_by)
    values(p_event_id,loc.id,trim(p_camera_id),at,p_people,p_area_m2,d,p_trend,p_counterflow,p_confidence,auth.uid())
    returning * into r;

  -- Sustained = the lowest of this camera's last 3 readings within 2 minutes, so one spike never alerts.
  select count(*),min(x.density) into n,sustained from (
    select c.density from public.crowd_readings c
    where c.event_id=p_event_id and c.location_id=loc.id and c.camera_id=r.camera_id
      and c.captured_at between at-interval '2 minutes' and at
    order by c.captured_at desc limit 3) x;
  if n >= 3 then
    sev:=case when sustained >= 5 then 'critical' when sustained >= 4 then 'high'
      when sustained >= 3 and r.trend='rising' then 'medium' end;
  end if;

  detail:=format('%s camera: %s people/m² (about %s people), %s', loc.name, r.density, r.people, r.trend)
    || case when r.counterflow >= 0.5 then format(', opposing crowd flows (%s)', round(r.counterflow,2)) else '' end
    || '. Confirm on the ground before acting.';
  reading:=jsonb_build_object('type','crowd_reading','id',r.id,'density',r.density,'people',r.people,
    'trend',r.trend,'counterflow',r.counterflow,'captured_at',r.captured_at,'camera_id',r.camera_id);

  select * into existing from public.risk_alerts
    where event_id=p_event_id and location_id=loc.id and category='crowding' and status='open'
    order by created_at desc limit 1;
  if existing.id is not null then
    -- Keep one open alert per place: refresh its evidence; only ever escalate, never silently downgrade.
    escalated:=sev is not null and public.risk_severity_rank(sev) > public.risk_severity_rank(existing.severity);
    update public.risk_alerts set
      severity=case when escalated then sev else severity end,
      explanation='Sustained crowding detected by camera. Latest: '||detail,
      evidence=(select coalesce(jsonb_agg(e order by i),'[]'::jsonb) from (
        select e,i from jsonb_array_elements(existing.evidence || jsonb_build_array(reading)) with ordinality t(e,i)
        order by i desc limit 10) s),
      updated_at=now()
    where id=existing.id returning id into rid;
    if escalated then
      insert into public.operational_timeline(event_id,actor_id,event_type,detail)
        values(p_event_id,auth.uid(),'risk_escalated',format('Crowding at %s escalated to %s', loc.name, sev));
    end if;
  elsif sev is not null then
    insert into public.risk_alerts(event_id,title,explanation,severity,evidence,location_id,category,source,updated_at)
      values(p_event_id,format('Crowding at %s', loc.name),'Sustained crowding detected by camera. Latest: '||detail,
        sev,jsonb_build_array(reading),loc.id,'crowding','camera',now())
      returning id into rid;
    insert into public.operational_timeline(event_id,actor_id,event_type,detail)
      values(p_event_id,auth.uid(),'risk_detected',format('Sustained crowding detected by camera at %s', loc.name));
  end if;

  return jsonb_build_object(
    'reading',to_jsonb(r) - 'recorded_by',
    'sustained_density',sustained,
    'alert',(select to_jsonb(a) from public.risk_alerts a where a.id=rid)
  );
end; $$;

create or replace function public.crowd_snapshot(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.is_event_manager(p_event_id) then raise exception 'You cannot view crowd readings'; end if;
  return jsonb_build_object(
    'thresholds',jsonb_build_object('caution',3,'high',4,'critical',5),
    'locations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'name',l.name,'map_x',l.map_x,'map_y',l.map_y,'map_radius_percent',l.map_radius_percent,
      'latest',(select to_jsonb(c) - 'event_id' - 'recorded_by' from public.crowd_readings c
        where c.location_id=l.id order by c.captured_at desc limit 1),
      'recent',(select coalesce(jsonb_agg(jsonb_build_object('density',y.density,'captured_at',y.captured_at) order by y.captured_at),'[]'::jsonb)
        from (select c.density,c.captured_at from public.crowd_readings c where c.location_id=l.id
          order by c.captured_at desc limit 30) y)
    ) order by l.name) from public.locations l where l.event_id=p_event_id),'[]'::jsonb),
    'alerts',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.risk_alerts a
      where a.event_id=p_event_id and a.category='crowding' and a.status='open'),'[]'::jsonb)
  );
end; $$;

create or replace function public.detect_risk(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare count_heat integer; loc uuid; loc_name text; rid uuid; sev text; detail text; ev jsonb;
  crowd public.crowd_readings; existing public.risk_alerts;
begin
  if not public.is_event_manager(p_event_id) and auth.role()<>'service_role' then raise exception 'You cannot review risk'; end if;
  select count(*) into count_heat from public.incidents
    where event_id=p_event_id and category='heat' and created_at>now()-interval '30 minutes' and status<>'resolved';
  if count_heat < 2 then return '{}'::jsonb; end if;

  -- The place most heat reports come from, if they name one.
  select location_id into loc from public.incidents
    where event_id=p_event_id and category='heat' and created_at>now()-interval '30 minutes'
      and status<>'resolved' and location_id is not null
    group by location_id order by count(*) desc limit 1;
  loc_name:=coalesce((select name from public.locations where id=loc),'Event-wide');
  sev:=case when count_heat>=4 then 'high' else 'medium' end;
  detail:=count_heat||' heat-related reports in the last 30 minutes'
    || case when loc is not null then ', mostly at '||loc_name else '' end
    || '. Review staffing and water access.';
  ev:=(select coalesce(jsonb_agg(id),'[]'::jsonb) from public.incidents
    where event_id=p_event_id and category='heat' and created_at>now()-interval '30 minutes');

  -- Combine evidence: a crowded place makes heat cases more likely to escalate.
  if loc is not null then
    select * into crowd from public.crowd_readings
      where event_id=p_event_id and location_id=loc and captured_at>now()-interval '10 minutes'
      order by captured_at desc limit 1;
    if crowd.id is not null and crowd.density >= 3 then
      sev:=case sev when 'medium' then 'high' else 'critical' end;
      detail:=detail||format(' Camera shows %s people/m² there (%s), so crowding may be contributing.', crowd.density, crowd.trend);
      ev:=ev||jsonb_build_array(jsonb_build_object('type','crowd_reading','id',crowd.id,'density',crowd.density,'captured_at',crowd.captured_at));
    end if;
  end if;

  select * into existing from public.risk_alerts
    where event_id=p_event_id and status='open'
      and (category='heat' or (category is null and title='Emerging heat risk'))
      and location_id is not distinct from loc
    order by created_at desc limit 1;
  if existing.id is not null then
    update public.risk_alerts set
      severity=case when public.risk_severity_rank(sev) > public.risk_severity_rank(existing.severity) then sev else severity end,
      explanation=detail, evidence=ev, category='heat', updated_at=now()
    where id=existing.id returning id into rid;
    if public.risk_severity_rank(sev) > public.risk_severity_rank(existing.severity) then
      insert into public.operational_timeline(event_id,event_type,detail) values(p_event_id,'risk_escalated','Emerging heat risk escalated to '||sev);
    end if;
  else
    insert into public.risk_alerts(event_id,title,explanation,severity,evidence,location_id,category,source,updated_at)
      values(p_event_id,'Emerging heat risk',detail,sev,ev,loc,'heat',
        case when crowd.id is not null and crowd.density >= 3 then 'reports_and_camera' else 'reports' end,now())
      returning id into rid;
    insert into public.operational_timeline(event_id,event_type,detail) values(p_event_id,'risk_detected','Emerging heat risk detected from recent incident reports');
  end if;
  return coalesce((select to_jsonb(r) from public.risk_alerts r where r.id=rid),'{}');
end; $$;

-- Fix: the original (migration 017) declared a variable named "title", which made
-- "select title ... from risk_alerts" ambiguous, so drafting a response to ANY risk alert failed.
-- Columns are now qualified. Crowding alerts also get crowd-specific suggested actions.
create or replace function public.propose_response(p_incident_id uuid default null,p_risk_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid; title text; rationale text; pid uuid; risk_category text; actions jsonb;
begin
  if p_incident_id is not null then
    select i.event_id,coalesce(i.summary,i.raw_report) into eid,rationale from public.incidents i where i.id=p_incident_id;
  else
    select a.event_id,a.title||': '||a.explanation,a.category into eid,rationale,risk_category
      from public.risk_alerts a where a.id=p_risk_id;
  end if;
  if eid is null or not public.is_event_manager(eid) then raise exception 'Response source unavailable'; end if;
  title:=case when p_risk_id is not null then 'Review response to emerging risk' else 'Review incident response' end;
  actions:=case when risk_category='crowding' then
      jsonb_build_array('Confirm crowd density on the ground','Send crowd marshals to form lanes and separate opposing flows',
        'Consider holding entry at the nearest gate','Communicate approved instructions')
    else jsonb_build_array('Confirm affected location','Review available qualified staff','Communicate approved instructions') end;
  insert into public.response_plans(event_id,incident_id,risk_alert_id,title,rationale,actions,resources)
    values(eid,p_incident_id,p_risk_id,title,rationale,actions,
      jsonb_build_array(jsonb_build_object('type','human_review','required',true))) returning id into pid;
  insert into public.operational_timeline(event_id,incident_id,event_type,detail) values(eid,p_incident_id,'response_proposed','A response draft is ready for coordinator approval');
  return (select to_jsonb(r) from public.response_plans r where r.id=pid);
end; $$;

revoke all on function public.risk_severity_rank(text) from public,anon;
revoke all on function public.record_crowd_reading(uuid,text,integer,numeric,text,numeric,numeric,uuid,text,timestamptz),
  public.crowd_snapshot(uuid) from public,anon;
grant execute on function public.risk_severity_rank(text) to authenticated;
grant execute on function public.record_crowd_reading(uuid,text,integer,numeric,text,numeric,numeric,uuid,text,timestamptz),
  public.crowd_snapshot(uuid) to authenticated;

commit;
