import { errorMessage } from '@/domain/errors';
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { EventFields } from '@/components/event-fields';
import { Button, Loading, Notice, Page, Section, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { draftFromEvent, type Event, type EventDraft } from '@/domain/event';
import type { Membership } from '@/domain/planning';
import { useAuth } from '@/hooks/auth';
import { getEvent, updateEvent } from '@/services/events';
import { getMembership, managerRole } from '@/services/planning';
import { certificates, myDispatchRequests, myLiveAssignments, onboardingContext, setCheckIn, updateDispatch } from '@/services/staffing';
import type { LiveAssignment } from '@/domain/live';
export default function EventDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certificateRequest, setCertificateRequest] = useState<string | null>(null);
  const [liveAssignments, setLiveAssignments] = useState<LiveAssignment[]>([]);
  const [dispatches, setDispatches] = useState<{ id: string; instruction: string; status: string }[]>([]);
  const refresh = useCallback(async (active: () => boolean = () => true) => {
    if (!session) return;
    try {
      const [e, m] = await Promise.all([getEvent(id), getMembership(id, session.user.id)]);
      if (active()) {
        setEvent(e);
        setMembership(m);
        setDraft(draftFromEvent(e));
        setError(null);
      }
      if (m?.event_role === 'volunteer') {
        const [context, owned, assignments, pendingDispatches] = await Promise.all([
          onboardingContext(id),
          certificates(session.user.id),
          myLiveAssignments(id),
          myDispatchRequests(id),
        ]);
        const ownedTypes = new Set(owned.map((certificate) => certificate.type?.toLowerCase()));
        const missing = context.requirements.find((requirement) =>
          !ownedTypes.has(requirement.certification_type.toLowerCase())
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
    return () => {
      active = false;
    };
  }, [refresh]));

  async function save() {
    if (!draft) return;
    setPending(true);
    setError(null);
    try {
      setEvent(await updateEvent(id, draft));
      setEditing(false);
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
  const nextAction = event.model_status !== 'verified'
    ? { label: event.model_status === 'needs_review' ? 'Review items needing attention' : 'Continue event setup', route: event.model_status === 'needs_review' ? '/events/[id]/review' : '/events/[id]/setup' }
    : event.status === 'draft'
    ? { label: 'Open volunteer recruitment', route: '/events/[id]/publish' }
    : event.status === 'recruiting'
    ? { label: 'Build the roster', route: '/events/[id]/roster' }
    : { label: 'View roster and shifts', route: '/events/[id]/roster' };
  const stage = event.model_status !== 'verified'
    ? 'Setup in progress'
    : event.status === 'draft'
    ? 'Ready to publish recruitment'
    : event.status === 'recruiting'
    ? 'Recruiting volunteers'
    : event.status === 'rostering'
    ? 'Roster in progress'
    : 'Event plan ready';
  return (
    <Page>
      <Title subtitle={`Your event role: ${membership.event_role.replaceAll('_', ' ')}`}>
        {event.name}
      </Title>
      {error ? <Notice message={error} /> : null}
      {editing && draft && manager
        ? (
          <>
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
                setEditing(false);
                setDraft(draftFromEvent(event));
              }}
            />
          </>
        )
        : (
          <>
            <PlanCard>
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
            </PlanCard>
            {manager
              ? (
                <>
                  <PlanCard>
                    <Text style={planStyles.badge}>{stage}</Text>
                    <Text style={planStyles.text}>
                      Setup · {event.model_status === 'verified' ? 'Complete' : 'Needs attention'}
                      {'\n'}Recruitment · {event.status === 'draft' ? 'Not published' : 'Open'}
                      {'\n'}Roster · {['rostering', 'published', 'live', 'completed'].includes(event.status) ? 'Started' : 'Not started'}
                    </Text>
                    <Button
                      title={nextAction.label}
                      onPress={() => router.push({ pathname: nextAction.route as '/events/[id]/setup', params: { id } })}
                    />
                  </PlanCard>
                  <Section title='Event workspace'>
                    <Button title='Set up and review plan' secondary compact onPress={() => router.push({ pathname: '/events/[id]/setup', params: { id } })} />
                    <Button title='Crew and roster' secondary compact onPress={() => router.push({ pathname: '/events/[id]/roster', params: { id } })} />
                    <Button title='Recruitment and join code' secondary compact onPress={() => router.push({ pathname: '/events/[id]/publish', params: { id } })} />
                    <Button title='Live operations' secondary compact onPress={() => router.push({ pathname: '/events/[id]/live', params: { id } })} />
                  </Section>
                  <Section title='Event settings'>
                    <Button title='Team and roles' secondary compact onPress={() => router.push({ pathname: '/events/[id]/team', params: { id } })} />
                  {['draft', 'recruiting'].includes(event.status)
                    ? (
                      <Button
                        title='Edit event details'
                        secondary
                        compact
                        onPress={() => setEditing(true)}
                      />
                    )
                    : null}
                  </Section>
                </>
              )
              : (
                <Notice message='You have joined this event. Your coordinator will share your assignments once the roster is ready.' />
              )}
            {!manager
              ? (
                <>
                  {certificateRequest ? <Notice message={certificateRequest} /> : null}
                  {dispatches.map((dispatch) => (
                    <PlanCard key={dispatch.id}>
                      <Text style={planStyles.badge}>REASSIGNMENT · {dispatch.status.toUpperCase()}</Text>
                      <Text style={planStyles.text}>{dispatch.instruction}</Text>
                      {dispatch.status === 'pending'
                        ? <Button title='Acknowledge instruction' onPress={() => {
                          void updateDispatch(dispatch.id, 'accepted').then(() => refresh());
                        }} />
                        : null}
                    </PlanCard>
                  ))}
                  <Section title='My participation'>
                    {liveAssignments.map((assignment) => (
                      <PlanCard key={assignment.assignment_id}>
                        <Text style={planStyles.heading}>{assignment.post}</Text>
                        <Text style={planStyles.text}>
                          {assignment.location}{'\n'}
                          {new Date(assignment.starts_at).toLocaleString('en-AU', { timeZone: event.timezone })} – {new Date(assignment.ends_at).toLocaleTimeString('en-AU', { timeZone: event.timezone, hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        <Text style={planStyles.badge}>SHIFT · {assignment.status.replaceAll('_', ' ').toUpperCase()}</Text>
                        {assignment.instructions ? <Text style={planStyles.help}>{assignment.instructions}</Text> : null}
                        {assignment.status === 'scheduled' || assignment.status === 'late'
                          ? (
                            <Button title='Check in' onPress={() => {
                              void setCheckIn(assignment.assignment_id, 'check_in').then(() => refresh());
                            }} />
                          )
                          : assignment.status === 'checked_in'
                          ? (
                            <Button title='Check out' secondary onPress={() => {
                              void setCheckIn(assignment.assignment_id, 'check_out').then(() => refresh());
                            }} />
                          )
                          : null}
                      </PlanCard>
                    ))}
                    <Button title='Report an incident' onPress={() => router.push({ pathname: '/events/[id]/incident', params: { id } })} />
                    <Button title='Availability & preferences' onPress={() => router.push({ pathname: '/events/[id]/availability', params: { id } })} />
                    <Button title='My shifts' secondary onPress={() => router.push({ pathname: '/events/[id]/schedule', params: { id } })} />
                    {certificateRequest
                      ? <Button title='Add missing certificate' secondary onPress={() => router.push('/certificates')} />
                      : null}
                  </Section>
                  <Button title='My events' secondary onPress={() => router.navigate('/volunteer')} />
                </>
              )
              : null}
          </>
        )}
    </Page>
  );
}
