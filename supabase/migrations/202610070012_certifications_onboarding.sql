-- Phases 13–15. Reusable certificates and event-specific volunteer onboarding.
begin;
alter table public.events add column if not exists staffing_revision bigint not null default 0;
create table if not exists public.certifications(
 id uuid primary key,user_id uuid not null references auth.users(id),title text not null check(char_length(title) between 1 and 160),
 storage_path text not null unique,mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),size_bytes integer not null check(size_bytes between 1 and 10485760),
 status text not null default 'uploaded' check(status in ('uploaded','processing','verified','requires_review','expired','rejected','failed','archived')),
 type text,holder_name text,certificate_number text,issuer text,issued_at date,expires_at date,never_expires boolean not null default false,
 extraction_confidence numeric check(extraction_confidence between 0 and 1),extraction jsonb,verification_notes text,reviewed_by uuid references auth.users(id),reviewed_at timestamptz,
 attempt integer not null default 0,processing_started_at timestamptz,error_message text,uploaded_at timestamptz not null default now(),
 check(storage_path like user_id::text||'/'||id::text||'/%'),check(issued_at is null or expires_at is null or expires_at>=issued_at)
);
create table if not exists public.event_volunteer_preferences(
 event_id uuid not null references public.events(id),user_id uuid not null references auth.users(id),
 preferred_posts uuid[] not null default '{}',avoided_posts uuid[] not null default '{}',preferred_start time,preferred_end time,
 desired_hours numeric not null default 8 check(desired_hours>=0),maximum_hours numeric not null default 40 check(maximum_hours between 1 and 10000),maximum_daily_hours numeric not null default 8 check(maximum_daily_hours between 1 and 24),
 experience_tags text[] not null default '{}',experience_reviewed boolean not null default false,experience_reviewed_by uuid references auth.users(id),submitted_at timestamptz not null default now(),
 primary key(event_id,user_id),check(desired_hours<=maximum_hours),check(maximum_daily_hours<=maximum_hours),check((preferred_start is null)=(preferred_end is null)),check(preferred_end is null or preferred_end>preferred_start)
);
create table if not exists public.volunteer_availability(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id),user_id uuid not null references auth.users(id),starts_at timestamptz not null,ends_at timestamptz not null,
 check(ends_at>starts_at),unique(event_id,user_id,starts_at,ends_at)
);
create index if not exists availability_event_user on public.volunteer_availability(event_id,user_id);
create index if not exists certifications_user on public.certifications(user_id);
create or replace function public.can_review_volunteer(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.event_memberships m where m.user_id=p_user_id and m.status='active' and public.is_event_manager(m.event_id));
$$;
revoke all on function public.can_review_volunteer(uuid) from public,anon;grant execute on function public.can_review_volunteer(uuid) to authenticated;
alter table public.certifications enable row level security;alter table public.event_volunteer_preferences enable row level security;alter table public.volunteer_availability enable row level security;
revoke all on public.certifications,public.event_volunteer_preferences,public.volunteer_availability from anon,authenticated;
grant select on public.certifications,public.event_volunteer_preferences,public.volunteer_availability to authenticated;
grant insert(id,user_id,title,storage_path,mime_type,size_bytes) on public.certifications to authenticated;
drop policy if exists "Certificate visibility" on public.certifications;create policy "Certificate visibility" on public.certifications for select to authenticated using(user_id=auth.uid() or public.can_review_volunteer(user_id));
drop policy if exists "Own original certificates" on public.certifications;create policy "Own original certificates" on public.certifications for insert to authenticated with check(user_id=auth.uid());
drop policy if exists "Event onboarding visibility" on public.event_volunteer_preferences;create policy "Event onboarding visibility" on public.event_volunteer_preferences for select to authenticated using(user_id=auth.uid() or public.is_event_manager(event_id));
drop policy if exists "Event availability visibility" on public.volunteer_availability;create policy "Event availability visibility" on public.volunteer_availability for select to authenticated using(user_id=auth.uid() or public.is_event_manager(event_id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('certificates','certificates',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
drop policy if exists "Read qualification evidence" on storage.objects;create policy "Read qualification evidence" on storage.objects for select to authenticated using(bucket_id='certificates' and ((storage.foldername(name))[1]=auth.uid()::text or public.can_review_volunteer((storage.foldername(name))[1]::uuid)));
drop policy if exists "Upload own qualification evidence" on storage.objects;create policy "Upload own qualification evidence" on storage.objects for insert to authenticated with check(bucket_id='certificates' and (storage.foldername(name))[1]=auth.uid()::text);
-- Referenced evidence cannot be deleted or overwritten, including after archiving.
drop policy if exists "Clean unused qualification uploads" on storage.objects;create policy "Clean unused qualification uploads" on storage.objects for delete to authenticated using(bucket_id='certificates' and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from public.certifications c where c.storage_path=storage.objects.name));
create or replace function public.touch_staffing_input() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new;end if;
 if tg_table_name='certifications' or tg_table_name='volunteer_profiles' then
 update public.events set staffing_revision=staffing_revision+1 where id in (select event_id from public.event_memberships where user_id=coalesce(new.user_id,old.user_id) and status='active');
 else update public.events set staffing_revision=staffing_revision+1 where id=coalesce(new.event_id,old.event_id);end if;
 if tg_op='DELETE' then return old;end if;return new;
end; $$;
do $$ declare t text;begin foreach t in array array['certifications','event_volunteer_preferences','volunteer_availability','volunteer_profiles'] loop
 execute format('drop trigger if exists staffing_input_changed on public.%I',t);execute format('create trigger staffing_input_changed after insert or update or delete on public.%I for each row execute function public.touch_staffing_input()',t);end loop;end; $$;
create or replace function public.qualification_key(p_text text) returns text language sql immutable set search_path='' as $$
 select case regexp_replace(lower(p_text),'[^a-z0-9]','','g') when 'providefirstaid' then 'firstaid' when 'hltaid011' then 'firstaid' when 'hltaid011providefirstaid' then 'firstaid' when 'hltaid009' then 'cpr' when 'providecardiopulmonaryresuscitation' then 'cpr' when 'hltaid009providecardiopulmonaryresuscitation' then 'cpr' else regexp_replace(lower(p_text),'[^a-z0-9]','','g') end;
$$;
create or replace function public.claim_certificate_processing(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.certifications;
begin
 select * into c from public.certifications where id=p_id for update;
 if c.user_id is distinct from auth.uid() then raise exception 'Certificate unavailable';end if;
 if c.status in ('verified','expired','archived','rejected') or (c.status='processing' and c.processing_started_at>now()-interval '4 minutes') then return null;end if;
 update public.certifications set status='processing',attempt=attempt+1,processing_started_at=now(),error_message=null where id=p_id returning * into c;
 return to_jsonb(c)||jsonb_build_object('display_name',(select display_name from public.profiles where id=c.user_id));
end; $$;
create or replace function public.finish_certificate_processing(p_id uuid,p_attempt integer,p_fields jsonb,p_error text) returns void language plpgsql security definer set search_path='' as $$
declare c public.certifications; matching boolean; reliable boolean; name text;
begin
 select * into c from public.certifications where id=p_id for update;
 if c.id is null then raise exception 'Certificate unavailable';end if;
 if c.attempt<>p_attempt or c.status<>'processing' then return;end if;
 if p_error is not null then update public.certifications set status='failed',error_message=left(p_error,1000) where id=p_id;return;end if;
 select display_name into name from public.profiles where id=c.user_id;
 matching:=length(regexp_replace(lower(name),'[^a-z0-9]','','g'))>0 and regexp_replace(lower(name),'[^a-z0-9]','','g')=regexp_replace(lower(p_fields->>'holderName'),'[^a-z0-9]','','g');
 reliable:=matching and (p_fields->>'confidence')::numeric>=0.9 and length(trim(p_fields->>'type'))>0 and p_fields->>'issuedAt' is not null and p_fields->>'expiresAt' is not null and (p_fields->>'issuedAt')::date<=current_date;
 update public.certifications set extraction=p_fields,type=left(p_fields->>'type',120),holder_name=left(p_fields->>'holderName',120),certificate_number=left(p_fields->>'certificateNumber',160),issuer=left(p_fields->>'issuer',200),issued_at=(p_fields->>'issuedAt')::date,expires_at=(p_fields->>'expiresAt')::date,extraction_confidence=(p_fields->>'confidence')::numeric,
 status=case when reliable then case when (p_fields->>'expiresAt')::date<current_date then 'expired' else 'verified' end else 'requires_review' end,
 verification_notes=case when reliable then 'Accepted by deterministic holder, confidence and date checks; event validity is checked separately.' else 'Human review required: check holder, type, dates and extraction confidence against the original.' end,error_message=null where id=p_id;
end; $$;
-- Finalization is restricted to the authenticated backend worker's service role.
revoke all on function public.finish_certificate_processing(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_certificate_processing(uuid,integer,jsonb,text) to service_role;
-- The worker verifies the owner before claiming with their JWT.
create or replace function public.review_certification(p_id uuid,p_fields jsonb,p_never_expires boolean,p_accept boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare c public.certifications;
begin select * into c from public.certifications where id=p_id for update;
 if c.id is null or not public.can_review_volunteer(c.user_id) or c.user_id=auth.uid() then raise exception 'Another event coordinator or safety lead must review this certificate';end if;
 if p_note is null or char_length(trim(p_note)) not between 1 and 2000 then raise exception 'Record your review of the original certificate';end if;
 if p_accept and (p_fields->>'type' is null or char_length(trim(p_fields->>'type')) not between 1 and 120 or p_fields->>'holderName' is null or (p_fields->>'expiresAt' is null and not p_never_expires)) then raise exception 'Complete type, holder and expiry (or explicitly confirm no expiry)';end if;
 if p_accept and regexp_replace(lower(p_fields->>'holderName'),'[^a-z0-9]','','g') is distinct from (select regexp_replace(lower(display_name),'[^a-z0-9]','','g') from public.profiles where id=c.user_id) then raise exception 'The holder must match the volunteer. Resolve the identity difference first';end if;
 update public.certifications set type=left(p_fields->>'type',120),holder_name=left(p_fields->>'holderName',120),certificate_number=left(p_fields->>'certificateNumber',160),issuer=left(p_fields->>'issuer',200),issued_at=(p_fields->>'issuedAt')::date,expires_at=(p_fields->>'expiresAt')::date,never_expires=p_never_expires,status=case when p_accept then 'verified' else 'rejected' end,verification_notes=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),error_message=null where id=p_id;
end; $$;
create or replace function public.archive_certification(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin update public.certifications set status='archived' where id=p_id and user_id=auth.uid();if not found then raise exception 'Certificate unavailable';end if;end; $$;
create or replace function public.save_event_onboarding(p_event_id uuid,p_windows jsonb,p_preferences jsonb) returns void language plpgsql security definer set search_path='' as $$
declare e public.events;w jsonb;s timestamptz;t timestamptz;ids uuid[];avoided uuid[];tags text[];
begin
 if not public.is_event_member(p_event_id) then raise exception 'Join this event first';end if;
 select * into e from public.events where id=p_event_id for update;
 if jsonb_typeof(p_windows) is distinct from 'array' or jsonb_array_length(p_windows)>100 then raise exception 'Use at most 100 availability windows';end if;
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p_preferences->'preferredPosts');
 select coalesce(array_agg(value::uuid),'{}') into avoided from jsonb_array_elements_text(p_preferences->'avoidedPosts');
 select coalesce(array_agg(trim(value)),'{}') into tags from jsonb_array_elements_text(p_preferences->'experienceTags');
 if cardinality(tags)>20 or exists(select 1 from unnest(tags) tag where char_length(tag) not between 1 and 120) then raise exception 'Use up to 20 experience labels';end if;
 if ids&&avoided or exists(select 1 from unnest(ids||avoided) pid where not exists(select 1 from public.posts where id=pid and event_id=e.id)) then raise exception 'Choose distinct preferences from this event’s posts';end if;
 insert into public.event_volunteer_preferences(event_id,user_id,preferred_posts,avoided_posts,preferred_start,preferred_end,desired_hours,maximum_hours,maximum_daily_hours,experience_tags)
 values(e.id,auth.uid(),ids,avoided,nullif(p_preferences->>'preferredStart','')::time,nullif(p_preferences->>'preferredEnd','')::time,(p_preferences->>'desiredHours')::numeric,(p_preferences->>'maximumHours')::numeric,(p_preferences->>'maximumDailyHours')::numeric,tags)
 on conflict(event_id,user_id) do update set preferred_posts=excluded.preferred_posts,avoided_posts=excluded.avoided_posts,preferred_start=excluded.preferred_start,preferred_end=excluded.preferred_end,desired_hours=excluded.desired_hours,maximum_hours=excluded.maximum_hours,maximum_daily_hours=excluded.maximum_daily_hours,experience_tags=excluded.experience_tags,experience_reviewed=case when public.event_volunteer_preferences.experience_tags=excluded.experience_tags then public.event_volunteer_preferences.experience_reviewed else false end,submitted_at=now();
 delete from public.volunteer_availability where event_id=e.id and user_id=auth.uid();
 for w in select value from jsonb_array_elements(p_windows) loop
 s:=((w->>'startDate')::date+(w->>'startTime')::time) at time zone e.timezone;t:=((w->>'endDate')::date+(w->>'endTime')::time) at time zone e.timezone;
 if s is null or t is null or s>=t or (s at time zone e.timezone)::date<e.start_date or (t at time zone e.timezone)::date>e.end_date then raise exception 'Availability must be a valid period within this event';end if;
 if to_char(s at time zone e.timezone,'YYYY-MM-DD HH24:MI')<>(w->>'startDate')||' '||(w->>'startTime') or to_char(t at time zone e.timezone,'YYYY-MM-DD HH24:MI')<>(w->>'endDate')||' '||(w->>'endTime') then raise exception 'This local time does not exist due to a timezone clock change';end if;
 insert into public.volunteer_availability(event_id,user_id,starts_at,ends_at) values(e.id,auth.uid(),s,t) on conflict do nothing;
 end loop;
end; $$;
create or replace function public.event_onboarding_context(p_event_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin if not public.is_event_member(p_event_id) then raise exception 'Join this event first';end if;
 return jsonb_build_object('posts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'location_name',l.name)) from public.posts p join public.locations l on l.id=p.location_id where p.event_id=p_event_id),'[]'::jsonb),'preferences',(select to_jsonb(p) from public.event_volunteer_preferences p where event_id=p_event_id and user_id=auth.uid()),'availability',coalesce((select jsonb_agg(to_jsonb(a) order by starts_at) from public.volunteer_availability a where event_id=p_event_id and user_id=auth.uid()),'[]'::jsonb));end; $$;
create or replace function public.review_event_experience(p_event_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not public.is_event_manager(p_event_id) or p_user_id=auth.uid() then raise exception 'Another event manager must review experience';end if;
 update public.event_volunteer_preferences set experience_reviewed=true,experience_reviewed_by=auth.uid() where event_id=p_event_id and user_id=p_user_id;
 if not found then raise exception 'Volunteer onboarding is missing';end if;end; $$;
do $$ declare f regprocedure;begin foreach f in array array['public.claim_certificate_processing(uuid)'::regprocedure,'public.review_certification(uuid,jsonb,boolean,boolean,text)'::regprocedure,'public.archive_certification(uuid)'::regprocedure,'public.save_event_onboarding(uuid,jsonb,jsonb)'::regprocedure,'public.event_onboarding_context(uuid)'::regprocedure,'public.review_event_experience(uuid,uuid)'::regprocedure] loop execute format('revoke all on function %s from public,anon',f);execute format('grant execute on function %s to authenticated',f);end loop;end; $$;
commit;
