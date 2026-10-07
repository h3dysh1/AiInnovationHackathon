export type SiteMap = { id: string; event_id: string; storage_path: string; width: number; height: number; uploaded_by: string; updated_at: string; scale_start_x: number | null; scale_start_y: number | null; scale_end_x: number | null; scale_end_y: number | null; scale_distance_metres: number | null };
export type SiteLocation = { id: string; event_id: string; name: string; description: string | null; map_x: number | null; map_y: number | null; map_radius_percent: number | null; created_at: string };
export type PostCriticality = 'normal' | 'important' | 'critical';
export type Post = { id: string; event_id: string; location_id: string; name: string; description: string; minimum_coverage: number; criticality: PostCriticality; instructions: string | null; supervisor: string | null; escalation: string | null; created_at: string; map_x: number | null; map_y: number | null; map_radius_percent: number | null; check_in_x: number | null; check_in_y: number | null; check_in_radius_percent: number | null };
export type PostRequirement = { id: string; post_id: string; certification_type: string | null; experience_requirement: string | null; minimum_count: number; created_at: string };

export type NamedDraft = { name: string; description: string };
export type LocationDraft = NamedDraft & { mapX: string; mapY: string };
export type PostDraft = NamedDraft & { minimumCoverage: string; criticality: PostCriticality; instructions: string; supervisor: string; escalation: string };
export type RequirementDraft = { certificationType: string; experienceRequirement: string; minimumCount: string };

export const emptyLocationDraft: LocationDraft = { name: '', description: '', mapX: '', mapY: '' };
export const emptyPostDraft: PostDraft = { name: '', description: '', minimumCoverage: '1', criticality: 'normal', instructions: '', supervisor: '', escalation: '' };
export const emptyRequirementDraft: RequirementDraft = { certificationType: '', experienceRequirement: '', minimumCount: '1' };

export function validateNamedDraft(draft: NamedDraft): string | null {
  if (!draft.name.trim() || draft.name.trim().length > 120) return 'Name must be 1–120 characters.';
  if (draft.description.length > 1000) return 'Description must be at most 1,000 characters.';
  return null;
}

export function validateLocationDraft(draft: LocationDraft): string | null {
  const basic = validateNamedDraft(draft);
  if (basic) return basic;
  const hasX = draft.mapX.trim() !== '';
  const hasY = draft.mapY.trim() !== '';
  if (hasX !== hasY) return 'Enter both map coordinates or leave both blank.';
  if (hasX && (![draft.mapX, draft.mapY].every(value => /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 100))) {
    return 'Map coordinates must be percentages from 0 to 100.';
  }
  return null;
}

export function validatePostDraft(draft: PostDraft): string | null {
  const basic = validateNamedDraft(draft);
  if (basic) return basic;
  if (!/^\d+$/.test(draft.minimumCoverage.trim()) || Number(draft.minimumCoverage) < 1 || Number(draft.minimumCoverage) > 10000) {
    return 'Minimum coverage must be a positive whole number.';
  }
  if (draft.supervisor.length > 120 || draft.escalation.length > 300) return 'Supervisor must be at most 120 characters and escalation contact 300.';
  if (draft.instructions.length > 2000) return 'Instructions must be at most 2,000 characters.';
  return null;
}

export function validateRequirementDraft(draft: RequirementDraft, coverage: number): string | null {
  if (!draft.certificationType.trim() && !draft.experienceRequirement.trim()) return 'Enter a certification or experience requirement.';
  if (draft.certificationType.trim().length > 120 || draft.experienceRequirement.trim().length > 120) return 'Qualification labels must be at most 120 characters.';
  if (!/^\d+$/.test(draft.minimumCount.trim()) || Number(draft.minimumCount) < 1 || Number(draft.minimumCount) > coverage) {
    return `Required count must be between 1 and the post minimum coverage (${coverage}).`;
  }
  return null;
}
