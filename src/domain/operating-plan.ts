// Shared by Expo, the server function and tests. No native dependencies.
export type Source = {
  sourceType: 'description' | 'document' | 'answer' | 'manual' | 'inference';
  sourceId: string | null;
  reference: string;
  confidence: number;
};
export type DraftRequirement = {
  certificationType: string | null;
  experienceRequirement: string | null;
  minimumCount: number | null;
};
export type DraftWindow = {
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  minimumCoverage: number | null;
};
export type DraftLocation = { key: string; name: string; description: string; source: Source };
export type DraftPost = {
  key: string;
  locationKey: string;
  name: string;
  description: string;
  minimumCoverage: number | null;
  criticality: 'normal' | 'important' | 'critical';
  supervisor: string | null;
  escalation: string | null;
  instructions: string;
  requirements: DraftRequirement[];
  windows: DraftWindow[];
  source: Source;
};
export type DraftProcedure = { key: string; title: string; content: string; source: Source };
export type DraftIssue = {
  key: string;
  postKey: string | null;
  severity: 'blocking' | 'review';
  question: string;
  evidence: string;
  sourceIds: string[];
};
export type OperatingPlan = {
  locations: DraftLocation[];
  posts: DraftPost[];
  procedures: DraftProcedure[];
  issues: DraftIssue[];
};
export type PlanContext = {
  eventId: string;
  startDate: string;
  endDate: string;
  sources: { id: string; type: string }[];
  locationIds: string[];
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected an object in the operating plan.');
  }
  return value as Record<string, unknown>;
}
function str(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) {
    throw new Error('Invalid or missing text in the operating plan.');
  }
  return value.trim();
}
function optional(value: unknown, max: number): string | null {
  return value === null ? null : str(value, max);
}
function count(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 10000) {
    throw new Error('Staffing counts must be positive whole numbers.');
  }
  return value as number;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error('Invalid or oversized list in the operating plan.');
  }
  return value;
}
export function validPlanDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function validPlanTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validateOperatingPlan(value: unknown, context: PlanContext): OperatingPlan {
  const root = object(value);
  const knownSources = new Map(context.sources.map((source) => [source.id, source.type]));
  function source(input: unknown): Source {
    const s = object(input);
    const type = str(s.sourceType, 20);
    if (!['description', 'document', 'answer', 'manual', 'inference'].includes(type)) {
      throw new Error('Unknown source type.');
    }
    const id = optional(s.sourceId, 100);
    if (
      ['description', 'document', 'answer'].includes(type) && (!id || knownSources.get(id) !== type)
    ) throw new Error('AI cited a source that is not part of this event.');
    if (['manual', 'inference'].includes(type) && id !== null) {
      throw new Error('Inferred sources must not invent IDs.');
    }
    if (
      typeof s.confidence !== 'number' || !Number.isFinite(s.confidence) || s.confidence < 0 ||
      s.confidence > 1
    ) throw new Error('Invalid confidence.');
    return {
      sourceType: type as Source['sourceType'],
      sourceId: id,
      reference: str(s.reference, 1000, true),
      confidence: s.confidence,
    };
  }
  const keys = new Set<string>();
  function key(value: unknown) {
    const result = str(value, 100);
    if (keys.has(result)) throw new Error('Duplicate draft reference.');
    keys.add(result);
    return result;
  }
  const locations = list(root.locations, 100).map((input) => {
    const r = object(input);
    return {
      key: key(r.key),
      name: str(r.name, 120),
      description: str(r.description, 1000, true),
      source: source(r.source),
    };
  });
  const locationKeys = new Set([...locations.map((item) => item.key), ...context.locationIds]);
  const posts = list(root.posts, 200).map((input) => {
    const p = object(input);
    const locationKey = str(p.locationKey, 100);
    if (!locationKeys.has(locationKey)) {
      throw new Error('AI referenced a location that does not exist.');
    }
    const criticality = str(p.criticality, 20);
    if (!['normal', 'important', 'critical'].includes(criticality)) {
      throw new Error('Unknown post criticality.');
    }
    const minimumCoverage = count(p.minimumCoverage);
    const requirements = list(p.requirements, 20).map((input) => {
      const r = object(input);
      const certificationType = optional(r.certificationType, 120),
        experienceRequirement = optional(r.experienceRequirement, 120);
      if (!certificationType && !experienceRequirement) {
        throw new Error('A qualification requirement needs a certification or experience label.');
      }
      const minimumCount = count(r.minimumCount);
      if (minimumCoverage !== null && minimumCount !== null && minimumCount > minimumCoverage) {
        throw new Error('Qualification counts exceed post coverage.');
      }
      return { certificationType, experienceRequirement, minimumCount };
    });
    const windows = list(p.windows, 40).map((input) => {
      const w = object(input);
      const startDate = optional(w.startDate, 10), endDate = optional(w.endDate, 10);
      const startTime = optional(w.startTime, 5), endTime = optional(w.endTime, 5);
      if (
        startDate &&
          (!validPlanDate(startDate) || startDate < context.startDate ||
            startDate > context.endDate) ||
        endDate &&
          (!validPlanDate(endDate) || endDate < context.startDate || endDate > context.endDate) ||
        startDate && endDate && endDate < startDate
      ) throw new Error('Operating dates must fall within this event.');
      if (
        startTime && !validPlanTime(startTime) || endTime && !validPlanTime(endTime) ||
        startTime && endTime && endTime <= startTime
      ) throw new Error('Operating hours must be a valid same-day window.');
      const coverage = count(w.minimumCoverage);
      if (
        coverage !== null &&
        requirements.some((r) => r.minimumCount !== null && r.minimumCount > coverage)
      ) throw new Error('Operating-window coverage cannot satisfy the qualifications.');
      return { startDate, endDate, startTime, endTime, minimumCoverage: coverage };
    });
    return {
      key: key(p.key),
      locationKey,
      name: str(p.name, 120),
      description: str(p.description, 1000, true),
      minimumCoverage,
      criticality: criticality as DraftPost['criticality'],
      supervisor: optional(p.supervisor, 120),
      escalation: optional(p.escalation, 300),
      instructions: str(p.instructions, 2000, true),
      requirements,
      windows,
      source: source(p.source),
    };
  });
  const locationNames = new Set<string>();
  for (const location of locations) {
    const name = location.name.toLowerCase();
    if (locationNames.has(name)) throw new Error('Duplicate location names need clarification.');
    locationNames.add(name);
  }
  const postNames = new Set<string>();
  for (const post of posts) {
    const name = `${post.locationKey}:${post.name.toLowerCase()}`;
    if (postNames.has(name)) throw new Error('Duplicate post names need clarification.');
    postNames.add(name);
    for (let i = 0; i < post.windows.length; i++) {
      const a = post.windows[i];
      for (const b of post.windows.slice(i + 1)) {
        if (
          a.startDate && a.endDate && a.startTime && a.endTime && b.startDate && b.endDate &&
          b.startTime && b.endTime &&
          a.startDate <= b.endDate && a.endDate >= b.startDate && a.startTime < b.endTime &&
          a.endTime > b.startTime
        ) {
          throw new Error('Overlapping operating windows need clarification.');
        }
      }
    }
  }
  const postKeys = new Set(posts.map((post) => post.key));
  const procedures = list(root.procedures, 100).map((input) => {
    const p = object(input);
    return {
      key: key(p.key),
      title: str(p.title, 160),
      content: str(p.content, 10000),
      source: source(p.source),
    };
  });
  const issues = list(root.issues, 100).map((input) => {
    const i = object(input);
    const postKey = optional(i.postKey, 100), severity = str(i.severity, 20);
    if (postKey && !postKeys.has(postKey)) {
      throw new Error('Unknown task in a clarification question.');
    }
    if (!['blocking', 'review'].includes(severity)) throw new Error('Unknown issue severity.');
    const sourceIds = list(i.sourceIds, 20).map((id) => str(id, 100));
    if (sourceIds.some((id) => !knownSources.has(id))) {
      throw new Error('A clarification cited an unknown source.');
    }
    return {
      key: key(i.key),
      postKey,
      severity: severity as DraftIssue['severity'],
      question: str(i.question, 1000),
      evidence: str(i.evidence, 2000, true),
      sourceIds,
    };
  });
  return { locations, posts, procedures, issues };
}

