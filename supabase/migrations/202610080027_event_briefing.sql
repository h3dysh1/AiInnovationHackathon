begin;
alter table public.events add column if not exists approximate_workforce integer check(approximate_workforce between 1 and 1000000);
grant insert(approximate_workforce),update(approximate_workforce) on public.events to authenticated;
create table if not exists public.event_acknowledgements(event_id uuid not null references public.events(id),user_id uuid not null references auth.users(id),setup_revision bigint not null,acknowledged_at timestamptz not null default now(),primary key(event_id,user_id));
alter table public.event_acknowledgements enable row level security;
revoke all on public.event_acknowledgements from public,anon,authenticated;
create or replace function public.event_briefing(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_member(p_event_id) then raise exception 'Event unavailable';end if;
 return jsonb_build_object('revision',(select setup_revision from public.events where id=p_event_id),'procedures',coalesce((select jsonb_agg(jsonb_build_object('title',title,'content',content)) from public.event_procedures where event_id=p_event_id),'[]'),'acknowledged',exists(select 1 from public.event_acknowledgements a join public.events e on e.id=a.event_id where a.event_id=p_event_id and a.user_id=auth.uid() and a.setup_revision=e.setup_revision));
end; $$;
create or replace function public.acknowledge_event_briefing(p_event_id uuid,p_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_member(p_event_id) then raise exception 'Event unavailable';end if;
 perform 1 from public.events where id=p_event_id and setup_revision=p_revision for share;
 if not found then raise exception 'Briefing changed; review the latest procedures';end if;
 insert into public.event_acknowledgements(event_id,user_id,setup_revision) values(p_event_id,auth.uid(),p_revision) on conflict(event_id,user_id) do update set setup_revision=excluded.setup_revision,acknowledged_at=now();
end; $$;
revoke all on function public.event_briefing(uuid),public.acknowledge_event_briefing(uuid,bigint) from public,anon;
grant execute on function public.event_briefing(uuid),public.acknowledge_event_briefing(uuid,bigint) to authenticated;
create or replace function public.publish_roster(p_roster_id uuid,p_revision bigint,p_staffing_revision bigint) returns void language plpgsql security definer set search_path='' as $$ declare r public.rosters;ready jsonb;
begin select * into r from public.rosters where id=p_roster_id;
if r.status='published' and r.revision=p_revision+1 and public.is_event_manager(r.event_id) then return;end if;
r:=public.lock_roster_draft(p_roster_id,p_revision);
perform 1 from public.profiles where id in(select user_id from public.assignments where roster_id=r.id) order by id for update;
if (select staffing_revision from public.events where id=r.event_id)<>p_staffing_revision then raise exception 'Volunteer inputs changed. Review coverage again';end if;
ready:=public.get_roster_readiness(r.id);if not (ready->>'ready')::boolean then raise exception 'Resolve roster coverage and assignment issues before publishing';end if;
update public.rosters set status='superseded' where event_id=r.event_id and status='published';update public.rosters set status='published',published_at=now(),published_by=auth.uid(),revision=revision+1 where id=r.id;
update public.events set status=case when status='live' then 'live' else 'published' end where id=r.event_id;
insert into public.setup_change_history(event_id,entity_kind,entity_id,next_data,changed_by) values(r.event_id,'roster_published',r.id,ready,auth.uid());end; $$;
commit;
