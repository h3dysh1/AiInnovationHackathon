-- Phases 4–12 foundations. Run after 008; safe to rerun.
begin;
create table if not exists public.event_memberships (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
  user_id uuid not null references auth.users(id), event_role text not null check(event_role in ('coordinator','safety_lead','volunteer')),
  status text not null default 'active' check(status in ('active','inactive')), joined_at timestamptz not null default now(),
  unique(event_id,user_id)
);
create or replace function public.is_event_manager(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.event_memberships
    where event_id=p_event_id and user_id=auth.uid() and status='active' and event_role in ('coordinator','safety_lead'));
$$;
create or replace function public.is_event_member(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.event_memberships
    where event_id=p_event_id and user_id=auth.uid() and status='active');
$$;
revoke all on function public.is_event_manager(uuid), public.is_event_member(uuid) from public, anon;
grant execute on function public.is_event_manager(uuid), public.is_event_member(uuid) to authenticated;
insert into public.event_memberships(event_id,user_id,event_role)
select id,created_by,'coordinator' from public.events on conflict(event_id,user_id) do nothing;
create or replace function public.add_event_owner_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_memberships(event_id,user_id,event_role) values(new.id,new.created_by,'coordinator') on conflict do nothing;
  return new;
end; $$;
drop trigger if exists on_event_owner_membership on public.events;
create trigger on_event_owner_membership after insert on public.events for each row execute function public.add_event_owner_membership();
alter table public.event_memberships enable row level security;
revoke all on public.event_memberships from anon,authenticated;
grant select on public.event_memberships to authenticated;
drop policy if exists "Membership visibility" on public.event_memberships;
create policy "Membership visibility" on public.event_memberships for select to authenticated
  using(user_id=auth.uid() or public.is_event_manager(event_id));
drop policy if exists "Coordinators read own events" on public.events;
drop policy if exists "Event members read events" on public.events;
create policy "Event members read events" on public.events for select to authenticated using(public.is_event_member(id) or created_by=auth.uid());
drop policy if exists "Coordinators edit own events" on public.events;
drop policy if exists "Event managers edit events" on public.events;
create policy "Event managers edit events" on public.events for update to authenticated
  using(public.is_event_manager(id)) with check(public.is_event_manager(id));
-- Publishing is a separate checked RPC; direct lifecycle/status writes end here.
revoke update(status) on public.events from authenticated;
revoke insert on public.events from authenticated;
grant insert(organisation_id,name,description,venue_name,address,start_date,end_date,operating_start_time,operating_end_time,timezone,expected_attendance,status,created_by) on public.events to authenticated;

alter table public.events add column if not exists setup_revision bigint not null default 0;
alter table public.events add column if not exists model_status text not null default 'draft' check(model_status in ('draft','needs_review','verified'));
alter table public.events add column if not exists verified_revision bigint;
alter table public.events add column if not exists verified_at timestamptz;
alter table public.events add column if not exists verified_by uuid references auth.users(id);
alter table public.posts add column if not exists supervisor text check(supervisor is null or char_length(supervisor) between 1 and 120);
alter table public.posts add column if not exists escalation text check(escalation is null or char_length(escalation) between 1 and 300);

create table if not exists public.event_documents (
  id uuid primary key, event_id uuid not null references public.events(id), title text not null check(char_length(title) between 1 and 160),
  document_type text not null check(document_type in ('run_sheet','operations','volunteer_plan','roster','emergency_plan','medical_plan','heat_plan','handbook','other')),
  storage_path text not null unique, original_name text not null, mime_type text not null,
  size_bytes integer not null check(size_bytes between 1 and 10485760), uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now(), include_in_setup boolean not null default true,
  processing_status text not null default 'uploaded' check(processing_status in ('uploaded','processing','ready','failed')),
  processing_error text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  constraint document_path_matches_event check(storage_path like event_id::text || '/' || id::text || '/%')
);
create table if not exists public.post_operating_windows (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id), post_id uuid not null references public.posts(id),
  start_date date not null, end_date date not null, start_time time not null, end_time time not null,
  minimum_coverage integer check(minimum_coverage between 1 and 10000),
  check(end_date>=start_date), check(end_time>start_time), unique(post_id,start_date,end_date,start_time,end_time)
);
create table if not exists public.event_procedures (
  id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id),
  title text not null check(char_length(title) between 1 and 160), content text not null check(char_length(content) between 1 and 10000),
  unique(event_id,title)
);
create table if not exists public.setup_entity_reviews (
  event_id uuid not null references public.events(id),entity_kind text not null check(entity_kind in ('location','post','requirement','window','procedure')),
  entity_id uuid not null, source_type text not null default 'manual',source_id text, source_reference text not null default '',
  confidence numeric check(confidence between 0 and 1), status text not null default 'needs_review' check(status in ('needs_review','confirmed')),
  confirmed_by uuid references auth.users(id),confirmed_at timestamptz,primary key(entity_kind,entity_id)
);
create table if not exists public.setup_change_history (
  id bigint generated always as identity primary key,event_id uuid not null references public.events(id),
  entity_kind text not null,entity_id uuid,previous_data jsonb,next_data jsonb,changed_by uuid,changed_at timestamptz not null default now()
);

