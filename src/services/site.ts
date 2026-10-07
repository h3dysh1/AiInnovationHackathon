import { decode } from 'base64-arraybuffer';
import type { SiteMap, SiteLocation, Post, PostRequirement, LocationDraft, PostDraft, RequirementDraft } from '@/domain/site';
import { validateLocationDraft, validatePostDraft, validateRequirementDraft } from '@/domain/site';
import { supabase } from '@/services/supabase';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function getSiteMap(eventId: string): Promise<SiteMap | null> {
  const { data, error } = await client().from('event_maps').select('*').eq('event_id', eventId).maybeSingle();
  if (error) throw error;
  return data as SiteMap | null;
}

export async function getSiteMapUrl(path: string): Promise<string> {
  const { data, error } = await client().storage.from('site-maps').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadSiteMap(eventId: string, userId: string, base64: string, width: number, height: number): Promise<SiteMap> {
  if (!base64 || Math.ceil(base64.length * 0.75) > 10485760) throw new Error('Choose a map image smaller than 10 MB.');
  const previous = await getSiteMap(eventId);
  const path = `${eventId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const storage = client().storage.from('site-maps');
  const { error: uploadError } = await storage.upload(path, decode(base64), { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await client().from('event_maps').upsert({
    event_id: eventId, storage_path: path, width, height, uploaded_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: 'event_id' }).select('*').single();
  let saved = error ? null : data as SiteMap | null;
  if (error) {
    // A lost network reply can occur after the database commits. Confirm the
    // saved path before deleting any uploaded file; otherwise retain it.
    try {
      const current = await getSiteMap(eventId);
      if (current?.storage_path === path) saved = current;
      else await storage.remove([path]);
    } catch { /* Keep the upload when its authoritative reference is unknown. */ }
    if (!saved) throw error;
  }
  if (!saved) throw new Error('Could not confirm the saved site map. Reopen it before retrying.');
  if (previous && previous.storage_path !== path) {
    try { await storage.remove([previous.storage_path]); }
    catch { /* A cleanup failure must not undo or hide the successfully saved map. */ }
  }
  return saved;
}

export async function listLocations(eventId: string): Promise<SiteLocation[]> {
  const { data, error } = await client().from('locations').select('*').eq('event_id', eventId).order('name');
  if (error) throw error;
  return data as SiteLocation[];
}

export async function getLocation(id: string): Promise<SiteLocation> {
  const { data, error } = await client().from('locations').select('*').eq('id', id).single();
  if (error) throw error;
  return data as SiteLocation;
}

function locationValues(draft: LocationDraft) {
  return { name: draft.name.trim(), description: draft.description.trim() || null };
}

export async function createLocation(eventId: string, draft: LocationDraft): Promise<SiteLocation> {
  const problem = validateLocationDraft(draft);
  if (problem) throw new Error(problem);
  const { data, error } = await client().from('locations').insert({ event_id: eventId, ...locationValues(draft) }).select('*').single();
  if (error) throw error;
  return data as SiteLocation;
}

export async function updateLocation(id: string, draft: LocationDraft): Promise<SiteLocation> {
  const problem = validateLocationDraft(draft);
  if (problem) throw new Error(problem);
  const { data, error } = await client().from('locations').update(locationValues(draft)).eq('id', id).select('*').single();
  if (error) throw error;
  return data as SiteLocation;
}

export async function listPosts(locationId: string): Promise<Post[]> {
  const { data, error } = await client().from('posts').select('*').eq('location_id', locationId).order('name');
  if (error) throw error;
  return data as Post[];
}

export async function getPost(id: string): Promise<Post> {
  const { data, error } = await client().from('posts').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Post;
}

function postValues(draft: PostDraft) {
  return { name: draft.name.trim(), description: draft.description.trim(), minimum_coverage: Number(draft.minimumCoverage),
    supervisor: draft.supervisor.trim() || null, escalation: draft.escalation.trim() || null, criticality: draft.criticality, instructions: draft.instructions.trim() || null };
}

export async function createPost(eventId: string, locationId: string, draft: PostDraft): Promise<Post> {
  const problem = validatePostDraft(draft);
  if (problem) throw new Error(problem);
  const { data, error } = await client().from('posts').insert({ event_id: eventId, location_id: locationId, ...postValues(draft) }).select('*').single();
  if (error) throw error;
  return data as Post;
}

export async function updatePost(id: string, draft: PostDraft): Promise<Post> {
  const problem = validatePostDraft(draft);
  if (problem) throw new Error(problem);
  const { data, error } = await client().from('posts').update(postValues(draft)).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Post;
}

export async function listRequirements(postId: string): Promise<PostRequirement[]> {
  const { data, error } = await client().from('post_requirements').select('*').eq('post_id', postId).order('created_at');
  if (error) throw error;
  return data as PostRequirement[];
}

function requirementValues(draft: RequirementDraft) {
  return { certification_type: draft.certificationType.trim() || null,
    experience_requirement: draft.experienceRequirement.trim() || null,
    minimum_count: Number(draft.minimumCount) };
}

export async function createRequirement(postId: string, coverage: number, draft: RequirementDraft): Promise<PostRequirement> {
  const problem = validateRequirementDraft(draft, coverage);
  if (problem) throw new Error(problem);
  const { data, error } = await client().from('post_requirements').insert({ post_id: postId, ...requirementValues(draft) }).select('*').single();
  if (error) throw error;
  return data as PostRequirement;
}

export async function updateRequirement(id: string, coverage: number, draft: RequirementDraft): Promise<PostRequirement> {
  const problem = validateRequirementDraft(draft, coverage);
  if (problem) throw new Error(problem);
  const { data, error } = await client().from('post_requirements').update(requirementValues(draft)).eq('id', id).select('*').single();
  if (error) throw error;
  return data as PostRequirement;
}

export async function removeRequirement(id: string): Promise<void> {
  const { error } = await client().from('post_requirements').delete().eq('id', id);
  if (error) throw error;
}
