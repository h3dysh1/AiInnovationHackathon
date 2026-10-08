const assert = require('node:assert/strict');
module.exports = async ({ db, event, vol, mo, other, asUser, one, query, rejects }) => {
  const randomUUID = require('node:crypto').randomUUID;
  const pref = {
    preferredPosts: [],
    avoidedPosts: [],
    preferredStart: '',
    preferredEnd: '',
    desiredHours: 18,
    maximumHours: 24,
    maximumDailyHours: 12,
    experienceTags: [],
  };
  const windows = [{
    startDate: '2026-11-01',
    endDate: '2026-11-01',
    startTime: '09:00',
    endTime: '18:00',
  }, { startDate: '2026-11-02', endDate: '2026-11-02', startTime: '09:00', endTime: '18:00' }];
  const save = () =>
    db.query('select public.save_event_onboarding($1,$2,$3)', [
      event,
      JSON.stringify(windows),
      JSON.stringify(pref),
    ]);
  await asUser(vol);
  await save();
  await rejects('select public.save_event_onboarding($1,$2,$3)', [
    event,
    JSON.stringify([{ ...windows[0], endTime: '08:00' }]),
    JSON.stringify(pref),
  ], /valid period/);
  assert.equal(
    (await one('select public.event_onboarding_context($1) as c', [event])).c.availability.length,
    2,
    'Invalid save rolls back existing availability',
  );
  const cert = randomUUID(), file = `${vol}/${cert}/first-aid.pdf`;
  await db.query("insert into storage.objects(bucket_id,name) values('certificates',$1)", [file]);
  await db.query(
    "insert into public.certifications(id,user_id,title,storage_path,mime_type,size_bytes) values($1,$2,'First Aid',$3,'application/pdf',50)",
    [cert, vol, file],
  );
  await rejects(
    "update public.certifications set status='verified' where id=$1",
    [cert],
    /permission denied/,
  );
  const claim = (await one('select public.claim_certificate_processing($1) as c', [cert])).c;
  const fields = {
    type: 'HLTAID011',
    holderName: 'vol',
    certificateNumber: 'FA-123',
    issuer: 'Training Centre',
    issuedAt: '2026-01-01',
    expiresAt: '2026-11-01',
    confidence: .97,
  };
  await rejects('select public.finish_certificate_processing($1,$2,$3,null)', [
    cert,
    claim.attempt,
    JSON.stringify(fields),
  ], /permission denied/);
  await db.exec('reset role; set role service_role');
  await db.query('select public.finish_certificate_processing($1,$2,$3,null)', [
    cert,
    claim.attempt,
    JSON.stringify(fields),
  ]);
  await asUser(vol);
  assert.equal(
    (await one('select status from public.certifications where id=$1', [cert])).status,
    'requires_review',
  );
  for (
    const scenario of [{ holderName: 'Someone else', confidence: .99, status: 'requires_review' }, {
      holderName: 'vol',
      confidence: .5,
      status: 'requires_review',
    }, { holderName: 'vol', confidence: .99, status: 'failed' }]
  ) {
    const extra = randomUUID(), original = `${vol}/${extra}/evidence.pdf`;
    await db.query("insert into storage.objects(bucket_id,name) values('certificates',$1)", [
      original,
    ]);
    await db.query(
      "insert into public.certifications(id,user_id,title,storage_path,mime_type,size_bytes) values($1,$2,'Evidence',$3,'application/pdf',50)",
      [extra, vol, original],
    );
    const attempt =
      (await one('select public.claim_certificate_processing($1) as c', [extra])).c.attempt;
    await db.exec('reset role; set role service_role');
    await db.query('select public.finish_certificate_processing($1,$2,$3,$4)', [
      extra,
      attempt,
      JSON.stringify({ ...fields, ...scenario }),
      scenario.status === 'failed' ? 'Gemini quota unavailable' : null,
    ]);
    await asUser(vol);
    assert.equal(
      (await one('select status from public.certifications where id=$1', [extra])).status,
      scenario.status,
    );
    assert.equal(
      (await query('select * from storage.objects where name=$1', [original])).length,
      1,
      'AI uncertainty/failure retains original',
    );
  }

  await db.query('delete from storage.objects where name=$1', [file]);
  assert.equal((await query('select * from storage.objects where name=$1', [file])).length, 1);
  await rejects('select public.review_certification($1,$2,false,true,$3)', [
    cert,
    JSON.stringify(fields),
    'Checked original',
  ], /Another event/);
  await asUser(other);
  assert.equal((await query('select * from public.certifications where id=$1', [cert])).length, 0);
  await rejects('select public.event_crew_context($1)', [event], /unavailable/);
  await asUser(mo);
  let notices = (await one('select public.my_notifications() as n')).n.filter(n => n.kind === 'certificate' && n.source_id === cert);
  assert.equal(notices.length, 1, 'Extraction proactively flags Mo');
  assert.match(notices[0].body, /Expires.*during the event/);
  assert.match(notices[0].body, /Human approval required/);
  assert.equal(notices[0].read_at, null);
  await rejects('select public.refresh_event_certificate_attention($1)', [event], /permission denied/);
  await rejects('select * from public.certificate_attention_state', [], /permission denied/);
  // A human may verify evidence, but cannot waive whole-event validity.
  await db.query('select public.review_certification($1,$2,false,true,$3)', [cert, JSON.stringify(fields), 'Reviewed original evidence. Expiry is during the event.']);
  assert.equal((await one('select status from public.certifications where id=$1', [cert])).status, 'verified');
  notices = (await one('select public.my_notifications() as n')).n.filter(n => n.kind === 'certificate' && n.source_id === cert && !n.read_at);
  assert.equal(notices.length, 1, 'Approval leaves the expiry warning active');
  assert.match(notices[0].body, /during the event/);
  const revision =
    (await one('select setup_revision from public.events where id=$1', [event])).setup_revision;
  const roster = randomUUID();
  await db.query('select public.create_shift_draft($1,$2,4,$3)', [event, roster, revision]);
  await db.query('select public.create_shift_draft($1,$2,4,$3)', [event, roster, revision]);
  const shifts = (await one('select public.get_roster_context($1) as c', [roster])).c.shifts;
  assert.equal(shifts.length, 6, 'Operating windows split into four-hour shifts plus remainder');
  const current = () => one('select revision from public.rosters where id=$1', [roster]);
  const first = shifts[0];
  await db.query('select public.edit_shift($1,$2,$3,$4,$5,4)', [
    roster,
    (await current()).revision,
    first.id,
    '2026-11-01T10:00',
    '2026-11-01T13:00',
  ]);
  assert.ok(
    (await one('select public.get_roster_readiness($1) as r', [roster])).r.issues.some((i) =>
      typeof i === 'string' && i.includes('not covered')
    ),
    'Shortening a shift reveals operating coverage hole',
  );
  await db.query('select public.edit_shift($1,$2,$3,$4,$5,4)', [
    roster,
    (await current()).revision,
    first.id,
    '2026-11-01T09:00',
    '2026-11-01T13:00',
  ]);
  const crew = [vol];
  for (let i = 0; i < 3; i++) {
    const uid = randomUUID();
    crew.push(uid);
    await db.exec('reset role');
    await db.query('insert into auth.users(id,email) values($1,$2)', [uid, `crew${i}@example.com`]);
    await asUser(uid);
    await db.query('select public.join_event($1,$2)', ['RIVERSIDE26', event]);
    await save();
  }
  await asUser(mo);
  for (const shift of shifts) {
    for (const uid of crew) {
      await db.query('select public.set_roster_assignment($1,$2,$3,$4)', [
        roster,
        (await current()).revision,
        shift.id,
        uid,
      ]);
    }
  }
  await rejects('select public.set_roster_assignment($1,$2,$3,$4)', [
    roster,
    (await current()).revision,
    first.id,
    vol,
  ], /Overlapping/);
  let ready = (await one('select public.get_roster_readiness($1) as r', [roster])).r;
  assert.ok(
    ready.issues.some((i) => i.message?.includes('Qualification gap')),
    'Certificate expiring during the event cannot provide coverage',
  );
  await rejects('select public.publish_roster($1,$2,$3)', [
    roster,
    ready.revision,
    ready.staffingRevision,
  ], /Resolve roster/);
  fields.expiresAt = '2027-12-31';
  await db.query('select public.review_certification($1,$2,false,true,$3)', [
    cert,
    JSON.stringify(fields),
    'Original confirms expiry 31 December 2027.',
  ]);
  assert.equal((await one('select public.my_notifications() as n')).n.filter(n => n.kind === 'certificate' && n.source_id === cert && !n.read_at).length, 0, 'Correcting and approving clears certificate attention, retains history');
  ready = (await one('select public.get_roster_readiness($1) as r', [roster])).r;
  assert.equal(ready.ready, true, JSON.stringify(ready.issues));
  const context = (await one('select public.get_roster_context($1) as c', [roster])).c;
  const generated = context.assignments.map((a) => ({
    shiftId: a.shift_id,
    userId: a.user_id,
    locked: true,
  }));
  const generation = randomUUID();
  await db.query('select public.apply_roster_generation($1,$2,$3,$4,$5)', [
    roster,
    context.roster.revision,
    context.event.staffing_revision,
    generation,
    JSON.stringify(generated),
  ]);
  await db.query('select public.apply_roster_generation($1,$2,$3,$4,$5)', [
    roster,
    context.roster.revision,
    context.event.staffing_revision,
    generation,
    JSON.stringify(generated),
  ]);
  assert.equal(
    (await one('select revision from public.rosters where id=$1', [roster])).revision,
    context.roster.revision + 1,
    'Generation retry applies once and preserves manual locks',
  );
  ready = (await one('select public.get_roster_readiness($1) as r', [roster])).r;

  await rejects('select public.apply_roster_generation($1,$2,$3,$4,$5)', [
    roster,
    0,
    context.event.staffing_revision,
    randomUUID(),
    '[]',
  ], /changed/);
  await db.query('select public.publish_roster($1,$2,$3)', [
    roster,
    ready.revision,
    ready.staffingRevision,
  ]);
  await db.query('select public.publish_roster($1,$2,$3)', [roster, ready.revision, ready.staffingRevision]);
  await asUser(vol);
  assert.ok(
    (await one('select public.preview_event_join($1) as p', ['RIVERSIDE26'])).p,
    'Published events still allow recruitment',
  );
  const schedule = (await one('select public.my_event_schedule($1) as s', [event])).s;
  assert.equal(schedule.published, true);
  assert.equal(schedule.shifts.length, 6);
  assert.ok(schedule.shifts.every((s) => !('user_id' in s) && !('certifications' in s)));
  assert.equal(
    (await query('select * from public.assignments')).length,
    0,
    'Volunteer cannot see crew roster',
  );
  await asUser(mo);
  const replacement = randomUUID();
  await db.query('select public.create_shift_draft($1,$2,4,$3)', [event, replacement, revision]);
  const rshift =
    (await one('select public.get_roster_context($1) as c', [replacement])).c.shifts[0];
  await db.query('select public.set_roster_assignment($1,0,$2,$3)', [replacement, rshift.id, vol]);
  assert.equal(
    (await one('select public.get_roster_readiness($1) as r', [roster])).r.ready,
    true,
    'Replacement draft does not conflict with old publication',
  );
  await asUser(vol);
  await db.query('select public.archive_certification($1)', [cert]);
  assert.equal(
    (await one('select public.my_event_schedule($1) as s', [event])).s.shifts.length,
    6,
    'Certificate changes retain published instructions',
  );
  await asUser(mo);
  assert.equal(
    (await one('select public.get_roster_readiness($1) as r', [roster])).r.ready,
    false,
    'Archived certificate exposes qualification gap',
  );
  // Retain publication history without interfering with the setup-removal scenarios below.
  await db.exec('reset role');
  await db.query('delete from public.assignments where roster_id in ($1,$2)', [
    roster,
    replacement,
  ]);
  await db.query('delete from public.shifts where roster_id in ($1,$2)', [roster, replacement]);
  await db.query('delete from public.rosters where id in ($1,$2)', [roster, replacement]);
  await asUser(vol);
  console.log(
    'Certificate evidence/privacy, trusted extraction, event-date validity, availability rollback, shift coverage, roster publication, own schedules and replacement drafts passed.',
  );
};
