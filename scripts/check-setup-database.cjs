const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(
  process.env.PGLITE_MODULE || '/tmp/ground-control-validation/node_modules/@electric-sql/pglite',
);
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth,storage to authenticated,anon,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;`);
  const dir = path.join(__dirname, '../supabase/migrations');
  const migrations = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations) {
    try {
      await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (e) {
      console.error('Migration failed:', file);
      throw e;
    }
  }
  for (const file of migrations.filter((f) => f >= '202610070009')) {
    await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  console.log('All migrations apply; 009 onward rerun safely.');

  const mo = '11111111-1111-4111-8111-111111111111',
    vol = '22222222-2222-4222-8222-222222222222',
    other = '33333333-3333-4333-8333-333333333333';
  await db.query(
    `insert into auth.users(id,email) values($1,'mo@example.com'),($2,'vol@example.com'),($3,'other@example.com')`,
    [mo, vol, other],
  );
  await db.query(`update public.account_roles set role='coordinator' where user_id in ($1,$2)`, [
    mo,
    other,
  ]);
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const one = async (sql, args = []) => (await query(sql, args))[0];
  async function asUser(id) {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]);
    await db.exec('set role authenticated');
  }
  async function rejects(sql, args, pattern) {
    await assert.rejects(() => db.query(sql, args), pattern);
  }
  await asUser(mo);
  const org = (await one(
    `insert into public.organisations(name,created_by) values('Riverside Crew',$1) returning id`,
    [mo],
  )).id;
  const event = (await one(
    `insert into public.events(organisation_id,name,venue_name,start_date,end_date,operating_start_time,operating_end_time,timezone,created_by) values($1,'Riverside','Riverside Park','2026-11-01','2026-11-02','09:00','18:00','Australia/Melbourne',$2) returning id`,
    [org, mo],
  )).id;
  assert.equal((await one(`select public.is_event_manager($1) as ok`, [event])).ok, true);
  await rejects(
    `update public.events set status='recruiting' where id=$1`,
    [event],
    /permission denied/,
  );
  await rejects(
    `insert into public.events(organisation_id,name,venue_name,start_date,end_date,operating_start_time,operating_end_time,timezone,created_by,model_status) values($1,'Bad','Park','2026-11-01','2026-11-02','09:00','18:00','Australia/Melbourne',$2,'verified')`,
    [org, mo],
    /permission denied/,
  );
  await db.query(
    `insert into public.event_setup_sessions(event_id,description,updated_by) values($1,'Water Station B needs four people including one First Aid holder; Mo supervises; radio channel 1; both days 09:00–18:00.',$2)`,
    [event, mo],
  );
  let readiness = (await one('select public.get_event_readiness($1) as r', [event])).r;
  await rejects(
    'select public.verify_event_model($1,$2)',
    [event, readiness.revision],
    /Resolve all/,
  );
  const doc = '44444444-4444-4444-8444-444444444444';
  const filePath = `${event}/${doc}/plan.txt`;
  await db.query(`insert into storage.objects(bucket_id,name) values('event-documents',$1)`, [
    filePath,
  ]);
  await db.query(
    `insert into public.event_documents(id,event_id,title,document_type,storage_path,original_name,mime_type,size_bytes,uploaded_by) values($1,$2,'Operations','operations',$3,'plan.txt','text/plain',20,$4)`,
    [doc, event, filePath, mo],
  );
  await db.query(`delete from storage.objects where name=$1`, [filePath]);
  assert.equal(
    (await query(`select * from storage.objects where name=$1`, [filePath])).length,
    1,
    'Referenced originals cannot be removed',
  );
  const jobId = '55555555-5555-4555-8555-555555555555';
  await db.query('select public.enqueue_setup_job($1,$2,$3,$4)', [
    event,
    jobId,
    'Who supervises?',
    'Mo, radio channel 1',
  ]);
  await db.query('select public.enqueue_setup_job($1,$2,$3,$4)', [
    event,
    jobId,
    'Who supervises?',
    'Mo, radio channel 1',
  ]);
  assert.equal(
    (await query('select * from public.setup_answers where event_id=$1', [event])).length,
    1,
    'Answer retry is idempotent',
  );
  const claimed = (await one('select public.claim_setup_job($1) as j', [jobId])).j;
  assert.equal(
    (await one('select public.claim_setup_job($1) as j', [jobId])).j,
    null,
    'Running analysis cannot duplicate',
  );
  await db.query('select public.finish_setup_job($1,$2,null,$3)', [
    jobId,
    claimed.attempt,
    'Quota limit',
  ]);
  assert.equal(
    (await query('select * from public.setup_answers where event_id=$1', [event])).length,
    1,
    'AI failure preserves raw answers',
  );
  assert.equal(
    (await one('select processing_status from public.event_documents where id=$1', [doc]))
      .processing_status,
    'failed',
  );
  const retry = (await one('select public.claim_setup_job($1) as j', [jobId])).j;
  const source = {
    sourceType: 'description',
    sourceId: event,
    reference: 'Setup description',
    confidence: .9,
  };
  const plan = {
    locations: [{ key: 'water', name: 'Water Station B', description: 'Water point', source }],
    posts: [{
      key: 'water-crew',
      locationKey: 'water',
      name: 'Water crew',
      description: 'Serve water',
      minimumCoverage: 4,
      criticality: 'important',
      supervisor: 'Mo',
      escalation: 'Radio channel 1',
      instructions: 'Monitor the queue',
      requirements: [{
        certificationType: 'First Aid',
        experienceRequirement: null,
        minimumCount: 1,
      }],
      windows: [{
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        startTime: '09:00',
        endTime: '18:00',
        minimumCoverage: null,
      }],
      source,
    }],
    procedures: [{
      key: 'heat',
      title: 'Heat response',
      content: 'Report concerns to Mo on channel 1.',
      source,
    }],
    issues: [],
  };
  await db.query('select public.finish_setup_job($1,$2,$3,null)', [
    jobId,
    retry.attempt,
    JSON.stringify(plan),
  ]);
  assert.equal(
    (await query('select * from public.posts where event_id=$1', [event])).length,
    0,
    'AI completion alone does not write operational records',
  );
  const beforeApplying = (await one('select public.get_event_readiness($1) as r', [event])).r;
  assert.ok(
    beforeApplying.issues.some((i) => i.code === 'candidate_review'),
    'A completed AI job still needs human disposition',
  );
  assert.ok(
    beforeApplying.issues.some((i) => i.code === 'documents'),
    'Reading a document with AI is not a human review',
  );
  const invalid = structuredClone(plan);
  invalid.posts[0].locationKey = 'unknown';
  await rejects(
    'select public.apply_setup_proposal($1,$2)',
    [jobId, JSON.stringify(invalid)],
    /unknown location/,
  );
  assert.equal(
    (await query('select * from public.locations where event_id=$1', [event])).length,
    0,
    'Invalid proposals roll back entirely',
  );
  const fake = structuredClone(plan);
  fake.locations[0].source.sourceId = other;
  await rejects(
    'select public.apply_setup_proposal($1,$2)',
    [jobId, JSON.stringify(fake)],
    /Unknown location source/,
  );
  await db.query('select public.apply_setup_proposal($1,$2)', [jobId, JSON.stringify(plan)]);
  await db.query('select public.apply_setup_proposal($1,$2)', [jobId, JSON.stringify(plan)]);
  const post = await one('select * from public.posts where event_id=$1', [event]);
  assert.equal(post.minimum_coverage, 4);
  assert.equal((await query('select * from public.posts where event_id=$1', [event])).length, 1);
  const window = await one('select * from public.post_operating_windows where event_id=$1', [
    event,
  ]);
  await rejects(
    `insert into public.post_operating_windows(event_id,post_id,start_date,end_date,start_time,end_time) values($1,$2,'2026-11-01','2026-11-02','10:00','11:00')`,
    [event, post.id],
    /overlap/,
  );
  await db.query('update public.post_operating_windows set minimum_coverage=1 where id=$1', [
    window.id,
  ]);
  const req = await one('select * from public.post_requirements where post_id=$1', [post.id]);
  await rejects(
    'update public.post_requirements set minimum_count=2 where id=$1',
    [req.id],
    /any operating period/,
  );
  await db.query('update public.post_operating_windows set minimum_coverage=null where id=$1', [
    window.id,
  ]);
  // Reanalysis merges the same records, including existing operating windows.
  const job2 = '66666666-6666-4666-8666-666666666666';
  await db.query('select public.enqueue_setup_job($1,$2)', [event, job2]);
  const second = (await one('select public.claim_setup_job($1) as j', [job2])).j;
  await db.query('select public.finish_setup_job($1,$2,$3,null)', [
    job2,
    second.attempt,
    JSON.stringify(plan),
  ]);
  await db.query('select public.apply_setup_proposal($1,$2)', [job2, JSON.stringify(plan)]);
  assert.equal(
    (await query('select * from public.post_operating_windows where event_id=$1', [event])).length,
    1,
  );
  readiness = (await one('select public.get_event_readiness($1) as r', [event])).r;
  for (
    const r of await query('select * from public.setup_entity_reviews where event_id=$1', [event])
  ) {
    await db.query('select public.confirm_setup_entity($1,$2,$3,$4)', [
      event,
      r.entity_kind,
      r.entity_id,
      readiness.revision,
    ]);
  }
  readiness = (await one('select public.get_event_readiness($1) as r', [event])).r;
  assert.deepEqual(readiness.issues, []);
  await db.query('select public.verify_event_model($1,$2)', [event, readiness.revision]);
  await db.query('select public.publish_event_recruitment($1,$2,$3)', [
    event,
    'RIVERSIDE26',
    readiness.revision,
  ]);
  await asUser(vol);
  const preview = (await one('select public.preview_event_join($1) as p', ['riverside26'])).p;
  assert.deepEqual(
    Object.keys(preview).sort(),
    ['id', 'name', 'description', 'venue_name', 'start_date', 'end_date', 'timezone'].sort(),
  );
  assert.equal(
    (await query('select * from public.events where id=$1', [event])).length,
    0,
    'Preview does not grant database access',
  );
  await db.query('select public.join_event($1,$2)', ['RIVERSIDE26', event]);
  await db.query('select public.join_event($1,$2)', ['RIVERSIDE26', event]);
  assert.equal(
    (await query('select * from public.event_memberships where event_id=$1', [event])).length,
    1,
    'Volunteer sees only own membership',
  );
  for (
    const table of [
      'event_documents',
      'posts',
      'locations',
      'setup_answers',
      'setup_ai_jobs',
      'setup_entity_reviews',
      'setup_change_history',
      'post_operating_windows',
      'event_procedures',
    ]
  ) {
    assert.equal(
      (await query(`select * from public.${table} where event_id=$1`, [event])).length,
      0,
      `Volunteer cannot read ${table}`,
    );
  }
  assert.equal((await query('select * from public.post_requirements')).length, 0);
  await rejects(
    'select public.get_site_structure($1)',
    [event],
    /cannot|not|unavailable|own|manage/i,
  );
  await rejects('select public.enqueue_setup_job($1,$2)', [
    event,
    '77777777-7777-4777-8777-777777777777',
  ], /cannot/);
  const member = await one('select * from public.event_memberships where event_id=$1', [event]);
  await rejects(
    'select public.set_event_member_role($1,$2)',
    [member.id, 'coordinator'],
    /Only the event owner/,
  );
  await require('./staffing-database-scenarios.cjs')({
    db,
    event,
    vol,
    mo,
    other,
    asUser,
    one,
    query,
    rejects,
  });
  await asUser(other);
  assert.equal(
    (await query('select * from public.events where id=$1', [event])).length,
    0,
    'Other global coordinator has no event access',
  );
  await asUser(mo);
  await db.query('select public.set_event_member_role($1,$2)', [member.id, 'safety_lead']);
  await asUser(vol);
  assert.equal((await one('select public.is_event_manager($1) as ok', [event])).ok, true);
  assert.ok(
    (await one('select public.get_site_structure($1) as s', [event])).s,
    'Safety lead can use existing map RPC',
  );
  await db.query('update public.post_requirements set minimum_count=2 where id=$1', [req.id]);
  assert.equal(
    (await one('select model_status from public.events where id=$1', [event])).model_status,
    'needs_review',
  );
  await rejects('select public.preview_event_join($1)', ['RIVERSIDE26'], /invalid|not currently/);
  await rejects('select public.confirm_setup_entity($1,$2,$3,$4)', [
    event,
    'post',
    post.id,
    readiness.revision,
  ], /changed/);
  const stale = '88888888-8888-4888-8888-888888888888';
  await db.query('select public.enqueue_setup_job($1,$2)', [event, stale]);
  const staleClaim = (await one('select public.claim_setup_job($1) as j', [stale])).j;
  await db.query('update public.posts set instructions=$1 where id=$2', [
    'Changed instructions',
    post.id,
  ]);
  await db.query('select public.finish_setup_job($1,$2,$3,null)', [
    stale,
    staleClaim.attempt,
    JSON.stringify(plan),
  ]);
  await rejects(
    'select public.apply_setup_proposal($1,$2)',
    [stale, JSON.stringify(plan)],
    /changed/,
  );
  assert.equal(
    (await one(
      `select source_type from public.setup_entity_reviews where entity_kind='post' and entity_id=$1`,
      [post.id],
    )).source_type,
    'manual',
    'Manual edits are labelled honestly',
  );

  const dismissRevision =
    (await one('select public.get_event_readiness($1) as r', [event])).r.revision;
  await db.query('select public.dismiss_setup_proposal($1,$2,$3)', [
    stale,
    'Kept the manually corrected plan after reviewing the candidate.',
    dismissRevision,
  ]);
  await db.query('select public.dismiss_setup_proposal($1,$2,$3)', [
    stale,
    'Retry after lost reply',
    dismissRevision,
  ]);
  assert.ok(
    (await one('select dismissed_at,output from public.setup_ai_jobs where id=$1', [stale])).output,
    'Dismissing retains the original candidate',
  );
  assert.equal(
    (await one('select * from public.posts where id=$1', [post.id])).instructions,
    'Changed instructions',
  );
  // Explicit manual correction can move or remove extracted tasks, preserving audit history.
  const newLocation =
    (await one(`insert into public.locations(event_id,name) values($1,'Entry gate') returning id`, [
      event,
    ])).id;
  await db.query('select public.move_setup_post($1,$2,$3,$4)', [
    event,
    post.id,
    post.location_id,
    newLocation,
  ]);
  await rejects('select public.move_setup_post($1,$2,$3,$4)', [
    event,
    post.id,
    post.location_id,
    newLocation,
  ], /moved|unavailable/);
  assert.equal(
    (await one('select location_id from public.posts where id=$1', [post.id])).location_id,
    newLocation,
  );
  await rejects(
    'select public.remove_setup_item($1,$2,$3)',
    [event, 'location', newLocation],
    /Move or remove/,
  );
  await db.query('select public.remove_setup_item($1,$2,$3)', [event, 'post', post.id]);
  assert.equal(
    (await query('select * from public.post_requirements where post_id=$1', [post.id])).length,
    0,
  );
  assert.equal(
    (await query('select * from public.post_operating_windows where post_id=$1', [post.id])).length,
    0,
  );
  assert.ok(
    (await query(
      `select * from public.setup_change_history where entity_id=$1 and next_data is null`,
      [post.id],
    )).length > 0,
  );
  await db.query('select public.remove_setup_item($1,$2,$3)', [event, 'location', newLocation]);
  console.log(
    'Riverside extraction → review → verification → publish → join, retries, rollback, stale changes, original retention and role isolation passed.',
  );
  await require('./certificate-attention-database-scenarios.cjs')({ db, event, vol, mo, other, asUser, one, query, rejects });
  await db.close();
})().catch((e) => {
  console.error(e.message);
  console.error(e.query ?? e.stack);
  process.exit(1);
});
