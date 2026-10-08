begin;

-- Extraction proposes facts. Only an authorised human review verifies evidence.
create or replace function public.finish_certificate_processing(p_id uuid,p_attempt integer,p_fields jsonb,p_error text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.certifications;
begin
 select * into c from public.certifications where id=p_id for update;
 if c.id is null then raise exception 'Certificate unavailable'; end if;
 if c.attempt<>p_attempt or c.status<>'processing' then return; end if;
 if p_error is not null then
  update public.certifications set status='failed',error_message=left(p_error,1000) where id=p_id;
  return;
 end if;
 update public.certifications set extraction=p_fields,type=left(p_fields->>'type',120),
 holder_name=left(p_fields->>'holderName',120),certificate_number=left(p_fields->>'certificateNumber',160),
 issuer=left(p_fields->>'issuer',200),issued_at=(p_fields->>'issuedAt')::date,
 expires_at=(p_fields->>'expiresAt')::date,extraction_confidence=(p_fields->>'confidence')::numeric,
 never_expires=false,status='requires_review',reviewed_by=null,reviewed_at=null,
 verification_notes='AI extracted these details. An event coordinator or safety lead must review the original and approve the certificate.',
 error_message=null where id=p_id;
end; $$;
revoke all on function public.finish_certificate_processing(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_certificate_processing(uuid,integer,jsonb,text) to service_role;

-- Apply the same approval requirement to earlier automatic acceptances.
-- Originals, extraction and immutable audit history are preserved.
update public.certifications set status='requires_review',
 verification_notes='Previously accepted by automated checks. Human review of the original is now required.'
where status in ('verified','expired') and reviewed_at is null;

create table if not exists public.certificate_attention_state (
 event_id uuid not null references public.events(id), certificate_id uuid not null references public.certifications(id),
 fingerprint text, episode bigint not null default 0, primary key(event_id,certificate_id)
);
alter table public.certificate_attention_state enable row level security;
revoke all on public.certificate_attention_state from public,anon,authenticated;

create or replace function public.refresh_certificate_attention(p_event_id uuid,p_certificate_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.certifications; e public.events; volunteer_name text; reasons text[]:='{}';
 warning boolean:=false; notification_key text; v_fingerprint text; previous public.certificate_attention_state;
begin
 select * into c from public.certifications where id=p_certificate_id;
 select * into e from public.events where id=p_event_id;
 if c.id is null or e.id is null then return; end if;
 if e.end_date>=current_date and e.status<>'completed'
 and c.status not in ('archived','rejected')
 and (c.status not in ('uploaded','processing') or c.extraction is not null)
 and exists(select 1 from public.event_memberships where event_id=e.id and user_id=c.user_id and status='active') then
  if c.issued_at>e.start_date then
   reasons:=array_append(reasons,format('Issued %s, after the event starts %s.',c.issued_at,e.start_date)); warning:=true;
  end if;
  if c.expires_at<e.start_date then
   reasons:=array_append(reasons,format('Expires %s, before the event starts %s.',c.expires_at,e.start_date)); warning:=true;
  elsif c.expires_at<e.end_date then
   reasons:=array_append(reasons,format('Expires %s, during the event (%s to %s).',c.expires_at,e.start_date,e.end_date)); warning:=true;
  elsif c.expires_at is null and not c.never_expires then
   reasons:=array_append(reasons,'Expiry unknown; check the original.'); warning:=true;
  end if;
  if c.status='failed' then
   reasons:=array_append(reasons,'AI processing failed; original evidence is saved for manual review.');
  elsif c.status in ('requires_review','uploaded','processing') then
   reasons:=array_append(reasons,'Human approval required; check extracted details against the original.');
  end if;
 end if;
 if cardinality(reasons)>0 then
  v_fingerprint:=md5(array_to_string(reasons,' ')||coalesce(c.type,'')||coalesce(c.holder_name,'')||coalesce(c.extraction_confidence::text,'')||e.start_date::text||e.end_date::text);
 end if;
 insert into public.certificate_attention_state(event_id,certificate_id) values(e.id,c.id) on conflict do nothing;
 select * into previous from public.certificate_attention_state where event_id=e.id and certificate_id=c.id for update;
 if previous.fingerprint is distinct from v_fingerprint then
  update public.certificate_attention_state set fingerprint=v_fingerprint,episode=episode+1
  where event_id=e.id and certificate_id=c.id returning * into previous;
 end if;
 if v_fingerprint is not null then notification_key:='certificate:'||e.id||':'||c.id||':'||previous.episode; end if;
 -- Superseded warnings stay in the inbox history but stop claiming attention.
 update public.operational_notifications set read_at=coalesce(read_at,now())
 where event_id=e.id and kind='certificate' and source_id=c.id
 and (notification_key is null or dedupe_key<>notification_key);
 update public.push_deliveries d set status='cancelled',updated_at=now()
 from public.operational_notifications n where n.id=d.notification_id and n.event_id=e.id
 and n.kind='certificate' and n.source_id=c.id and n.read_at is not null and d.status in ('queued','sending');
 if notification_key is null then return; end if;
 select display_name into volunteer_name from public.profiles where id=c.user_id;
 perform public.notify_event_managers(e.id,'certificate',c.id,notification_key,
  case when warning then 'Certificate date warning' else 'Certificate needs approval' end,
  format('%s · %s: %s Open Crew qualifications to review.',coalesce(volunteer_name,'Volunteer'),coalesce(c.type,c.title),array_to_string(reasons,' ')),false);
end; $$;

create or replace function public.certificate_attention_on_certificate() returns trigger
language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 for eid in select distinct event_id from public.event_memberships where user_id=new.user_id and status='active'
 union select event_id from public.operational_notifications where kind='certificate' and source_id=new.id loop
  perform public.refresh_certificate_attention(eid,new.id);
 end loop;
 return new;
end; $$;
drop trigger if exists certificate_attention_certificate on public.certifications;
create trigger certificate_attention_certificate after insert or update on public.certifications
for each row execute function public.certificate_attention_on_certificate();

create or replace function public.refresh_event_certificate_attention(p_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 for cid in select c.id from public.certifications c where exists(
  select 1 from public.event_memberships m where m.event_id=p_event_id and m.user_id=c.user_id and m.status='active')
 union select source_id from public.operational_notifications where event_id=p_event_id and kind='certificate' loop
  perform public.refresh_certificate_attention(p_event_id,cid);
 end loop;
end; $$;
create or replace function public.certificate_attention_on_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.refresh_event_certificate_attention(new.id); return new;
end; $$;
drop trigger if exists certificate_attention_event on public.events;
create trigger certificate_attention_event after update of start_date,end_date,status on public.events
for each row when (old.start_date is distinct from new.start_date or old.end_date is distinct from new.end_date or old.status is distinct from new.status)
execute function public.certificate_attention_on_event();

create or replace function public.certificate_attention_on_membership() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.refresh_event_certificate_attention(new.event_id); return new;
end; $$;
drop trigger if exists certificate_attention_membership on public.event_memberships;
create trigger certificate_attention_membership after insert or update of status,event_role on public.event_memberships
for each row execute function public.certificate_attention_on_membership();

do $$ declare f regprocedure; eid uuid; begin
 foreach f in array array[
  'public.refresh_certificate_attention(uuid,uuid)'::regprocedure,
  'public.refresh_event_certificate_attention(uuid)'::regprocedure,
  'public.certificate_attention_on_certificate()'::regprocedure,
  'public.certificate_attention_on_event()'::regprocedure,
  'public.certificate_attention_on_membership()'::regprocedure
 ] loop execute format('revoke all on function %s from public,anon,authenticated',f); end loop;
 for eid in select id from public.events where end_date>=current_date and status<>'completed' loop
  perform public.refresh_event_certificate_attention(eid);
 end loop;
end; $$;
commit;
