-- Persisted AI drafts, clarifications, provenance and human review. After 009.
begin;
create table if not exists public.setup_answers (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id),question text not null,
 answer text not null check(char_length(answer) between 1 and 4000),answered_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create table if not exists public.setup_ai_jobs (
 id uuid primary key,event_id uuid not null references public.events(id),requested_by uuid not null references auth.users(id),
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed')),
 input_revision bigint not null,attempt integer not null default 0,output jsonb,error_message text,applied_revision bigint,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.setup_ai_jobs add column if not exists dismissed_at timestamptz;
alter table public.setup_ai_jobs add column if not exists dismissed_by uuid references auth.users(id);
alter table public.setup_ai_jobs add column if not exists dismissal_reason text;
create table if not exists public.setup_issues (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id),job_id uuid not null references public.setup_ai_jobs(id),
 issue_key text not null,severity text not null check(severity in ('blocking','review')),question text not null,evidence text not null,
 status text not null default 'open' check(status in ('open','resolved')),resolution text,resolved_by uuid references auth.users(id),resolved_at timestamptz,
 unique(job_id,issue_key)
);
alter table public.setup_entity_reviews add column if not exists ai_job_id uuid references public.setup_ai_jobs(id);
do $$ declare tab text;begin
 foreach tab in array array['setup_answers','setup_ai_jobs','setup_issues'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from anon,authenticated',tab);
  execute format('grant select on public.%I to authenticated',tab);
  execute format('drop policy if exists "Manager reads AI workspace" on public.%I',tab);
  execute format('create policy "Manager reads AI workspace" on public.%I for select to authenticated using(public.is_event_manager(event_id))',tab);
 end loop;
end; $$;
create or replace function public.enqueue_setup_job(p_event_id uuid,p_request_id uuid,p_question text default null,p_answer text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
 if not public.is_event_manager(p_event_id) then raise exception 'You cannot analyse this event';end if;
 select * into e from public.events where id=p_event_id for update;
 if exists(select 1 from public.setup_ai_jobs where id=p_request_id and event_id=p_event_id) then return p_request_id;end if;
 update public.setup_ai_jobs set status='failed',error_message='Setup changed. Start a new analysis.',updated_at=now() where event_id=p_event_id and status in ('queued','running') and input_revision<>e.setup_revision;
 if exists(select 1 from public.setup_ai_jobs where event_id=p_event_id and status in ('queued','running') and updated_at>now()-interval '4 minutes') then
  raise exception 'An analysis is already in progress. Refresh its status before starting another';
 end if;
 if p_answer is not null then
  if p_question is null or char_length(trim(p_question)) not between 1 and 1000 or char_length(trim(p_answer)) not between 1 and 4000 then raise exception 'Enter an answer of at most 4,000 characters';end if;
  insert into public.setup_answers(event_id,question,answer,answered_by) values(p_event_id,p_question,trim(p_answer),auth.uid());
  update public.setup_entity_reviews set status='needs_review',confirmed_by=null,confirmed_at=null where event_id=p_event_id and entity_kind in ('post','requirement','window','procedure');
  update public.events set setup_revision=setup_revision+1,model_status='needs_review',verified_revision=null,verified_by=null,verified_at=null where id=p_event_id returning * into e;
 end if;
 insert into public.setup_ai_jobs(id,event_id,requested_by,input_revision) values(p_request_id,p_event_id,auth.uid(),e.setup_revision);
 return p_request_id;
end; $$;
create or replace function public.claim_setup_job(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.setup_ai_jobs; rev bigint;
begin
 select * into j from public.setup_ai_jobs where id=p_job_id for update;
 if j.id is null or not public.is_event_manager(j.event_id) then raise exception 'Analysis is unavailable';end if;
 if j.status='succeeded' or (j.status='running' and j.updated_at>now()-interval '4 minutes') then return null;end if;
 select setup_revision into rev from public.events where id=j.event_id;
 if rev<>j.input_revision then
  update public.setup_ai_jobs set status='failed',error_message='Setup changed. Start a new analysis with the latest information.',updated_at=now() where id=j.id;return null;
 end if;
 update public.setup_ai_jobs set status='running',attempt=attempt+1,error_message=null,updated_at=now() where id=j.id returning * into j;
 update public.event_documents set processing_status='processing',processing_error=null where event_id=j.event_id and include_in_setup;
 return to_jsonb(j);
end; $$;
create or replace function public.get_setup_ai_context(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.setup_ai_jobs; e public.events;
begin
 select * into j from public.setup_ai_jobs where id=p_job_id;
 if j.id is null or not public.is_event_manager(j.event_id) then raise exception 'Analysis is unavailable';end if;
 select * into e from public.events where id=j.event_id for share;
 if e.setup_revision<>j.input_revision then raise exception 'Setup changed before analysis. Start again';end if;
 return jsonb_build_object('event',to_jsonb(e),
  'description',(select description from public.event_setup_sessions where event_id=e.id),
  'documents',coalesce((select jsonb_agg(to_jsonb(d)) from public.event_documents d where d.event_id=e.id and d.include_in_setup),'[]'::jsonb),
  'locations',coalesce((select jsonb_agg(to_jsonb(l)) from public.locations l where l.event_id=e.id),'[]'::jsonb),
  'posts',coalesce((select jsonb_agg(to_jsonb(p)) from public.posts p where p.event_id=e.id),'[]'::jsonb),
  'requirements',coalesce((select jsonb_agg(to_jsonb(r)) from public.post_requirements r join public.posts p on p.id=r.post_id where p.event_id=e.id),'[]'::jsonb),
  'windows',coalesce((select jsonb_agg(to_jsonb(w)) from public.post_operating_windows w where w.event_id=e.id),'[]'::jsonb),
  'procedures',coalesce((select jsonb_agg(to_jsonb(p)) from public.event_procedures p where p.event_id=e.id),'[]'::jsonb),
  'answers',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.setup_answers a where a.event_id=e.id),'[]'::jsonb));
end; $$;
create or replace function public.finish_setup_job(p_job_id uuid,p_attempt integer,p_output jsonb,p_error text)
returns void language plpgsql security definer set search_path='' as $$
declare j public.setup_ai_jobs;
begin
 select * into j from public.setup_ai_jobs where id=p_job_id for update;
 if j.id is null or not public.is_event_manager(j.event_id) then raise exception 'Analysis is unavailable';end if;
 if j.attempt<>p_attempt or j.status<>'running' then return;end if;
 update public.setup_ai_jobs set status=case when p_error is null then 'succeeded' else 'failed' end,
  output=case when p_error is null then p_output else null end,error_message=left(p_error,1000),updated_at=now() where id=j.id;
 if (select setup_revision from public.events where id=j.event_id)=j.input_revision then
 update public.event_documents set processing_status=case when p_error is null then 'ready' else 'failed' end,processing_error=left(p_error,1000) where event_id=j.event_id and include_in_setup;
 end if;
end; $$;

create or replace function public.setup_source_valid(p_event_id uuid,p_source jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select case p_source->>'sourceType'
  when 'description' then p_source->>'sourceId'=p_event_id::text and exists(select 1 from public.event_setup_sessions where event_id=p_event_id)
  when 'document' then exists(select 1 from public.event_documents where event_id=p_event_id and id::text=p_source->>'sourceId')
  when 'answer' then exists(select 1 from public.setup_answers where event_id=p_event_id and id::text=p_source->>'sourceId')
  when 'manual' then p_source->>'sourceId' is null
  when 'inference' then p_source->>'sourceId' is null else false end;
$$;
create or replace function public.record_setup_source(p_event_id uuid,p_kind text,p_id uuid,p_source jsonb,p_job_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_event_manager(p_event_id) or public.setup_source_valid(p_event_id,p_source) is not true then raise exception 'Unknown source in this event';end if;
 insert into public.setup_entity_reviews(event_id,entity_kind,entity_id,source_type,source_id,source_reference,confidence,ai_job_id)
 values(p_event_id,p_kind,p_id,p_source->>'sourceType',p_source->>'sourceId',coalesce(p_source->>'reference',''),(p_source->>'confidence')::numeric,p_job_id)
 on conflict(entity_kind,entity_id) do update set source_type=excluded.source_type,source_id=excluded.source_id,source_reference=excluded.source_reference,
 confidence=excluded.confidence,ai_job_id=excluded.ai_job_id,status='needs_review',confirmed_by=null,confirmed_at=null;
end; $$;
-- Apply only after an explicit human action. Merge by name within the event;
-- never delete existing tasks, qualifications or windows omitted by AI.
create or replace function public.apply_setup_proposal(p_job_id uuid,p_plan jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare j public.setup_ai_jobs; e public.events; l jsonb; p jsonb; r jsonb; w jsonb; x jsonb;
 lid uuid; pid uuid; rid uuid; mapping jsonb:='{}'::jsonb; coverage integer; existing_max integer;
begin
 select * into j from public.setup_ai_jobs where id=p_job_id;
 if j.id is null or not public.is_event_manager(j.event_id) then raise exception 'You cannot apply this proposal';end if;
 select * into e from public.events where id=j.event_id for update;
 select * into j from public.setup_ai_jobs where id=p_job_id for update;
 if j.applied_revision is not null then return;end if;
 if j.status<>'succeeded' or j.dismissed_at is not null or j.output is null or e.setup_revision<>j.input_revision then raise exception 'The setup changed. Generate a fresh proposal before applying';end if;
 if jsonb_typeof(p_plan->'locations') is distinct from 'array' or jsonb_typeof(p_plan->'posts') is distinct from 'array' or jsonb_typeof(p_plan->'procedures') is distinct from 'array' or jsonb_typeof(p_plan->'issues') is distinct from 'array'
  or jsonb_array_length(p_plan->'locations')>100 or jsonb_array_length(p_plan->'posts')>200 then raise exception 'Invalid operating proposal';end if;
 for l in select value from jsonb_array_elements(p_plan->'locations') loop
  if public.setup_source_valid(e.id,l->'source') is not true then raise exception 'Unknown location source';end if;
  select id into lid from public.locations where event_id=e.id and lower(name)=lower(trim(l->>'name')) order by created_at,id limit 1;
  if lid is null then insert into public.locations(event_id,name,description) values(e.id,trim(l->>'name'),nullif(l->>'description','')) returning id into lid;
  else update public.locations set description=nullif(l->>'description','') where id=lid;end if;
  mapping:=mapping||jsonb_build_object(l->>'key',lid::text);
  perform public.record_setup_source(e.id,'location',lid,l->'source',j.id);
 end loop;
 for p in select value from jsonb_array_elements(p_plan->'posts') loop
  if public.setup_source_valid(e.id,p->'source') is not true then raise exception 'Unknown task source';end if;
  lid:=null;
  if mapping ? (p->>'locationKey') then lid:=(mapping->>(p->>'locationKey'))::uuid;
  else select id into lid from public.locations where id::text=p->>'locationKey' and event_id=e.id;end if;
  if lid is null then raise exception 'A post references an unknown location';end if;
  coverage:=(p->>'minimumCoverage')::integer;
  if coverage is null or coverage not between 1 and 10000 then raise exception 'Complete minimum staffing before applying the draft';end if;
  select id into pid from public.posts where event_id=e.id and location_id=lid and lower(name)=lower(trim(p->>'name'));
  if pid is null then
   insert into public.posts(event_id,location_id,name,description,minimum_coverage,criticality,instructions,supervisor,escalation)
   values(e.id,lid,trim(p->>'name'),coalesce(p->>'description',''),coverage,p->>'criticality',nullif(p->>'instructions',''),p->>'supervisor',p->>'escalation') returning id into pid;
  else
   select coalesce(max(minimum_count),0) into existing_max from public.post_requirements where post_id=pid;
   if coverage<existing_max then raise exception 'A proposed staffing change breaks an existing qualification requirement';end if;
   update public.posts set description=coalesce(p->>'description',''),minimum_coverage=coverage,criticality=p->>'criticality',instructions=nullif(p->>'instructions',''),supervisor=p->>'supervisor',escalation=p->>'escalation' where id=pid;
  end if;
  perform public.record_setup_source(e.id,'post',pid,p->'source',j.id);
  for r in select value from jsonb_array_elements(p->'requirements') loop
   if r->>'minimumCount' is null then raise exception 'Complete qualification counts before applying';end if;
   select id into rid from public.post_requirements where post_id=pid and coalesce(lower(certification_type),'')=coalesce(lower(r->>'certificationType'),'') and coalesce(lower(experience_requirement),'')=coalesce(lower(r->>'experienceRequirement'),'') limit 1;
   if rid is null then insert into public.post_requirements(post_id,certification_type,experience_requirement,minimum_count)
    values(pid,r->>'certificationType',r->>'experienceRequirement',(r->>'minimumCount')::integer) returning id into rid;
   else update public.post_requirements set minimum_count=(r->>'minimumCount')::integer where id=rid;end if;
   perform public.record_setup_source(e.id,'requirement',rid,p->'source',j.id);
  end loop;
  for w in select value from jsonb_array_elements(p->'windows') loop
   if w->>'startDate' is null or w->>'endDate' is null or w->>'startTime' is null or w->>'endTime' is null then raise exception 'Complete operating dates and hours before applying';end if;
   select id into rid from public.post_operating_windows where post_id=pid and start_date=(w->>'startDate')::date and end_date=(w->>'endDate')::date and start_time=(w->>'startTime')::time and end_time=(w->>'endTime')::time;
   if rid is null then
    insert into public.post_operating_windows(event_id,post_id,start_date,end_date,start_time,end_time,minimum_coverage)
    values(e.id,pid,(w->>'startDate')::date,(w->>'endDate')::date,(w->>'startTime')::time,(w->>'endTime')::time,(w->>'minimumCoverage')::integer) returning id into rid;
   else update public.post_operating_windows set minimum_coverage=(w->>'minimumCoverage')::integer where id=rid;end if;
   perform public.record_setup_source(e.id,'window',rid,p->'source',j.id);
  end loop;
 end loop;
 for x in select value from jsonb_array_elements(p_plan->'procedures') loop
  if public.setup_source_valid(e.id,x->'source') is not true then raise exception 'Unknown procedure source';end if;
  insert into public.event_procedures(event_id,title,content) values(e.id,x->>'title',x->>'content')
   on conflict(event_id,title) do update set content=excluded.content returning id into rid;
  perform public.record_setup_source(e.id,'procedure',rid,x->'source',j.id);
 end loop;
 -- A new reviewed proposal supersedes older clarification prompts, retaining
 -- their records and decisions in history.
 update public.setup_issues set status='resolved',resolution='Superseded by a newer reviewed proposal',resolved_by=auth.uid(),resolved_at=now() where event_id=e.id and status='open';
 for x in select value from jsonb_array_elements(p_plan->'issues') loop
  insert into public.setup_issues(event_id,job_id,issue_key,severity,question,evidence) values(e.id,j.id,x->>'key',x->>'severity',x->>'question',coalesce(x->>'evidence',''));
 end loop;
 update public.events set setup_revision=setup_revision+1,model_status='needs_review',verified_revision=null,verified_by=null,verified_at=null where id=e.id;
 update public.event_documents set reviewed_at=now(),reviewed_by=auth.uid() where event_id=e.id and include_in_setup and processing_status='ready';
 update public.setup_ai_jobs set applied_revision=(select setup_revision from public.events where id=e.id),updated_at=now() where id=j.id;
end; $$;

-- Only public entry points are callable; source bookkeeping is internal.
revoke all on function public.record_setup_source(uuid,text,uuid,jsonb,uuid),public.setup_source_valid(uuid,jsonb) from public,anon,authenticated;
do $$ declare f regprocedure;begin
 foreach f in array array['public.enqueue_setup_job(uuid,uuid,text,text)'::regprocedure,'public.claim_setup_job(uuid)'::regprocedure,'public.get_setup_ai_context(uuid)'::regprocedure,
  'public.finish_setup_job(uuid,integer,jsonb,text)'::regprocedure,'public.apply_setup_proposal(uuid,jsonb)'::regprocedure] loop
  execute format('revoke all on function %s from public,anon',f);execute format('grant execute on function %s to authenticated',f);
 end loop;
end; $$;
commit;