export function proposalGaps(plan: OperatingPlan): string[] {
  const gaps: string[] = [];
  if (!plan.posts.length) gaps.push('Add at least one staffed task.');
  for (const p of plan.posts) {
    if (p.minimumCoverage === null) gaps.push(`${p.name}: minimum staffing is missing.`);
    if (!p.supervisor) gaps.push(`${p.name}: supervisor is missing.`);
    if (!p.escalation) gaps.push(`${p.name}: escalation contact is missing.`);
    if (
      !p.windows.length ||
      p.windows.some((w) => !w.startDate || !w.endDate || !w.startTime || !w.endTime)
    ) gaps.push(`${p.name}: operating hours/dates are missing.`);
    if (p.requirements.some((r) => r.minimumCount === null)) {
      gaps.push(`${p.name}: qualification counts are missing.`);
    }
  }
  return gaps;
}

// Provider-neutral JSON Schema. Runtime validation above remains authoritative.
const text = { type: 'string' };
const nullableText = { type: ['string', 'null'] };
const nullableCount = { type: ['integer', 'null'], minimum: 1, maximum: 10000 };
function obj(properties: Record<string, unknown>) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
function array(items: unknown) {
  return { type: 'array', items };
}
const sourceSchema = obj({
  sourceType: {
    type: 'string',
    enum: ['description', 'document', 'answer', 'manual', 'inference'],
  },
  sourceId: nullableText,
  reference: text,
  confidence: { type: 'number', minimum: 0, maximum: 1 },
});
export const operatingPlanSchema = obj({
  locations: array(obj({ key: text, name: text, description: text, source: sourceSchema })),
  posts: array(
    obj({
      key: text,
      locationKey: text,
      name: text,
      description: text,
      minimumCoverage: nullableCount,
      criticality: { type: 'string', enum: ['normal', 'important', 'critical'] },
      supervisor: nullableText,
      escalation: nullableText,
      instructions: text,
      requirements: array(
        obj({
          certificationType: nullableText,
          experienceRequirement: nullableText,
          minimumCount: nullableCount,
        }),
      ),
      windows: array(
        obj({
          startDate: nullableText,
          endDate: nullableText,
          startTime: nullableText,
          endTime: nullableText,
          minimumCoverage: nullableCount,
        }),
      ),
      source: sourceSchema,
    }),
  ),
  procedures: array(obj({ key: text, title: text, content: text, source: sourceSchema })),
  issues: array(
    obj({
      key: text,
      postKey: nullableText,
      severity: { type: 'string', enum: ['blocking', 'review'] },
      question: text,
      evidence: text,
      sourceIds: array(text),
    }),
  ),
});
