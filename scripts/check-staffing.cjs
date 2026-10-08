const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  ts = require('typescript');
const { test } = require('node:test');
function load(file, deps = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      Error,
      Date,
      Intl,
      Map,
      require: (n) => {
        if (!(n in deps)) throw new Error(n);
        return deps[n];
      },
    },
  );
  return exports;
}
const plan = load('src/domain/operating-plan.ts');
const cert = load('src/domain/certification.ts', { './operating-plan.ts': plan });
const rules = load('src/domain/roster.ts', { './certification.ts': cert, './roster-rest.ts': load('src/domain/roster-rest.ts') });
const iso = (h) => `2026-12-12T${String(h).padStart(2, '0')}:00:00Z`;
function fixture() {
  const requirement = {
    certification_type: 'First Aid',
    experience_requirement: null,
    minimum_count: 1,
  };
  const ctx = {
    event: {
      id: 'event',
      name: 'Riverside',
      start_date: '2026-12-12',
      end_date: '2026-12-14',
      timezone: 'UTC',
      model_status: 'verified',
    },
    roster: { id: 'r', status: 'draft' },
    shifts: [{
      id: 's',
      roster_id: 'r',
      event_id: 'event',
      post_id: 'p',
      starts_at: iso(9),
      ends_at: iso(13),
      minimum_coverage: 4,
      requirements: [requirement],
      criticality: 'critical',
    }],
    assignments: [],
    externalAssignments: [],
    posts: [],
    crew: [],
  };
  for (let i = 0; i < 6; i++) {
    ctx.crew.push({
      user_id: `u${i}`,
      display_name: `Crew ${i}`,
      onboarding: {
        preferred_posts: [],
        avoided_posts: [],
        desired_hours: 8,
        maximum_hours: 16,
        maximum_daily_hours: 8,
        experience_tags: [],
        experience_reviewed: false,
      },
      availability: [{ starts_at: iso(8), ends_at: iso(18) }],
      certifications: i === 0
        ? [{
          type: 'HLTAID011',
          status: 'verified',
          issued_at: '2026-01-01',
          expires_at: '2027-01-01',
          never_expires: false,
        }]
        : [],
    });
  }
  return ctx;
}
test('certificate runtime schema rejects hallucinated dates, confidence and missing fields', () => {
  const base = {
    type: 'First Aid',
    holderName: 'Sarah',
    issuer: null,
    certificateNumber: null,
    issuedAt: '2026-01-01',
    expiresAt: '2027-01-01',
    confidence: .95,
  };
  assert.equal(cert.validateCertificateFields(base).type, 'First Aid');
  assert.throws(
    () => cert.validateCertificateFields({ ...base, expiresAt: '2026-02-30' }),
    /dates/,
  );
  assert.throws(() => cert.validateCertificateFields({ ...base, confidence: 2 }), /confidence/);
  assert.throws(() => cert.validateCertificateFields({ ...base, type: undefined }), /type/);
});
test('holder identity matching and known course aliases are conservative', () => {
  assert.equal(cert.holderMatches('Sarah Smith', 'SARAH SMITH'), true);
  assert.equal(cert.holderMatches('Sarah', 'Alex'), false);
  assert.equal(cert.holderMatches('李', '李'), false);
  assert.equal(cert.qualificationKey('HLTAID011 Provide First Aid'), 'firstaid');
  assert.notEqual(cert.qualificationKey('First Aid awareness'), 'firstaid');
});
test('event dates require whole-event validity, known expiry or human no-expiry confirmation', () => {
  const c = fixture().crew[0].certifications[0];
  assert.equal(cert.certificateValidity(c, '2026-12-12', '2026-12-14'), null);
  assert.equal(
    cert.certificateValidity({ ...c, expires_at: '2026-12-11' }, '2026-12-12', '2026-12-14'),
    'Expires before event',
  );
  assert.equal(
    cert.certificateValidity({ ...c, expires_at: '2026-12-13' }, '2026-12-12', '2026-12-14'),
    'Expires during event',
  );
  assert.equal(
    cert.certificateValidity({ ...c, expires_at: null }, '2026-12-12', '2026-12-14'),
    'Expiry unknown',
  );
  assert.equal(
    cert.certificateValidity(
      { ...c, expires_at: null, never_expires: true },
      '2026-12-12',
      '2026-12-14',
    ),
    null,
  );
});
test('certificate date warnings remain visible before human approval', () => {
  const c = { ...fixture().crew[0].certifications[0], status: 'requires_review', expires_at: '2026-12-03' };
  assert.equal(cert.certificateValidity(c, '2026-12-12', '2026-12-14'), 'Requires verification');
  assert.match(cert.certificateDateWarnings(c, '2026-12-12', '2026-12-14')[0], /Expires 2026-12-03, before.*2026-12-12/);
  assert.match(cert.certificateDateWarnings({ ...c, expires_at: '2026-12-13' }, '2026-12-12', '2026-12-14')[0], /during the event/);
  assert.match(cert.certificateDateWarnings({ ...c, expires_at: null }, '2026-12-12', '2026-12-14')[0], /unknown/);
  assert.equal(cert.certificateDateWarnings({ ...c, expires_at: null, never_expires: true }, '2026-12-12', '2026-12-14').length, 0);
});
test('certificate alerts take managers to qualifications; malformed event references are rejected', () => {
  const notifications = load('src/services/notifications.ts', { './planning': {} });
  const base = { event_id: '11111111-1111-4111-8111-111111111111', kind: 'certificate', audience: 'manager' };
  assert.equal(notifications.notificationDestination(base).pathname, '/events/[id]/qualifications');
  assert.equal(notifications.notificationDestination({ ...base, audience: 'volunteer' }).pathname, '/events/[id]');
  assert.equal(notifications.notificationDestination({ ...base, event_id: 'bad' }), null);
});
test('four total includes one qualified volunteer rather than adding a fifth seat', () => {
  const c = fixture(), r = rules.generateRoster(c);
  assert.equal(r.complete, true);
  assert.equal(r.assignments.length, 4);
  assert.ok(r.assignments.some((a) => a.userId === 'u0'));
  assert.equal(rules.rosterCoverage(c, r.assignments)[0].qualifications[0].actual, 1);
});
test('scarce qualification goes to its required post before general seats', () => {
  const c = fixture();
  c.shifts.unshift({
    ...c.shifts[0],
    id: 'general',
    post_id: 'other',
    minimum_coverage: 2,
    requirements: [],
  });
  const r = rules.generateRoster(c);
  assert.equal(r.complete, true);
  assert.ok(r.assignments.some((a) => a.shiftId === 's' && a.userId === 'u0'));
  assert.equal(r.assignments.length, 6);
});
test('adjacent availability joins; a gap prevents assignment', () => {
  const c = fixture(), m = c.crew[0], s = c.shifts[0];
  m.availability = [{ starts_at: iso(9), ends_at: iso(11) }, {
    starts_at: iso(11),
    ends_at: iso(13),
  }];
  assert.equal(rules.assignmentProblem(c, [], s, m), null);
  m.availability[1].starts_at = iso(12);
  assert.equal(rules.assignmentProblem(c, [], s, m), 'Outside availability');
});
test('overlap, another event, daily hours and total hours are hard constraints', () => {
  const c = fixture(), m = c.crew[0], s = c.shifts[0];
  assert.equal(
    rules.assignmentProblem(c, [{ userId: m.user_id, shiftId: s.id }], s, m),
    'Overlapping shifts',
  );
  c.externalAssignments = [{ user_id: m.user_id, starts_at: iso(12), ends_at: iso(14) }];
  assert.equal(rules.assignmentProblem(c, [], s, m), 'Overlaps another event');
  c.externalAssignments = [];
  m.onboarding.maximum_daily_hours = 3;
  assert.equal(rules.assignmentProblem(c, [], s, m), 'Maximum daily hours exceeded');
  m.onboarding.maximum_daily_hours = 8;
  m.onboarding.maximum_hours = 3;
  assert.equal(rules.assignmentProblem(c, [], s, m), 'Maximum hours exceeded');
});
test('low-confidence/rejected/archived certificates cannot supply coverage', () => {
  for (const status of ['requires_review', 'rejected', 'archived', 'failed']) {
    const c = fixture();
    c.crew[0].certifications[0].status = status;
    assert.equal(rules.generateRoster(c).complete, false);
  }
});
test('manager reviewed experience is required independently of certificate', () => {
  const c = fixture();
  c.shifts[0].requirements[0].experience_requirement = 'crowd management';
  c.crew[0].onboarding.experience_tags = ['Crowd Management'];
  assert.equal(rules.generateRoster(c).complete, false);
  c.crew[0].onboarding.experience_reviewed = true;
  assert.equal(rules.generateRoster(c).complete, true);
});
test('locked manual assignments survive regeneration and invalid locks fail visibly', () => {
  const c = fixture();
  c.assignments = [{ id: 'a', shift_id: 's', user_id: 'u5', locked: true }];
  let r = rules.generateRoster(c);
  assert.ok(r.assignments.some((a) => a.userId === 'u5' && a.locked));
  c.crew[5].availability = [];
  assert.throws(() => rules.generateRoster(c), /invalid locked/);
});
test('preferences break ties and hours are distributed across feasible crew', () => {
  const c = fixture();
  c.shifts[0].requirements = [];
  c.shifts[0].minimum_coverage = 1;
  c.crew[4].onboarding.preferred_posts = ['p'];
  assert.equal(rules.generateRoster(c).assignments[0].userId, 'u4');
  c.crew[4].onboarding.preferred_posts = [];
  c.shifts.push({ ...c.shifts[0], id: 'later', starts_at: iso(13), ends_at: iso(17) });
  const r = rules.generateRoster(c);
  assert.notEqual(r.assignments[0].userId, r.assignments[1].userId);
});
test('unsatisfiable qualification produces visible partial candidate and obeys bounded search', () => {
  const c = fixture();
  c.crew[0].certifications = [];
  const r = rules.generateRoster(c, 1);
  assert.equal(r.complete, false);
  assert.ok(r.assignments.length <= 4);
  assert.ok(rules.rosterCoverage(c, r.assignments)[0].qualifications[0].actual < 1);
});
test('canonical-size generation completes within a practical execution budget', () => {
  const c = fixture();
  for (let i = 1; i < 12; i++) {
    c.shifts.push({
      ...c.shifts[0],
      id: `shift${i}`,
      starts_at: `2026-12-${String(12 + Math.floor(i / 3)).padStart(2, '0')}T${
        String(9 + (i % 3) * 3).padStart(2, '0')
      }:00:00Z`,
      ends_at: `2026-12-${String(12 + Math.floor(i / 3)).padStart(2, '0')}T${
        String(12 + (i % 3) * 3).padStart(2, '0')
      }:00:00Z`,
    });
  }
  c.crew = [];
  for (let i = 0; i < 40; i++) {
    const m = fixture().crew[i % 6];
    m.user_id = `crew${i}`;
    m.onboarding.maximum_hours = 40;
    m.onboarding.maximum_daily_hours = 12;
    m.availability = [{ starts_at: '2026-12-12T08:00:00Z', ends_at: '2026-12-15T22:00:00Z' }];
    c.crew.push(m);
  }
  const start = performance.now();
  const r = rules.generateRoster(c, 400);
  assert.equal(r.complete, true);
  assert.ok(performance.now() - start < 3000);
});
