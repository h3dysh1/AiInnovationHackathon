import { certificateValidity, type Certification, qualificationKey } from './certification.ts';
export type Availability = {
  id: string;
  event_id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
};
export type Onboarding = {
  event_id: string;
  user_id: string;
  preferred_posts: string[];
  avoided_posts: string[];
  preferred_start: string | null;
  preferred_end: string | null;
  desired_hours: number;
  maximum_hours: number;
  maximum_daily_hours: number;
  experience_tags: string[];
  experience_reviewed: boolean;
  submitted_at: string;
};
export type ShiftRequirement = {
  certification_type: string | null;
  experience_requirement: string | null;
  minimum_count: number;
};
export type Shift = {
  id: string;
  roster_id: string;
  event_id: string;
  post_id: string;
  starts_at: string;
  ends_at: string;
  minimum_coverage: number;
  requirements: ShiftRequirement[];
  criticality: 'normal' | 'important' | 'critical';
  instructions: string | null;
};
export type Assignment = {
  id: string;
  roster_id: string;
  shift_id: string;
  user_id: string;
  locked: boolean;
  assigned_at: string;
};
export type Roster = {
  id: string;
  event_id: string;
  model_revision: number;
  revision: number;
  status: 'draft' | 'published' | 'superseded';
  published_at: string | null;
  created_at: string;
  last_generation_id: string | null;
};
export type CrewMember = {
  user_id: string;
  display_name: string;
  onboarding: Onboarding | null;
  availability: Availability[];
  certifications: Certification[];
};
export type RosterContext = {
  event: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    timezone: string;
    setup_revision: number;
    model_status: string;
    staffing_revision: number;
  };
  roster: Roster;
  shifts: Shift[];
  assignments: Assignment[];
  crew: CrewMember[];
  externalAssignments: { user_id: string; starts_at: string; ends_at: string }[];
  posts: { id: string; name: string; location_name: string }[];
};
export type ProposedAssignment = { shiftId: string; userId: string; locked: boolean };
export function overlaps(a: string, b: string, c: string, d: string) {
  return Date.parse(a) < Date.parse(d) && Date.parse(c) < Date.parse(b);
}
export function shiftHours(shift: Pick<Shift, 'starts_at' | 'ends_at'>) {
  return (Date.parse(shift.ends_at) - Date.parse(shift.starts_at)) / 3600000;
}
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
export function localDay(iso: string, zone: string) {
  let formatter = dayFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayFormatters.set(zone, formatter);
  }
  const p = formatter.formatToParts(new Date(iso));
  const val = (k: string) => p.find((x) => x.type === k)?.value;
  return `${val('year')}-${val('month')}-${val('day')}`;
}
export function qualified(member: CrewMember, r: ShiftRequirement, ctx: RosterContext) {
  return (!r.certification_type ||
    member.certifications.some((c) =>
      certificateValidity(
        c,
        ctx.event.start_date,
        ctx.event.end_date,
        r.certification_type ?? undefined,
      ) === null
    )) &&
    (!r.experience_requirement ||
      Boolean(
        member.onboarding?.experience_reviewed &&
          member.onboarding.experience_tags.some((t) =>
            qualificationKey(t) === qualificationKey(r.experience_requirement!)
          ),
      ));
}
export function assignmentProblem(
  ctx: RosterContext,
  chosen: ProposedAssignment[],
  shift: Shift,
  member: CrewMember,
): string | null {
  const p = member.onboarding;
  if (!p) return 'Availability not submitted';
  const windows = [...member.availability].sort((a, b) =>
    Date.parse(a.starts_at) - Date.parse(b.starts_at)
  );
  let until = Date.parse(shift.starts_at);
  for (const w of windows) {
    if (Date.parse(w.starts_at) <= until && Date.parse(w.ends_at) > until) {
      until = Date.parse(w.ends_at);
    }
  }
  if (until < Date.parse(shift.ends_at)) return 'Outside availability';
  if (
    ctx.externalAssignments.some((a) =>
      a.user_id === member.user_id &&
      overlaps(a.starts_at, a.ends_at, shift.starts_at, shift.ends_at)
    )
  ) return 'Overlaps another event';
  const assigned = chosen.filter((a) => a.userId === member.user_id).map((a) =>
    ctx.shifts.find((s) => s.id === a.shiftId)!
  ).filter(Boolean);
  if (assigned.some((s) => overlaps(s.starts_at, s.ends_at, shift.starts_at, shift.ends_at))) {
    return 'Overlapping shifts';
  }
  const hours = shiftHours(shift);
  if (assigned.reduce((n, s) => n + shiftHours(s), hours) > p.maximum_hours + 1e-6) {
    return 'Maximum hours exceeded';
  }
  const day = localDay(shift.starts_at, ctx.event.timezone);
  if (
    assigned.filter((s) => localDay(s.starts_at, ctx.event.timezone) === day).reduce(
      (n, s) => n + shiftHours(s),
      hours,
    ) > p.maximum_daily_hours + 1e-6
  ) return 'Maximum daily hours exceeded';
  return null;
}
export type Coverage = {
  shift: Shift;
  assigned: number;
  missing: number;
  qualifications: { label: string; required: number; actual: number }[];
  invalid: string[];
};
export function rosterCoverage(
  ctx: RosterContext,
  chosen: ProposedAssignment[] = ctx.assignments.map((a) => ({
    shiftId: a.shift_id,
    userId: a.user_id,
    locked: a.locked,
  })),
): Coverage[] {
  return ctx.shifts.map((shift) => {
    const a = chosen.filter((a) => a.shiftId === shift.id);
    const invalid: string[] = [];
    for (const assignment of a) {
      const m = ctx.crew.find((m) => m.user_id === assignment.userId);
      const reason = m
        ? assignmentProblem(ctx, chosen.filter((x) => x !== assignment), shift, m)
        : 'Inactive event membership';
      if (reason) invalid.push(`${m?.display_name ?? 'Volunteer'}: ${reason}`);
    }
    return {
      shift,
      assigned: a.length,
      missing: Math.max(0, shift.minimum_coverage - a.length),
      qualifications: shift.requirements.map((r) => ({
        label: [r.certification_type, r.experience_requirement].filter(Boolean).join(' / '),
        required: r.minimum_count,
        actual: a.filter((a) => {
          const m = ctx.crew.find((m) => m.user_id === a.userId);
          return m && qualified(m, r, ctx);
        }).length,
      })),
      invalid,
    };
  });
}
// Bounded deterministic search: fill scarce qualifications first, then general seats.
// If a complete solution is not found, return the best valid partial draft with visible gaps.
export function generateRoster(
  ctx: RosterContext,
  nodeBudget = 12000,
): { assignments: ProposedAssignment[]; complete: boolean; searchLimited: boolean } {
  const qualificationCache = new Map<string, boolean>();
  const meets = (member: CrewMember, req: ShiftRequirement) => {
    const key = member.user_id + '|' + JSON.stringify(req);
    let result = qualificationCache.get(key);
    if (result === undefined) {
      result = qualified(member, req, ctx);
      qualificationCache.set(key, result);
    }
    return result;
  };
  const scarcityCache = new Map<string, number>();
  const startMinutes = new Map(ctx.shifts.map((s) => {
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: ctx.event.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(s.starts_at));
    return [
      s.id,
      Number(p.find((x) => x.type === 'hour')?.value) * 60 +
      Number(p.find((x) => x.type === 'minute')?.value),
    ];
  }));
  const initial = ctx.assignments.filter((a) => a.locked).map((a) => ({
    shiftId: a.shift_id,
    userId: a.user_id,
    locked: true,
  }));
  if (
    rosterCoverage(ctx, initial).some((c) =>
      c.invalid.length || c.assigned > c.shift.minimum_coverage
    )
  ) throw new Error('Correct invalid locked assignments before generating.');
  let best = [...initial], nodes = 0, complete = false;
  const chosen = [...initial];
  function candidates(shift: Shift, req?: ShiftRequirement) {
    return ctx.crew.filter((m) =>
      !chosen.some((a) => a.shiftId === shift.id && a.userId === m.user_id) &&
      !assignmentProblem(ctx, chosen, shift, m) && (!req || meets(m, req))
    );
  }
  function score(m: CrewMember, s: Shift) {
    const p = m.onboarding!;
    const used = chosen.filter((a) => a.userId === m.user_id).reduce(
      (n, a) => n + shiftHours(ctx.shifts.find((s) => s.id === a.shiftId)!),
      0,
    );
    let scarcity = scarcityCache.get(m.user_id);
    if (scarcity === undefined) {
      scarcity = ctx.shifts.reduce(
        (n, s) => n + s.requirements.filter((r) => meets(m, r)).length,
        0,
      );
      scarcityCache.set(m.user_id, scarcity);
    }
    const minute = startMinutes.get(s.id)!;
    const toMinutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
    const preferredTime = p.preferred_start && p.preferred_end &&
      minute >= toMinutes(p.preferred_start) && minute < toMinutes(p.preferred_end);
    return used / Math.max(1, p.desired_hours) * 8 +
      (p.avoided_posts.includes(s.post_id) ? 10 : 0) -
      (p.preferred_posts.includes(s.post_id) ? 5 : 0) - (preferredTime ? 2 : 0) + scarcity * .1;
  }
  function search() {
    if (++nodes > nodeBudget) return false;
    if (chosen.length > best.length) best = [...chosen];
    let task: { s: Shift; c: CrewMember[]; need: number } | null = null;
    let done = true;
    for (const s of ctx.shifts) {
      const current = chosen.filter((a) => a.shiftId === s.id);
      const free = s.minimum_coverage - current.length;
      if (free <= 0) {
        if (
          s.requirements.some((r) =>
            current.filter((a) => meets(ctx.crew.find((m) => m.user_id === a.userId)!, r))
              .length < r.minimum_count
          )
        ) return false;
        continue;
      }
      done = false;
      let req: ShiftRequirement | undefined;
      let c = candidates(s);
      let need = free;
      for (const r of s.requirements) {
        const missing = r.minimum_count -
          current.filter((a) => meets(ctx.crew.find((m) => m.user_id === a.userId)!, r))
            .length;
        if (missing > 0) {
          const eligible = candidates(s, r);
          if (!req || eligible.length / missing < c.length / need) {
            req = r;
            c = eligible;
            need = missing;
          }
        }
      }
      if (
        !task || c.length / need < task.c.length / task.need ||
        c.length / need === task.c.length / task.need && s.criticality === 'critical'
      ) task = { s, c, need };
    }
    if (done) {
      complete = true;
      best = [...chosen];
      return true;
    }
    if (!task || task.c.length < task.need) return false;
    task.c.sort((a, b) =>
      score(a, task!.s) - score(b, task!.s) || a.user_id.localeCompare(b.user_id)
    );
    for (const m of task.c) {
      chosen.push({ shiftId: task.s.id, userId: m.user_id, locked: false });
      if (search()) return true;
      chosen.pop();
      if (nodes > nodeBudget) break;
    }
    return false;
  }
  search();
  if (!complete) { // Fill remaining feasible seats even when one unsatisfiable task stopped search.
    chosen.splice(0, chosen.length, ...best);
    for (
      const s of [...ctx.shifts].sort((a, b) =>
        (a.criticality === 'critical' ? -1 : 0) - (b.criticality === 'critical' ? -1 : 0) ||
        a.starts_at.localeCompare(b.starts_at)
      )
    ) {
      while (chosen.filter((a) => a.shiftId === s.id).length < s.minimum_coverage) {
        const current = chosen.filter((a) => a.shiftId === s.id);
        const missing = s.requirements.find((r) =>
          current.filter((a) => meets(ctx.crew.find((m) => m.user_id === a.userId)!, r))
            .length < r.minimum_count
        );
        const eligible = candidates(s, missing);
        if (!eligible.length) break;
        eligible.sort((a, b) => score(a, s) - score(b, s) || a.user_id.localeCompare(b.user_id));
        chosen.push({ shiftId: s.id, userId: eligible[0].user_id, locked: false });
      }
    }
    best = [...chosen];
  }
  return {
    assignments: best,
    complete: rosterCoverage(ctx, best).every((c) =>
      !c.missing && !c.invalid.length && c.qualifications.every((q) => q.actual >= q.required)
    ),
    searchLimited: nodes > nodeBudget,
  };
}
