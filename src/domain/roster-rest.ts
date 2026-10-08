export type RestRules = { minimum_rest_hours: number; minimum_break_minutes: number; maximum_continuous_hours: number };
export type WorkInterval = { starts_at: string; ends_at: string };

export function restProblem(intervals: WorkInterval[], rules: RestRules, day: (iso: string) => string): string | null {
  const ordered = [...intervals].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  let blockStart = 0, blockEnd = 0;
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
    const start = Date.parse(current.starts_at), end = Date.parse(current.ends_at);
    const previous = ordered[i - 1];
    const gap = previous ? (start - Date.parse(previous.ends_at)) / 3600000 : Infinity;
    if (previous && gap < 0) return 'Overlapping shifts';
    if (previous && day(previous.starts_at) !== day(current.starts_at) && gap + 1e-6 < rules.minimum_rest_hours) return 'Minimum rest between work days not met';
    if (!previous || gap * 60 + 1e-6 >= rules.minimum_break_minutes && gap > 0) { blockStart = start; blockEnd = end; }
    else blockEnd = Math.max(blockEnd, end);
    if (rules.maximum_continuous_hours > 0 && (blockEnd - blockStart) / 3600000 > rules.maximum_continuous_hours + 1e-6) return 'Maximum continuous work exceeded; add a sufficient break between shifts';
  }
  return null;
}
