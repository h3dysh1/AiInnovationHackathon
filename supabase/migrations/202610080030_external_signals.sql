begin;
create table if not exists public.event_signal_settings (
 event_id uuid primary key references public.events(id), weather_enabled boolean not null default false,
 latitude double precision check(latitude between -90 and 90),longitude double precision check(longitude between -180 and 180),
 heat_threshold numeric not null default 35 check(heat_threshold between 20 and 55),
 gust_threshold numeric not null default 60 check(gust_threshold between 20 and 200),
 last_checked_at timestamptz, last_success_at timestamptz, last_error text, weather_reading jsonb,
 lease_until timestamptz, attempt integer not null default 0,
 check((latitude is null)=(longitude is null)),check(not weather_enabled or latitude is not null)
);
create table if not exists public.external_event_signals (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id),
 source text not null check(source in ('weather','demo_social')),source_key text not null,
 title text not null,detail text not null,evidence jsonb not null,synthetic boolean not null,
 observed_at timestamptz not null,received_at timestamptz not null default now(),
 observation_id uuid references public.event_observations(id),unique(event_id,source,source_key)
);
do $$ declare t text; begin
 foreach t in array array['event_signal_settings','external_event_signals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('drop policy if exists "Managers read external signals" on public.%I',t);
  execute format('create policy "Managers read external signals" on public.%I for select to authenticated using(public.is_event_manager(event_id))',t);
 end loop;
end; $$;
create or replace function public.configure_event_weather(p_event_id uuid,p_enabled boolean,p_latitude double precision,p_longitude double precision,p_heat numeric default 35,p_gust numeric default 60) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable'; end if;
 insert into public.event_signal_settings(event_id,weather_enabled,latitude,longitude,heat_threshold,gust_threshold)
 values(p_event_id,p_enabled,p_latitude,p_longitude,p_heat,p_gust)
 on conflict(event_id) do update set weather_enabled=excluded.weather_enabled,latitude=excluded.latitude,longitude=excluded.longitude,
 heat_threshold=excluded.heat_threshold,gust_threshold=excluded.gust_threshold,last_checked_at=null,last_error=null,
 weather_reading=null,last_success_at=null,lease_until=null,attempt=public.event_signal_settings.attempt+1;
 begin perform public.wake_operations_worker(); exception when others then null; end;
end; $$;
create or replace function public.event_signal_snapshot(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable'; end if;
 return jsonb_build_object('settings',(select to_jsonb(s) from public.event_signal_settings s where event_id=p_event_id),
 'venue',(select jsonb_build_object('latitude',latitude,'longitude',longitude) from public.event_site_settings where event_id=p_event_id),
 'signals',coalesce((select jsonb_agg(to_jsonb(s) order by s.received_at desc) from (select * from public.external_event_signals where event_id=p_event_id order by received_at desc limit 30)s),'[]'::jsonb));
end; $$;
create or replace function public.claim_weather_updates(p_event_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 with picked as (
  select s.event_id from public.event_signal_settings s join public.events e on e.id=s.event_id
  where s.weather_enabled and (s.lease_until is null or s.lease_until<now())
   and (p_event_id is null or s.event_id=p_event_id) and (p_event_id is not null or e.status='live')
   and (s.last_checked_at is null or s.last_checked_at<now()-interval '15 minutes')
  order by s.last_checked_at nulls first limit 10 for update of s skip locked
 ), claimed as (
  update public.event_signal_settings s set lease_until=now()+interval '2 minutes',attempt=attempt+1,last_checked_at=now()
  from picked p where s.event_id=p.event_id returning s.*
 ) select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into result from claimed c;
 return result;
end; $$;
create or replace function public.finish_weather_update(p_event_id uuid,p_attempt integer,p_reading jsonb,p_error text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.event_signal_settings; eid uuid; oid uuid; detail text; stamp timestamptz; heat numeric; gust numeric;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only'; end if;
 select * into s from public.event_signal_settings where event_id=p_event_id for update;
 if s.attempt<>p_attempt or not s.weather_enabled then return; end if;
 if p_error is not null then
  update public.event_signal_settings set last_error=left(p_error,500),lease_until=null where event_id=p_event_id; return;
 end if;
 stamp:=(p_reading->>'observedAt')::timestamptz;heat:=(p_reading->>'temperature')::numeric;gust:=(p_reading->>'windGust')::numeric;
 if stamp<now()-interval '1 hour' or stamp>now()+interval '15 minutes' or heat not between -100 and 70 or gust not between 0 and 500 then raise exception 'Invalid weather data'; end if;
 detail:='Open-Meteo modelled conditions: '||heat||' C, feels '||(p_reading->>'feelsLike')||' C, wind '||(p_reading->>'windSpeed')||' km/h, gusts '||gust||' km/h, precipitation '||(p_reading->>'precipitation')||' mm. Advisory only; check site conditions and procedures.';
 insert into public.external_event_signals(event_id,source,source_key,title,detail,evidence,synthetic,observed_at)
 values(p_event_id,'weather',stamp::text,'Weather conditions',detail,p_reading,false,stamp)
 on conflict(event_id,source,source_key) do nothing returning id into eid;
 if eid is not null then
  insert into public.event_observations(event_id,kind,value,observed_at,reported_by)
  select p_event_id,'weather',left(detail,500),stamp,created_by from public.events where id=p_event_id returning id into oid;
  update public.external_event_signals set observation_id=oid where id=eid;
  if heat>=s.heat_threshold or gust>=s.gust_threshold then
   perform public.notify_event_managers(p_event_id,'weather',eid,'weather:'||p_event_id||':'||date_trunc('hour',stamp)::text,'Weather advisory threshold reached','Review modelled weather, confirm site conditions and consult your event procedures.',false);
  end if;
 end if;
 update public.event_signal_settings set last_success_at=now(),weather_reading=p_reading,last_error=null,lease_until=null where event_id=p_event_id;
end; $$;

-- Demo-only ingestion is explicit and never pretends to be a live platform feed.
create or replace function public.import_demo_social(p_event_id uuid,p_signals jsonb,p_posts jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare x jsonb; eid uuid; oid uuid; kind text; detail text;
begin
 if not public.is_event_manager(p_event_id) then raise exception 'Event unavailable'; end if;
 if jsonb_typeof(p_signals)<>'array' or jsonb_array_length(p_signals)>20 or jsonb_typeof(p_posts)<>'array' or jsonb_array_length(p_posts)>100 or octet_length(p_posts::text)>64000 then raise exception 'Invalid demo feed'; end if;
 for x in select value from jsonb_array_elements(p_signals) loop
  if char_length(x->>'id') not between 1 and 100 or char_length(x->>'summary') not between 1 and 300 or (x->>'reportCount')::integer not between 1 and 100 then raise exception 'Invalid demo signal'; end if;
  kind:=case x->>'category' when 'water' then 'water' when 'crowding' then 'crowd' else 'other' end;
  detail:='DEMO social feed (synthetic, unverified): '||(x->>'summary')||'. Location text: '||coalesce(x->>'zone','Unknown')||'; location has not been confirmed.';
  insert into public.external_event_signals(event_id,source,source_key,title,detail,evidence,synthetic,observed_at)
  values(p_event_id,'demo_social',x->>'id','Demo social signal',detail,jsonb_build_object('signal',x,'posts',p_posts),true,now())
  on conflict(event_id,source,source_key) do nothing returning id into eid;
  if eid is not null then
   insert into public.event_observations(event_id,kind,value,reported_by) values(p_event_id,kind,left(detail,500),auth.uid()) returning id into oid;
   update public.external_event_signals set observation_id=oid where id=eid;
   perform public.notify_event_managers(p_event_id,'social',eid,'social:'||eid,'Demo social signal requires review','Synthetic social posts were imported. Confirm location and facts before taking action.',false);
  end if;
 end loop;
end; $$;
do $$ declare f regprocedure; begin
 foreach f in array array['public.claim_weather_updates(uuid)'::regprocedure,'public.finish_weather_update(uuid,integer,jsonb,text)'::regprocedure] loop
  execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to service_role',f);
 end loop;
 foreach f in array array['public.configure_event_weather(uuid,boolean,double precision,double precision,numeric,numeric)'::regprocedure,'public.event_signal_snapshot(uuid)'::regprocedure,'public.import_demo_social(uuid,jsonb,jsonb)'::regprocedure] loop
  execute format('revoke all on function %s from public,anon',f);execute format('grant execute on function %s to authenticated',f);
 end loop;
end; $$;
commit;
