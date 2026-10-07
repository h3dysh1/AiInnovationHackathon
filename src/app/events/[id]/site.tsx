import { errorMessage } from '@/domain/errors';
import { EventManagerGate } from '@/components/event-manager-gate';
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { LocationForm, PostForm, RequirementForm, SiteCard } from '@/components/site-forms';
import { Button, Loading, Notice, Page, Title } from '@/components/ui';
import { SiteMapUpload } from '@/components/site-map-upload';
import type { Event } from '@/domain/event';
import { emptyLocationDraft, emptyPostDraft, emptyRequirementDraft, type LocationDraft, type Post, type PostDraft, type PostRequirement, type RequirementDraft, type SiteLocation } from '@/domain/site';
import { useSiteMap } from '@/hooks/site-map';
import { removeSetupItem, moveSetupPost } from '@/services/planning';
import { getEvent } from '@/services/events';
import { createLocation, createPost, createRequirement, listLocations, listPosts, listRequirements, removeRequirement, updateLocation, updatePost, updateRequirement } from '@/services/site';

type Form = 'location-new' | 'location-edit' | 'post-new' | 'post-edit' | 'requirement-new' | 'requirement-edit' | null;

function SiteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const siteMap = useSiteMap(id);
  const [event, setEvent] = useState<Event | null>(null);
  const [locations, setLocations] = useState<SiteLocation[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [requirements, setRequirements] = useState<PostRequirement[]>([]);
  const [location, setLocation] = useState<SiteLocation | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [form, setForm] = useState<Form>(null);
  const [locationDraft, setLocationDraft] = useState<LocationDraft>(emptyLocationDraft);
  const [postDraft, setPostDraft] = useState<PostDraft>(emptyPostDraft);
  const [requirementDraft, setRequirementDraft] = useState<RequirementDraft>(emptyRequirementDraft);
  const [editingRequirementId, setEditingRequirementId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void Promise.all([getEvent(id), listLocations(id)]).then(([nextEvent, nextLocations]) => {
      if (!active) return;
      setEvent(nextEvent);
      setLocations(nextLocations);
    }).catch(cause => {
      if (active) setError(errorMessage(cause, 'Could not load site.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    setMessage(null);
    try { await action(); }
    catch (cause) { setError(errorMessage(cause, 'Could not save this change.')); }
    finally { setPending(false); }
  }

  async function openLocation(next: SiteLocation) {
    setLocation(next); setPost(null); setForm(null); setError(null);
    setPosts([]); setRequirements([]);
    setLoadingChildren(true);
    try { setPosts(await listPosts(next.id)); }
    catch (cause) { setError(errorMessage(cause, 'Could not load posts.')); }
    finally { setLoadingChildren(false); }
  }

  async function openPost(next: Post) {
    setPost(next); setForm(null); setError(null);
    setRequirements([]);
    setLoadingChildren(true);
    try { setRequirements(await listRequirements(next.id)); }
    catch (cause) { setError(errorMessage(cause, 'Could not load requirements.')); }
    finally { setLoadingChildren(false); }
  }

  function back() {
    setError(null); setMessage(null); setForm(null); setRemoveId(null);
    if (post) setPost(null);
    else if (location) setLocation(null);
    else router.dismissTo({ pathname: '/events/[id]/setup', params: { id } });
  }

  function startForm(next: Exclude<Form, null>) {
    setError(null); setMessage(null); setForm(next);
    if (next === 'location-new') setLocationDraft(emptyLocationDraft);
    if (next === 'location-edit' && location) setLocationDraft({ name: location.name, description: location.description ?? '', mapX: location.map_x?.toString() ?? '', mapY: location.map_y?.toString() ?? '' });
    if (next === 'post-new') setPostDraft(emptyPostDraft);
    if (next === 'post-edit' && post) setPostDraft({ name: post.name, description: post.description, minimumCoverage: post.minimum_coverage.toString(), criticality: post.criticality, instructions: post.instructions ?? '', supervisor: post.supervisor ?? '', escalation: post.escalation ?? '' });
    if (next === 'requirement-new') { setRequirementDraft(emptyRequirementDraft); setEditingRequirementId(null); }
  }

  async function saveLocation() {
    if (!id) return;
    await run(async () => {
      if (form === 'location-edit' && location) {
        const updated = await updateLocation(location.id, locationDraft);
        setLocation(updated);
        setLocations(items => items.map(item => item.id === updated.id ? updated : item).sort((a, b) => a.name.localeCompare(b.name)));
        setForm(null); setMessage('Location saved.');
      } else {
        const created = await createLocation(id, locationDraft);
        setLocations(items => [...items, created].sort((a, b) => a.name.localeCompare(b.name)));
        await openLocation(created);
        setMessage('Location created.');
      }
    });
  }

  async function savePost() {
    if (!id || !location) return;
    await run(async () => {
      if (form === 'post-edit' && post) {
        const updated = await updatePost(post.id, postDraft);
        setPost(updated);
        setPosts(items => items.map(item => item.id === updated.id ? updated : item).sort((a, b) => a.name.localeCompare(b.name)));
        setForm(null); setMessage('Post saved.');
      } else {
        const created = await createPost(id, location.id, postDraft);
        setPosts(items => [...items, created].sort((a, b) => a.name.localeCompare(b.name)));
        await openPost(created);
        setMessage('Post created.');
      }
    });
  }

  async function saveRequirement() {
    if (!post) return;
    await run(async () => {
      if (form === 'requirement-edit' && editingRequirementId) {
        const updated = await updateRequirement(editingRequirementId, post.minimum_coverage, requirementDraft);
        setRequirements(items => items.map(item => item.id === updated.id ? updated : item));
        setMessage('Requirement saved.');
      } else {
        const created = await createRequirement(post.id, post.minimum_coverage, requirementDraft);
        setRequirements(items => [...items, created]);
        setMessage('Requirement added.');
      }
      setForm(null); setEditingRequirementId(null);
    });
  }

  async function deleteRequirement(requirementId: string) {
    await run(async () => {
      await removeRequirement(requirementId);
      setRequirements(items => items.filter(item => item.id !== requirementId));
      setRemoveId(null); setMessage('Requirement removed.');
    });
  }

  if (loading) return <Loading label="Loading site…" />;
  if (!event) return <Page><Title>Site unavailable</Title><Notice message={error ?? 'Could not load this event.'} /><Button title="Back" onPress={() => router.back()} /></Page>;

  return <Page>
    <Title subtitle={event.name}>{post?.name ?? location?.name ?? 'Locations & posts'}</Title>
    {error ? <Notice message={error} /> : null}
    {message ? <Notice message={message} /> : null}
    {loadingChildren ? <Loading label="Loading details…" /> : null}

    {!location ? <>
      <SiteMapUpload state={siteMap} disabled={pending} />
      <Button title="Place locations & posts on the map" secondary disabled={pending || siteMap.uploading} onPress={() => router.navigate({ pathname: '/events/[id]/map', params: { id } })} />
      <Text style={styles.section}>Locations</Text>
      <Text style={styles.help}>Locations are physical places, such as Gate A. Each can have several posts for different staffed tasks.</Text>
      {locations.map(item => <SiteCard key={item.id} title={item.name} subtitle={item.description ?? 'View staffing posts'} onPress={() => { void openLocation(item); }} />)}
      {form === 'location-new' ? <LocationForm value={locationDraft} onChange={setLocationDraft} onSave={() => { void saveLocation(); }} onCancel={() => setForm(null)} pending={pending} saveLabel="Add location" /> : <Button title="Add location" disabled={pending} onPress={() => startForm('location-new')} />}
    </> : null}

    {location && !post ? <>
      {location.description ? <Text style={styles.help}>{location.description}</Text> : null}
      {location.map_x !== null ? <Text style={styles.help}>Map position: {location.map_x}%, {location.map_y}%</Text> : null}
      {form === 'location-edit' ? <LocationForm value={locationDraft} onChange={setLocationDraft} onSave={() => { void saveLocation(); }} onCancel={() => setForm(null)} pending={pending} saveLabel="Save location" /> : <Button title="Edit location" secondary onPress={() => startForm('location-edit')} />}
      {removeId === location.id ? <>
        <Notice message="Remove this empty location? Its change history will be retained." />
        <Button title="Confirm remove location" disabled={pending} onPress={() => { void run(async () => { await removeSetupItem(id, 'location', location.id); setLocations(items => items.filter(item => item.id !== location.id)); setLocation(null); setRemoveId(null); }); }} />
        <Button title="Cancel" secondary onPress={() => setRemoveId(null)} />
      </> : <Button title="Remove empty location" secondary disabled={pending || loadingChildren || posts.length > 0} onPress={() => setRemoveId(location.id)} />}
      <Text style={styles.section}>Staffing posts</Text>
      {posts.length === 0 ? <Text style={styles.help}>Add staffed tasks here, such as ticket checking and queue management. Each post has its own staffing requirements.</Text> : null}
      {posts.map(item => <SiteCard key={item.id} title={item.name} subtitle={`${item.minimum_coverage} minimum · ${item.criticality}`} onPress={() => { void openPost(item); }} />)}
      {form === 'post-new' ? <PostForm value={postDraft} onChange={setPostDraft} onSave={() => { void savePost(); }} onCancel={() => setForm(null)} pending={pending} saveLabel="Add post" /> : <Button title="Add post" onPress={() => startForm('post-new')} />}
    </> : null}

    {post ? <>
      <View style={styles.card}>
        <Text style={styles.badge}>{post.criticality.toUpperCase()}</Text>
        <Text style={styles.cardTitle}>Minimum coverage: {post.minimum_coverage}</Text>
        {post.description ? <Text style={styles.help}>{post.description}</Text> : null}
        {post.instructions ? <Text style={styles.help}>Instructions: {post.instructions}</Text> : null}
      </View>
      {form === 'post-edit' ? <PostForm value={postDraft} onChange={setPostDraft} onSave={() => { void savePost(); }} onCancel={() => setForm(null)} pending={pending} saveLabel="Save post" /> : <Button title="Edit post" secondary onPress={() => startForm('post-edit')} />}
      <Button title={moving ? "Cancel moving post" : "Move post to another location"} secondary disabled={pending} onPress={() => setMoving(!moving)} />
      {moving ? <>
        <Notice message="Moving a post retains its staffing and hours, and clears its map and check-in markings. Place it again on the map if needed." />
        {locations.filter(item => item.id !== post.location_id).map(item => <Button key={item.id} title={`Move to ${item.name}`} secondary disabled={pending} onPress={() => { void run(async () => { await moveSetupPost(id, post, item.id); setMoving(false); await openLocation(item); }); }} />)}
      </> : null}
      {removeId === post.id ? <>
        <Notice message="Remove this post, its qualification requirements and operating hours? The change history remains available." />
        <Button title="Confirm remove post" disabled={pending} onPress={() => { void run(async () => { await removeSetupItem(id, 'post', post.id); setPosts(items => items.filter(item => item.id !== post.id)); setPost(null); setRemoveId(null); }); }} />
        <Button title="Cancel" secondary onPress={() => setRemoveId(null)} />
      </> : <Button title="Remove post" secondary disabled={pending} onPress={() => setRemoveId(post.id)} />}
      <Text style={styles.help}>Supervisor: {post.supervisor ?? 'Missing'} · Escalation: {post.escalation ?? 'Missing'}</Text>
      <Button title="Edit operating hours & procedures" secondary onPress={() => router.push({ pathname: '/events/[id]/operations', params: { id } })} />
      <Text style={styles.section}>Qualification requirements</Text>
      <Text style={styles.help}>General staffing is covered by the post minimum. Add required certifications or experience below.</Text>
      {requirements.map(item => <View key={item.id} style={styles.card}>
        <Text style={styles.cardTitle}>{item.minimum_count} required</Text>
        {item.certification_type ? <Text style={styles.help}>Certification: {item.certification_type}</Text> : null}
        {item.experience_requirement ? <Text style={styles.help}>Experience: {item.experience_requirement}</Text> : null}
        <Button title="Edit requirement" secondary onPress={() => {
          setEditingRequirementId(item.id);
          setRequirementDraft({ certificationType: item.certification_type ?? '', experienceRequirement: item.experience_requirement ?? '', minimumCount: item.minimum_count.toString() });
          setForm('requirement-edit');
        }} />
        {removeId === item.id ? <><Text style={styles.help}>Remove this requirement?</Text><Button title="Confirm remove" onPress={() => { void deleteRequirement(item.id); }} disabled={pending} /><Button title="Cancel" secondary onPress={() => setRemoveId(null)} /></> : <Button title="Remove requirement" secondary onPress={() => setRemoveId(item.id)} />}
      </View>)}
      {(form === 'requirement-new' || form === 'requirement-edit') ? <RequirementForm value={requirementDraft} onChange={setRequirementDraft} onSave={() => { void saveRequirement(); }} onCancel={() => setForm(null)} pending={pending} saveLabel={form === 'requirement-new' ? 'Add requirement' : 'Save requirement'} /> : <Button title="Add requirement" onPress={() => startForm('requirement-new')} />}
    </> : null}

    <Button title={post ? 'Back to location' : location ? 'Back to locations' : 'Back to setup'} secondary disabled={pending || siteMap.uploading} onPress={back} />
  </Page>;
}

const styles = StyleSheet.create({
  section: { color: '#123B53', fontSize: 20, fontWeight: '800', marginTop: 8 },
  help: { color: '#45616E', fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: '#D6E3E6' },
  cardTitle: { color: '#123B53', fontSize: 17, fontWeight: '800' },
  badge: { color: '#126B79', fontSize: 12, fontWeight: '800' },
});

export default function GuardedRoute() { const { id } = useLocalSearchParams<{ id: string }>(); return <EventManagerGate id={id}><SiteScreen /></EventManagerGate>; }