create or replace function public.check_operating_window() returns trigger language plpgsql set search_path = '' as $$
declare e public.events; p public.posts;
begin
  select * into e from public.events where id=new.event_id for update;
  select * into p from public.posts where id=new.post_id and event_id=new.event_id;
  if p.id is null or new.start_date<e.start_date or new.end_date>e.end_date then raise exception 'Operating windows must belong to this event and fit its dates'; end if;
  if new.minimum_coverage is not null and exists(select 1 from public.post_requirements where post_id=new.post_id and minimum_count>new.minimum_coverage) then
    raise exception 'Operating-window staffing cannot satisfy the qualifications';
  end if;
  if exists(select 1 from public.post_operating_windows w where w.post_id=new.post_id and w.id<>new.id
    and w.start_date<=new.end_date and w.end_date>=new.start_date and w.start_time<new.end_time and w.end_time>new.start_time) then
    raise exception 'Operating windows for this post overlap';
  end if;
  return new;
end; $$;
drop trigger if exists validate_operating_window on public.post_operating_windows;
create trigger validate_operating_window before insert or update on public.post_operating_windows for each row execute function public.check_operating_window();

-- Any authoritative setup change invalidates verification in the same transaction.
create or replace function public.invalidate_event_model() returns trigger language plpgsql security definer set search_path = '' as $$
declare eid uuid; rid uuid; kind text; old_row jsonb; new_row jsonb;
begin
  if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
  old_row:=case when tg_op='INSERT' then null else to_jsonb(old) end;
  new_row:=case when tg_op='DELETE' then null else to_jsonb(new) end;
  rid:=coalesce((new_row->>'id')::uuid,(old_row->>'id')::uuid);
  if tg_table_name='post_requirements' then
    select event_id into eid from public.posts where id=coalesce((new_row->>'post_id')::uuid,(old_row->>'post_id')::uuid);kind:='requirement';
  else
    eid:=coalesce((new_row->>'event_id')::uuid,(old_row->>'event_id')::uuid);
    kind:=case tg_table_name when 'locations' then 'location' when 'posts' then 'post' when 'post_operating_windows' then 'window' when 'event_procedures' then 'procedure' else tg_table_name end;
  end if;
  -- Processing progress/review metadata does not alter document contents.
  if tg_table_name='event_documents' and tg_op='UPDATE' then
    if new.include_in_setup=old.include_in_setup then return new; end if;
  end if;
  if tg_table_name='event_setup_sessions' and tg_op='UPDATE' then
    if new.description=old.description then return new; end if;
  end if;
  update public.events set setup_revision=setup_revision+1,model_status='needs_review',verified_at=null,verified_by=null,verified_revision=null where id=eid;
  if tg_table_name in ('event_documents','event_setup_sessions') then
    update public.setup_entity_reviews set status='needs_review',confirmed_by=null,confirmed_at=null where event_id=eid and entity_kind in ('post','requirement','window','procedure');
  end if;
  if kind in ('location','post','requirement','window','procedure') then
    if tg_op='DELETE' then delete from public.setup_entity_reviews where entity_kind=kind and entity_id=rid;
    else
      if tg_op='UPDATE' then
        insert into public.setup_change_history(event_id,entity_kind,entity_id,previous_data,changed_by)
         select eid,'source_before_edit',rid,to_jsonb(r),auth.uid() from public.setup_entity_reviews r where entity_kind=kind and entity_id=rid;
      end if;
      insert into public.setup_entity_reviews(event_id,entity_kind,entity_id)
      values(eid,kind,rid) on conflict(entity_kind,entity_id) do update set status='needs_review',confirmed_by=null,confirmed_at=null,
       source_type='manual',source_id=null,source_reference='Edited manually',confidence=1;
    end if;
  end if;
  if kind in ('requirement','window') then
    update public.setup_entity_reviews set status='needs_review',confirmed_by=null,confirmed_at=null
     where entity_kind='post' and entity_id=coalesce((new_row->>'post_id')::uuid,(old_row->>'post_id')::uuid);
  end if;
  insert into public.setup_change_history(event_id,entity_kind,entity_id,previous_data,next_data,changed_by) values(eid,kind,rid,old_row,new_row,auth.uid());
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
do $$ declare tab text; begin
  foreach tab in array array['locations','posts','post_requirements','post_operating_windows','event_procedures','event_documents','event_setup_sessions'] loop
    execute format('drop trigger if exists invalidate_setup on public.%I',tab);
    execute format('create trigger invalidate_setup after insert or update or delete on public.%I for each row execute function public.invalidate_event_model()',tab);
  end loop;
