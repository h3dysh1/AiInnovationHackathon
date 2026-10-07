-- Verification, recruitment publishing and event-role joining. After 010.
begin;
create or replace function public.get_event_readiness(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events;p public.posts;i jsonb:='[]'::jsonb;n integer;t integer;
begin
 if not public.is_event_manager(p_event_id) then raise exception 'You cannot review this event';end if;
 select * into e from public.events where id=p_event_id for share;
 if not exists(select 1 from public.posts where event_id=e.id) then i:=i||jsonb_build_array(jsonb_build_object('code','no_posts','message','Add at least one staffed task.'));end if;
 for p in select * from public.posts where event_id=e.id loop
  if p.supervisor is null or not length(trim(p.supervisor))>0 then i:=i||jsonb_build_array(jsonb_build_object('code','supervisor','entityId',p.id,'message',p.name||': add a supervisor.'));end if;
  if p.escalation is null or not length(trim(p.escalation))>0 then i:=i||jsonb_build_array(jsonb_build_object('code','escalation','entityId',p.id,'message',p.name||': add an escalation contact.'));end if;
  if not exists(select 1 from public.post_operating_windows where post_id=p.id) then i:=i||jsonb_build_array(jsonb_build_object('code','hours','entityId',p.id,'message',p.name||': add operating dates and hours.'));end if;
  if exists(select 1 from public.post_operating_windows w where w.post_id=p.id and (w.start_date<e.start_date or w.end_date>e.end_date)) then i:=i||jsonb_build_array(jsonb_build_object('code','dates','entityId',p.id,'message',p.name||': operating dates fall outside this event.'));end if;
  if exists(select 1 from public.post_requirements r join public.post_operating_windows w on w.post_id=r.post_id where r.post_id=p.id and r.minimum_count>coalesce(w.minimum_coverage,p.minimum_coverage)) then i:=i||jsonb_build_array(jsonb_build_object('code','qualifications','entityId',p.id,'message',p.name||': an operating period cannot cover required qualifications.'));end if;
 end loop;
 for p in select * from public.posts where event_id=e.id and not exists(select 1 from public.setup_entity_reviews r where r.entity_kind='post' and r.entity_id=posts.id and r.status='confirmed') loop
  i:=i||jsonb_build_array(jsonb_build_object('code','review','entityId',p.id,'message',p.name||': confirm staffing, qualifications, operating hours and escalation.'));
 end loop;
 if exists(select 1 from public.setup_entity_reviews where event_id=e.id and entity_kind in ('requirement','window','procedure') and status<>'confirmed') then i:=i||jsonb_build_array(jsonb_build_object('code','review_details','message','Confirm the remaining qualification, operating-hour and procedure records.'));end if;
 if exists(select 1 from public.event_documents where event_id=e.id and include_in_setup and (processing_status<>'ready' or reviewed_at is null)) then i:=i||jsonb_build_array(jsonb_build_object('code','documents','message','Apply the analysed plan or manually review all included documents.'));end if;
 if exists(select 1 from public.setup_ai_jobs where event_id=e.id and input_revision=e.setup_revision and status='succeeded' and applied_revision is null and dismissed_at is null) then i:=i||jsonb_build_array(jsonb_build_object('code','candidate_review','message','Apply or explicitly dismiss the current AI candidate before verifying.'));end if;
 if exists(select 1 from public.setup_issues where event_id=e.id and status='open' and severity='blocking') then i:=i||jsonb_build_array(jsonb_build_object('code','clarification','message','Resolve the blocking setup questions.'));end if;
 select count(*),count(*) filter(where status='confirmed') into t,n from public.setup_entity_reviews where event_id=e.id and entity_kind in ('post','requirement','window','procedure');
 return jsonb_build_object('revision',e.setup_revision,'modelStatus',e.model_status,'verifiedRevision',e.verified_revision,'issues',i,'confirmed',n,'total',t);
end; $$;
create or replace function public.confirm_setup_entity(p_event_id uuid,p_kind text,p_entity_id uuid,p_expected_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare rev bigint;
begin
 if not public.is_event_manager(p_event_id) then raise exception 'You cannot confirm this operating plan';end if;
 select setup_revision into rev from public.events where id=p_event_id for update;
 if rev<>p_expected_revision then raise exception 'The operating plan changed. Refresh before confirming';end if;
 update public.setup_entity_reviews set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now()
  where event_id=p_event_id and entity_kind=p_kind and entity_id=p_entity_id;
 if not found then raise exception 'This record is no longer available';end if;
 insert into public.setup_change_history(event_id,entity_kind,entity_id,next_data,changed_by)
  values(p_event_id,'confirmation',p_entity_id,jsonb_build_object('kind',p_kind,'revision',rev),auth.uid());
end; $$;
create or replace function public.verify_event_model(p_event_id uuid,p_expected_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare e public.events; readiness jsonb;
begin
 if not public.is_event_manager(p_event_id) then raise exception 'You cannot verify this event';end if;
 select * into e from public.events where id=p_event_id for update;
 if e.setup_revision<>p_expected_revision then raise exception 'The operating plan changed. Refresh before verification';end if;
 readiness:=public.get_event_readiness(p_event_id);
 if jsonb_array_length(readiness->'issues')<>0 then raise exception 'Resolve all blocking readiness items before verification';end if;
 update public.events set model_status='verified',verified_revision=setup_revision,verified_by=auth.uid(),verified_at=now() where id=p_event_id;
 insert into public.setup_change_history(event_id,entity_kind,next_data,changed_by) values(p_event_id,'verification',jsonb_build_object('revision',e.setup_revision),auth.uid());
end; $$;
create or replace function public.resolve_setup_issue(p_issue_id uuid,p_resolution text) returns void
language plpgsql security definer set search_path='' as $$
declare issue public.setup_issues;
begin
 select * into issue from public.setup_issues where id=p_issue_id;
 if issue.id is null or not public.is_event_manager(issue.event_id) then raise exception 'This question is unavailable';end if;
 if char_length(trim(p_resolution)) not between 1 and 4000 then raise exception 'Record how you resolved this question';end if;
 perform 1 from public.events where id=issue.event_id for update;
 update public.setup_issues set status='resolved',resolution=trim(p_resolution),resolved_by=auth.uid(),resolved_at=now() where id=issue.id;
 update public.events set setup_revision=setup_revision+1,model_status='needs_review',verified_revision=null,verified_at=null,verified_by=null where id=issue.event_id;
 insert into public.setup_change_history(event_id,entity_kind,entity_id,next_data,changed_by) values(issue.event_id,'issue_resolution',issue.id,jsonb_build_object('resolution',p_resolution),auth.uid());
end; $$;
create or replace function public.review_event_document(p_document_id uuid,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare doc public.event_documents;
begin
 select * into doc from public.event_documents where id=p_document_id;
 if doc.id is null or not public.is_event_manager(doc.event_id) then raise exception 'Document is unavailable';end if;
 if char_length(trim(p_note)) not between 1 and 2000 then raise exception 'Add a note describing your document review';end if;
 perform 1 from public.events where id=doc.event_id for update;
 update public.event_documents set processing_status='ready',processing_error=null,reviewed_at=now(),reviewed_by=auth.uid() where id=doc.id;
 insert into public.setup_change_history(event_id,entity_kind,entity_id,next_data,changed_by) values(doc.event_id,'document_review',doc.id,jsonb_build_object('note',p_note),auth.uid());
end; $$;
create unique index if not exists events_join_code_case_key on public.events(upper(join_code)) where join_code is not null;
create or replace function public.publish_event_recruitment(p_event_id uuid,p_join_code text,p_expected_revision bigint) returns text
language plpgsql security definer set search_path='' as $$
declare e public.events; code text:=upper(trim(p_join_code));
begin
 if not public.is_event_manager(p_event_id) then raise exception 'You cannot publish this event';end if;
 select * into e from public.events where id=p_event_id for update;
 if e.status not in ('draft','recruiting') then raise exception 'This event is not open for recruitment publishing';end if;
 if e.model_status<>'verified' or e.verified_revision is distinct from e.setup_revision or e.setup_revision<>p_expected_revision
  or jsonb_array_length(public.get_event_readiness(e.id)->'issues')<>0 then raise exception 'Verify the latest operating plan before publishing';end if;
 if code is null or code !~ '^[A-Z0-9]{6,20}$' then raise exception 'Use 6–20 letters or numbers for the join code';end if;
 update public.events set status='recruiting',join_code=code where id=e.id;
 insert into public.setup_change_history(event_id,entity_kind,next_data,changed_by) values(e.id,'recruitment_published',jsonb_build_object('joinCode',code),auth.uid());
 return code;
exception when unique_violation then raise exception 'That join code is already in use. Choose another';
end; $$;
create or replace function public.preview_event_join(p_join_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
 if auth.uid() is null then raise exception 'Sign in to preview an event';end if;
 select * into e from public.events where upper(join_code)=upper(trim(p_join_code)) and status='recruiting'
  and model_status='verified' and verified_revision=setup_revision;
 if e.id is null then raise exception 'This code is invalid or the event is not currently accepting volunteers';end if;
 return jsonb_build_object('id',e.id,'name',e.name,'description',e.description,'venue_name',e.venue_name,'start_date',e.start_date,'end_date',e.end_date,'timezone',e.timezone);
end; $$;
create or replace function public.join_event(p_join_code text,p_expected_event_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
 if auth.uid() is null then raise exception 'Sign in to join an event';end if;
 select * into e from public.events where upper(join_code)=upper(trim(p_join_code)) for update;
 if e.id is distinct from p_expected_event_id or e.id is null or e.status<>'recruiting' or e.model_status<>'verified' or e.verified_revision is distinct from e.setup_revision then
  raise exception 'The event changed or is no longer accepting volunteers. Preview it again';end if;
 insert into public.event_memberships(event_id,user_id,event_role) values(e.id,auth.uid(),'volunteer')
  on conflict(event_id,user_id) do nothing;
 -- Existing coordinator/safety roles are preserved. Inactive memberships need
 -- an explicit coordinator decision instead of being silently reactivated.
 if not public.is_event_member(e.id) then raise exception 'Your membership is inactive. Contact the event coordinator';end if;
 return e.id;
end; $$;
create or replace function public.my_joined_events() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'description',e.description,'venue_name',e.venue_name,
 'start_date',e.start_date,'end_date',e.end_date,'timezone',e.timezone,'status',e.status,'event_role',m.event_role) order by e.start_date),'[]'::jsonb)
 from public.event_memberships m join public.events e on e.id=m.event_id where m.user_id=auth.uid() and m.status='active';
$$;
create or replace function public.set_event_member_role(p_membership_id uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.event_memberships;owner_id uuid;
begin
 select * into m from public.event_memberships where id=p_membership_id;
 select created_by into owner_id from public.events where id=m.event_id;
 if owner_id is distinct from auth.uid() or auth.uid() is null or p_role not in ('coordinator','safety_lead','volunteer') then raise exception 'Only the event owner can assign event roles';end if;
 if m.user_id=owner_id and p_role<>'coordinator' then raise exception 'The event owner remains a coordinator';end if;
 update public.event_memberships set event_role=p_role where id=m.id;
end; $$;
do $$ declare f regprocedure;begin
 foreach f in array array['public.get_event_readiness(uuid)'::regprocedure,'public.confirm_setup_entity(uuid,text,uuid,bigint)'::regprocedure,
 'public.verify_event_model(uuid,bigint)'::regprocedure,'public.resolve_setup_issue(uuid,text)'::regprocedure,'public.review_event_document(uuid,text)'::regprocedure,
 'public.publish_event_recruitment(uuid,text,bigint)'::regprocedure,'public.preview_event_join(text)'::regprocedure,'public.join_event(text,uuid)'::regprocedure,
 'public.my_joined_events()'::regprocedure,'public.set_event_member_role(uuid,text)'::regprocedure] loop
 execute format('revoke all on function %s from public,anon',f);execute format('grant execute on function %s to authenticated',f);end loop;
end; $$;
create or replace function public.list_event_team(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_manager(p_event_id) then raise exception 'You cannot view this team';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'event_id',m.event_id,'user_id',m.user_id,'display_name',p.display_name,'event_role',m.event_role,'status',m.status,'joined_at',m.joined_at) order by m.joined_at)
 from public.event_memberships m join public.profiles p on p.id=m.user_id where m.event_id=p_event_id),'[]'::jsonb);
end; $$;
revoke all on function public.list_event_team(uuid) from public,anon;
grant execute on function public.list_event_team(uuid) to authenticated;
-- Precision-editor corrections preserve history and remove child records explicitly.
create or replace function public.remove_setup_item(p_event_id uuid,p_kind text,p_entity_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_manager(p_event_id) then raise exception 'You cannot edit this event';end if;
 perform 1 from public.events where id=p_event_id for update;
 if p_kind='post' then
  if not exists(select 1 from public.posts where id=p_entity_id and event_id=p_event_id) then raise exception 'Post is unavailable';end if;
  delete from public.post_requirements where post_id=p_entity_id;
  delete from public.post_operating_windows where post_id=p_entity_id;
  delete from public.posts where id=p_entity_id and event_id=p_event_id;
 elsif p_kind='location' then
  if exists(select 1 from public.posts where location_id=p_entity_id) then raise exception 'Move or remove the posts at this location first';end if;
  delete from public.locations where id=p_entity_id and event_id=p_event_id;
  if not found then raise exception 'Location is unavailable';end if;
 else raise exception 'Unsupported item';end if;
end; $$;
create or replace function public.move_setup_post(p_event_id uuid,p_post_id uuid,p_current_location_id uuid,p_location_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_manager(p_event_id) then raise exception 'You cannot edit this event';end if;
 perform 1 from public.events where id=p_event_id for update;
 if not exists(select 1 from public.locations where id=p_location_id and event_id=p_event_id) then raise exception 'Location is unavailable';end if;
 update public.posts set location_id=p_location_id,map_x=null,map_y=null,map_radius_percent=null,check_in_x=null,check_in_y=null,check_in_radius_percent=null
 where id=p_post_id and event_id=p_event_id and location_id=p_current_location_id;
 if not found then raise exception 'This post moved or is unavailable. Refresh before moving it';end if;
end; $$;
revoke all on function public.remove_setup_item(uuid,text,uuid),public.move_setup_post(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.remove_setup_item(uuid,text,uuid),public.move_setup_post(uuid,uuid,uuid,uuid) to authenticated;
create or replace function public.dismiss_setup_proposal(p_job_id uuid,p_reason text,p_expected_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare j public.setup_ai_jobs; rev bigint;
begin
 select * into j from public.setup_ai_jobs where id=p_job_id;
 if j.id is null or not public.is_event_manager(j.event_id) then raise exception 'Candidate is unavailable';end if;
 select setup_revision into rev from public.events where id=j.event_id for update;
 if j.dismissed_at is not null then return;end if;
 if rev is distinct from p_expected_revision then raise exception 'The plan changed. Refresh before dismissing';end if;
 if p_reason is null or char_length(trim(p_reason)) not between 1 and 2000 then raise exception 'Record why this candidate was dismissed';end if;
 if j.applied_revision is not null then raise exception 'This candidate has already been applied';end if;
 update public.setup_ai_jobs set dismissed_at=now(),dismissed_by=auth.uid(),dismissal_reason=trim(p_reason) where id=j.id;
 update public.events set setup_revision=setup_revision+1,model_status='needs_review',verified_revision=null,verified_at=null,verified_by=null where id=j.event_id;
 insert into public.setup_change_history(event_id,entity_kind,entity_id,next_data,changed_by) values(j.event_id,'candidate_dismissed',j.id,jsonb_build_object('reason',p_reason),auth.uid());
end; $$;
revoke all on function public.dismiss_setup_proposal(uuid,text,bigint) from public,anon;
grant execute on function public.dismiss_setup_proposal(uuid,text,bigint) to authenticated;
commit;
