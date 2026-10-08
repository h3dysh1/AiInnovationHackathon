import { AppText as Text } from '@/components/app-text';
import { loadDraft, saveDraft } from '@/services/draft-storage';
import { certificateValidity } from '@/domain/certification';
import { errorMessage } from '@/domain/errors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { EventFields } from '@/components/event-fields';
import { Button, Disclosure, Loading, NavigationRow, Notice, Page, Section, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { draftFromEvent, type Event, type EventDraft } from '@/domain/event';
import type { Membership } from '@/domain/planning';
import { useAuth } from '@/hooks/auth';
import { getEvent, updateEvent } from '@/services/events';
import { getMembership, managerRole } from '@/services/planning';
import { certificates, myDispatchRequests, myLiveAssignments, onboardingContext, setCheckIn, updateDispatch, setStandby } from '@/services/staffing';
import type { LiveAssignment } from '@/domain/live';
export default function EventDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [clock, setClock] = useState(Date.now);
  const [event, setEvent] = useState<Event | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const draftKey = `ground-control:event-details:${session?.user.id}:${id}`;
  function toggleEditing(value: boolean) { editingRef.current = value; setEditing(value); }
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certificateRequest, setCertificateRequest] = useState<string | null>(null);
  const [showAllAssignments, setShowAllAssignments] = useState(false);
  const [liveAssignments, setLiveAssignments] = useState<LiveAssignment[]>([]);
  const [dispatches, setDispatches] = useState<{ id: string; instruction: string; status: string }[]>([]);
  useEffect(() => {
    let active = true;
    void loadDraft(draftKey).then(saved => {
      if (!active) return;
      if (saved) {
        const value = JSON.parse(saved) as Record<string, unknown>;
        const keys: (keyof EventDraft)[] = ['name', 'description', 'venueName', 'address', 'startDate', 'endDate', 'operatingStartTime', 'operatingEndTime', 'timezone', 'expectedAttendance'];
        if (value && keys.every(key => typeof value[key] === 'string')) {
          setDraft(value as unknown as EventDraft); toggleEditing(true);
        }
      }
    }).catch(() => { if (active) setError('Local draft storage is unavailable. Keep this screen open until your changes are saved.'); }).finally(() => { if (active) setDraftLoaded(true); });
    return () => { active = false; };
  }, [draftKey]);
  useEffect(() => {
    if (!draftLoaded) return;
    void saveDraft(draftKey, editing && draft ? JSON.stringify(draft) : null).catch(() => setError('Your edits are still on this screen but could not be saved locally.'));
  }, [draftKey, draftLoaded, editing, draft]);
  const refresh = useCallback(async (active: () => boolean = () => true) => {
    if (!session) return;
    try {
      const [e, m] = await Promise.all([getEvent(id), getMembership(id, session.user.id)]);
      if (active()) {
        setEvent(e);
        setClock(Date.now());
        setMembership(m);
        if (!editingRef.current) setDraft(draftFromEvent(e));
        setError(null);
      }
      if (m?.event_role === 'volunteer') {
        const [context, owned, assignments, pendingDispatches] = await Promise.all([
          onboardingContext(id),
          certificates(session.user.id),
          myLiveAssignments(id),
          myDispatchRequests(id),
        ]);
        const missing = context.requirements.find((requirement) =>
          !owned.some(c=>certificateValidity(c,e.start_date,e.end_date,requirement.certification_type)===null)
        );
        if (active()) {
          setCertificateRequest(missing
            ? `This event needs ${missing.certification_type} for ${missing.post_name}. Add it to your certificates so the coordinator can consider you.`
            : null);
          setLiveAssignments(assignments);
          setDispatches(pendingDispatches);
        }
      }
    } catch (e) {
      if (active()) setError(errorMessage(e, 'Could not load event.'));
    } finally {
      if (active()) setLoading(false);
    }
  }, [id, session]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void refresh(() => active);
    const timer=setInterval(()=>{void refresh(()=>active);},10000);
    return () => {
      active = false; clearInterval(timer);
    };
  }, [refresh]));

  async function save() {
    if (!draft) return;
    setPending(true);
    setError(null);
    try {
      setEvent(await updateEvent(id, draft));
      toggleEditing(false);
    } catch (e) {
      setError(errorMessage(e, 'Could not save. Your changes are still here.'));
    } finally {
      setPending(false);
    }
  }
  if (loading) return <Loading label='Loading event…' />;
  if (!event || !membership) {
    return (
      <Page>
        <Title>Event unavailable</Title>
        <Notice message={error ?? 'You need an active membership to view this event.'} />
        <Button
          title='Retry'
          onPress={() => {
            void refresh();
          }}
        />
        <Button title='Back' secondary onPress={() => router.back()} />
      </Page>
    );
  }
  const manager = managerRole(membership);
  const orderedAssignments = [...liveAssignments].sort((a,b) => Number(b.status === 'checked_in') - Number(a.status === 'checked_in') || Number(Date.parse(a.ends_at) <= clock) - Number(Date.parse(b.ends_at) <= clock) || Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const nextAction = event.status === 'live' || event.status === 'completed'
    ? { label: event.status === 'live' ? 'Open live operations' : 'Review event history', route: '/events/[id]/live' }
    : event.model_status !== 'verified'
    ? { label: event.model_status === 'needs_review' ? 'Review items needing attention' : 'Continue event setup', route: event.model_status === 'needs_review' ? '/events/[id]/review' : '/events/[id]/setup' }
    : event.status === 'draft'
    ? { label: 'Open volunteer recruitment', route: '/events/[id]/publish' }
    : event.status === 'recruiting'
    ? { label: 'Build the roster', route: '/events/[id]/roster' }
    : { label: 'View roster and shifts', route: '/events/[id]/roster' };
  const stage = event.status === 'live' ? 'Live operations' : event.status === 'completed' ? 'Event completed' : event.model_status !== 'verified'
    ? 'Setup in progress'
    : event.status === 'draft'
    ? 'Ready to publish recruitment'
    : event.status === 'recruiting'
    ? 'Recruiting volunteers'
    : event.status === 'rostering'
    ? 'Roster in progress'
    : 'Event plan ready';
  return (
    <View style={{ flex: 1 }}>
    <Page>
      <Title subtitle={`Your event role: ${membership.event_role.replaceAll('_', ' ')}`}>
        {event.name}
      </Title>
      {error ? <Notice tone="error" message={error} /> : null}
      {editing && draft && manager
        ? (
          <>
            <Notice message='Your edit draft stays on this device until you save or cancel. Live refresh will not replace it.' />
            <EventFields value={draft} onChange={setDraft} section='basics' />
            <EventFields value={draft} onChange={setDraft} section='schedule' />
            <Notice message='Changing event details requires the operating plan to be verified again.' />
            <Button
              title={pending ? 'Saving…' : 'Save event details'}
              disabled={pending}
              onPress={() => {
                void save();
              }}
            />
            <Button
              title='Cancel'
              secondary
              disabled={pending}
              onPress={() => {
                toggleEditing(false);
                setDraft(draftFromEvent(event));
              }}
            />
          </>
        )
        : (
          <>
            {manager
              ? (
                <>
                  <PlanCard>
                    <Text style={planStyles.badge}>{stage}</Text>
                    <Text style={planStyles.text}>
                      Setup · {event.model_status === 'verified' ? 'Complete' : 'Needs attention'}
                      {'\n'}Recruitment · {event.status === 'draft' ? 'Not published' : ['live', 'completed'].includes(event.status) ? 'Event underway or completed' : 'Open'}
                      {'\n'}Roster · {['rostering', 'published', 'live', 'completed'].includes(event.status) ? 'Started' : 'Not started'}
                    </Text>
                    <Button
                      title={nextAction.label}
                      onPress={() => router.push({ pathname: nextAction.route as '/events/[id]/setup', params: { id } })}
                    />
                  </PlanCard>
                  <Section title='Manage this event' description='Choose a workspace. Each keeps its own focused tools.'>
                    <NavigationRow title='Alerts · incidents and response decisions' onPress={() => router.push({ pathname: '/events/[id]/live', params: { id } })} />
                    <NavigationRow title='Crew · roster and qualifications' onPress={() => router.push({ pathname: '/events/[id]/roster', params: { id } })} />
                    <NavigationRow title='Event tools · setup, site and recruitment' onPress={() => router.push({ pathname: '/events/[id]/more', params: { id } })} />
                  </Section>
                  <Disclosure title='Event settings'>
                    <Button title='Team and roles' secondary compact onPress={() => router.push({ pathname: '/events/[id]/team', params: { id } })} />
                  {['draft', 'recruiting'].includes(event.status)
                    ? (
                      <Button
                        title='Edit event details'
                        secondary
                        compact
                        onPress={() => { setDraft(draftFromEvent(event)); toggleEditing(true); }}
                      />
                    )
                    : null}
                  </Disclosure>
                </>
              )
              : (
                liveAssignments.length ? null : <Notice message='You have joined this event. Assignments will appear here when your coordinator publishes the roster.' />
              )}
            {!manager
              ? (
                <>
                  {certificateRequest ? <Notice message={certificateRequest} /> : null}
                  {dispatches.map((dispatch) => (
                    <PlanCard key={dispatch.id}>
                      <Text style={planStyles.badge}>REASSIGNMENT · {dispatch.status.toUpperCase()}</Text>
                      <Text style={planStyles.text}>{dispatch.instruction}</Text>
                      {(dispatch.status==='pending'?['accepted','declined']:dispatch.status==='accepted'?['en_route','declined']:dispatch.status==='en_route'?['arrived']:dispatch.status==='arrived'?['completed']:[]).map(status=><Button key={status} title={status==='accepted'?'Accept instruction':status==='declined'?'Decline (notify coordinator)':status==='en_route'?'On my way':status==='arrived'?'Arrived and checked in':'Task completed'} disabled={pending} onPress={()=>{setPending(true);void updateDispatch(dispatch.id,status).then(()=>refresh()).catch(cause=>setError(errorMessage(cause,'Could not update response. Try again.'))).finally(()=>setPending(false));}}/>)}
                    </PlanCard>
                  ))}
                  <Button title='Report an incident' onPress={() => router.push({ pathname: '/events/[id]/incident', params: { id } })} />
                  <Section title='My assignments'>
                    {(showAllAssignments ? orderedAssignments : orderedAssignments.slice(0, 2)).map((assignment) => (
                      <PlanCard key={assignment.assignment_id}>
                        <Text style={planStyles.heading}>{assignment.post}</Text>
                        <Text style={planStyles.text}>
                          {assignment.location}{'\n'}
                          {new Date(assignment.starts_at).toLocaleString('en-AU', { timeZone: event.timezone })} – {new Date(assignment.ends_at).toLocaleTimeString('en-AU', { timeZone: event.timezone, hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        <Text style={planStyles.badge}>SHIFT · {assignment.status.replaceAll('_', ' ').toUpperCase()}</Text>
                        {assignment.instructions ? <Text style={planStyles.help}>{assignment.instructions}</Text> : null}
                        {!assignment.response_plan_id && ['scheduled','late','missing'].includes(assignment.status)
                          ? (
                            <Button title='Check in' disabled={pending} onPress={() => {
                              setPending(true);void setCheckIn(assignment.assignment_id, 'check_in').then(() => refresh()).catch(cause=>setError(errorMessage(cause,'Check-in failed. Try again.'))).finally(()=>setPending(false));
                            }} />
                          )
                          : assignment.status === 'checked_in'
                          ? (
                            <Button title='Check out' secondary disabled={pending} onPress={() => {
                              setPending(true);void setCheckIn(assignment.assignment_id, 'check_out').then(() => refresh()).catch(cause=>setError(errorMessage(cause,'Check-out failed. Try again.'))).finally(()=>setPending(false));
                            }} />
                          )
                          : null}
                      </PlanCard>
                    ))}
                    {orderedAssignments.length > 2 ? <Button title={showAllAssignments ? 'Show current and next assignments' : `Show all ${orderedAssignments.length} assignments`} secondary onPress={() => setShowAllAssignments(!showAllAssignments)} /> : null}
                    {event.status==='live'?<Button title='Confirm standby availability for the next 2 hours' secondary disabled={pending} onPress={()=>{setPending(true);void setStandby(id,new Date(Date.now()+2*3600000).toISOString()).then(()=>refresh()).catch(cause=>setError(errorMessage(cause,'Could not confirm standby.'))).finally(()=>setPending(false));}}/>:null}

                  </Section>
                  <Disclosure title='Event preparation'>
                    <Button title='Availability & preferences' secondary onPress={() => router.push({ pathname: '/events/[id]/availability', params: { id } })} />
                    <Button title='Prepare for this event' secondary onPress={() => router.push({ pathname: '/events/[id]/onboarding', params: { id } })} />
                  </Disclosure>
                  <Button title='View full shift schedule' secondary onPress={() => router.push({ pathname: '/events/[id]/schedule', params: { id } })} />
                </>
              )
              : null}
            <Disclosure title="Venue and event details">
              <Text style={planStyles.badge}>{event.status.toUpperCase()}</Text>
              <Text style={planStyles.heading}>{event.venue_name}</Text>
              {event.address ? <Text style={planStyles.text}>{event.address}</Text> : null}
              <Text style={planStyles.text}>
                {event.start_date}–{event.end_date}
                {'\n'}
                {event.operating_start_time.slice(0, 5)}–{event.operating_end_time.slice(0, 5)} ·
                {' '}
                {event.timezone}
              </Text>
              {event.description ? <Text style={planStyles.text}>{event.description}</Text> : null}
            </Disclosure>
          </>
        )}
    </Page>
    </View>
  );
}