end; $$;
create or replace function public.invalidate_event_details() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.name,new.description,new.venue_name,new.address,new.start_date,new.end_date,new.operating_start_time,new.operating_end_time,new.timezone,new.expected_attendance)
    is distinct from (old.name,old.description,old.venue_name,old.address,old.start_date,old.end_date,old.operating_start_time,old.operating_end_time,old.timezone,old.expected_attendance) then
    new.setup_revision:=old.setup_revision+1;new.model_status:='needs_review';new.verified_revision:=null;new.verified_at:=null;new.verified_by:=null;
    if (new.venue_name,new.address,new.start_date,new.end_date,new.operating_start_time,new.operating_end_time,new.timezone)
      is distinct from (old.venue_name,old.address,old.start_date,old.end_date,old.operating_start_time,old.operating_end_time,old.timezone) then
      update public.setup_entity_reviews set status='needs_review',confirmed_by=null,confirmed_at=null where event_id=new.id and entity_kind in ('post','requirement','window','procedure');
    end if;
  end if;return new;
end; $$;
drop trigger if exists invalidate_event_details on public.events;
create trigger invalidate_event_details before update on public.events for each row execute function public.invalidate_event_details();
insert into public.setup_entity_reviews(event_id,entity_kind,entity_id)
select event_id,'location',id from public.locations union all select event_id,'post',id from public.posts
union all select p.event_id,'requirement',r.id from public.post_requirements r join public.posts p on p.id=r.post_id
on conflict do nothing;

-- Replace creator-only policies with event-role permissions on operational data.
do $$ declare tab text; pol record; begin
  foreach tab in array array['event_maps','locations','posts','zones','event_setup_sessions','event_site_settings','event_documents','post_operating_windows','event_procedures'] loop
    execute format('alter table public.%I enable row level security',tab);
    for pol in select policyname from pg_policies where schemaname='public' and tablename=tab loop execute format('drop policy %I on public.%I',pol.policyname,tab);end loop;
    execute format('create policy "Event manager access" on public.%I for all to authenticated using(public.is_event_manager(event_id)) with check(public.is_event_manager(event_id))',tab);
  end loop;
  foreach tab in array array['setup_entity_reviews','setup_change_history'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('drop policy if exists "Manager reads review state" on public.%I',tab);
    execute format('create policy "Manager reads review state" on public.%I for select to authenticated using(public.is_event_manager(event_id))',tab);
  end loop;
end; $$;
revoke all on public.event_documents,public.post_operating_windows,public.event_procedures,public.setup_entity_reviews,public.setup_change_history from anon,authenticated;
grant select on public.event_documents to authenticated;
grant insert(id,event_id,title,document_type,storage_path,original_name,mime_type,size_bytes,uploaded_by) on public.event_documents to authenticated;
grant update(include_in_setup) on public.event_documents to authenticated;
grant select,insert,delete on public.post_operating_windows,public.event_procedures to authenticated;
grant update(start_date,end_date,start_time,end_time,minimum_coverage) on public.post_operating_windows to authenticated;
grant update(title,content) on public.event_procedures to authenticated;
revoke update on public.locations,public.posts,public.post_requirements from authenticated;
grant update(name,description,map_x,map_y,map_radius_percent) on public.locations to authenticated;
grant update(name,description,minimum_coverage,criticality,instructions,map_x,map_y,map_radius_percent,check_in_x,check_in_y,check_in_radius_percent) on public.posts to authenticated;
grant update(certification_type,experience_requirement,minimum_count) on public.post_requirements to authenticated;
grant select on public.setup_entity_reviews,public.setup_change_history to authenticated;
grant update(supervisor,escalation) on public.posts to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('event-documents','event-documents',false,10485760,array['application/pdf','text/plain','text/markdown','text/csv','text/tab-separated-values','image/jpeg','image/png']) on conflict(id) do nothing;
drop policy if exists "Manager document files" on storage.objects;
create policy "Manager document files" on storage.objects for all to authenticated
  using(bucket_id='event-documents' and public.is_event_manager((storage.foldername(storage.objects.name))[1]::uuid))
  with check(bucket_id='event-documents' and public.is_event_manager((storage.foldername(storage.objects.name))[1]::uuid));
-- Stored originals are immutable. No table DELETE grant; upload cleanup may
-- remove only a file that has no authoritative metadata record.
drop policy if exists "Manager document files" on storage.objects;
drop policy if exists "Managers read document files" on storage.objects;
create policy "Managers read document files" on storage.objects for select to authenticated
  using(bucket_id='event-documents' and public.is_event_manager((storage.foldername(storage.objects.name))[1]::uuid));
drop policy if exists "Managers upload document files" on storage.objects;
create policy "Managers upload document files" on storage.objects for insert to authenticated
  with check(bucket_id='event-documents' and public.is_event_manager((storage.foldername(storage.objects.name))[1]::uuid));
drop policy if exists "Managers clean unused document files" on storage.objects;
create policy "Managers clean unused document files" on storage.objects for delete to authenticated
  using(bucket_id='event-documents' and public.is_event_manager((storage.foldername(storage.objects.name))[1]::uuid)
    and not exists(select 1 from public.event_documents d where d.storage_path=storage.objects.name));
-- Upgrade map RPC authorization while retaining their revision guards.
do $$ declare f regprocedure; body text; begin
  foreach f in array array[
    'public.get_site_structure(uuid)'::regprocedure,
    'public.set_site_pin(uuid,text,uuid,text,numeric,numeric)'::regprocedure,
    'public.save_location_post(uuid,text,uuid,text,boolean,text,text,numeric,numeric,numeric,uuid,numeric,numeric,numeric)'::regprocedure,
    'public.save_map_item(uuid,text,uuid,text,boolean,text,text,numeric,numeric,numeric,uuid,text,uuid,numeric,numeric,numeric)'::regprocedure
  ] loop
    select pg_get_functiondef(f) into body;
    body:=replace(body,'e.created_by = auth.uid()','public.is_event_manager(p_event_id)');
    execute body;
  end loop;
end; $$;
drop policy if exists "Coordinator reads own map files" on storage.objects;
drop policy if exists "Coordinator uploads own map files" on storage.objects;
drop policy if exists "Coordinator removes own map files" on storage.objects;
drop policy if exists "Managers read map files" on storage.objects;
drop policy if exists "Managers upload map files" on storage.objects;
drop policy if exists "Managers clean map files" on storage.objects;
create policy "Managers read map files" on storage.objects for select to authenticated using(bucket_id='site-maps' and public.is_event_manager((storage.foldername(storage.objects.name))[1]::uuid));
create policy "Managers upload map files" on storage.objects for insert to authenticated with check(bucket_id='site-maps' and public.is_event_manager((storage.foldername(storage.objects.name))[1]::uuid));
create policy "Managers clean map files" on storage.objects for delete to authenticated using(bucket_id='site-maps' and public.is_event_manager((storage.foldername(storage.objects.name))[1]::uuid));

-- Qualification edits must fit every operating window as well as base coverage.
create or replace function public.check_requirement_coverage() returns trigger language plpgsql set search_path='' as $$
declare coverage integer;eid uuid;
begin
 select event_id into eid from public.posts where id=new.post_id;
 perform 1 from public.events where id=eid for update;
 select minimum_coverage into coverage from public.posts where id=new.post_id for update;
 if new.minimum_count>coverage or exists(select 1 from public.post_operating_windows where post_id=new.post_id and minimum_coverage<new.minimum_count) then
 raise exception 'Requirement count cannot exceed coverage in any operating period';end if;
 return new;
end; $$;
do $$ declare pol record; begin
 for pol in select policyname from pg_policies where schemaname='public' and tablename='post_requirements' loop
  execute format('drop policy %I on public.post_requirements',pol.policyname);end loop;
end; $$;
create policy "Event manager requirements" on public.post_requirements for all to authenticated
 using(exists(select 1 from public.posts p where p.id=post_id and public.is_event_manager(p.event_id)))
 with check(exists(select 1 from public.posts p where p.id=post_id and public.is_event_manager(p.event_id)));
drop policy if exists "Document uploader identity" on public.event_documents;
create policy "Document uploader identity" on public.event_documents as restrictive for insert to authenticated with check(uploaded_by=auth.uid());

commit;
