import { AppText as Text } from '@/components/app-text';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { EventManagerGate } from '@/components/event-manager-gate';
import { Button, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles, SourceLabel } from '@/components/plan-ui';
import { ProposalEditor } from '@/components/proposal-editor';
import { type OperatingPlan, proposalGaps } from '@/domain/operating-plan';
import type { AiJob, EntityKind } from '@/domain/planning';
import { useAuth } from '@/hooks/auth';
import { usePlanning } from '@/hooks/planning';
import {
  applyProposal,
  confirmEntity,
  dismissProposal,
  planningClient,
  type PlanningSnapshot,
  resolveIssue,
  validateProposal,
  verifyModel,
} from '@/services/planning';
export default function ReviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EventManagerGate id={id}>
      <Review id={id} />
    </EventManagerGate>
  );
}
type History = {
  id: number;
  entity_kind: string;
  changed_at: string;
  previous_data: Record<string, unknown> | null;
  next_data: Record<string, unknown> | null;
};
function Review({ id }: { id: string }) {
  const s = usePlanning(id);
  const { session } = useAuth();
  const [resolution, setResolution] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);
  const [history, setHistory] = useState<History[] | null>(null);
  const job = s.data?.jobs.slice(0, 1).find((j) =>
    j.status === 'succeeded' && !j.applied_revision && !j.dismissed_at && j.output
  );
  const data = s.data;
  if (s.loading) return <Loading />;
  if (!data) {
    return (
      <Page>
        <Title>Review unavailable</Title>
        <Notice message={s.error ?? 'Could not load plan.'} />
        <Button
          title='Refresh'
          onPress={() => {
            void s.refresh();
          }}
        />
        <Button title='Back' secondary onPress={() => router.back()} />
      </Page>
    );
  }
  const readiness = data.readiness;
  const review = (kind: EntityKind, entityId: string) => {
    const r = data.reviews.find((r) => r.entity_kind === kind && r.entity_id === entityId);
    return (
      <>
        {r ? <SourceLabel source={r} snapshot={data} /> : null}
        <Text style={planStyles.badge}>
          {r?.status === 'confirmed' ? '✓ CONFIRMED' : '○ NEEDS REVIEW'}
        </Text>
        {r?.status !== 'confirmed'
          ? (
            <Button
              title='Confirm this record'
              disabled={s.pending}
              secondary
              compact
              onPress={() => {
                void s.run(() => confirmEntity(id, kind, entityId, readiness.revision));
              }}
            />
          )
          : null}
      </>
    );
  };

  return (
    <Page>
      <Title subtitle={data.event.name}>Review operating plan</Title>
      {s.error ? <Notice tone="error" message={s.error} /> : null}
      <PlanCard>
        <Text style={planStyles.badge}>
          {readiness.modelStatus.replaceAll('_', ' ').toUpperCase()}
        </Text>
        <Text style={planStyles.heading}>
          {readiness.confirmed} / {readiness.total} operational records confirmed
        </Text>
        <Text style={planStyles.text}>
          {data.locations.length} locations · {data.posts.length} posts · {data.procedures.length}
          {' '}
          procedures
        </Text>
        <Text style={planStyles.help}>
          Confirm staffing, qualification coverage, hours and escalation against the sources.
          Extraction confidence describes the AI’s reading, and is not a safety approval.
        </Text>
      </PlanCard>
      {job
        ? (
          <CandidateReview
            key={job.id}
            id={id}
            job={job}
            data={data}
            userId={session!.user.id}
            pending={s.pending}
            run={s.run}
          />
        )
        : null}
      {readiness.issues.length > 0
        ? (
          <PlanCard>
            <Text style={planStyles.heading}>Needs attention · {readiness.issues.length}</Text>
            <Text style={planStyles.help}>Resolve these items before the operating plan can be verified.</Text>
            {readiness.issues.slice(0, 4).map((issue, index) => (
              <Text key={`${issue.code}-${index}`} style={planStyles.text}>• {issue.message}</Text>
            ))}
            {readiness.issues.length > 4
              ? <Text style={planStyles.help}>Open the detailed issue list below to see the remaining items.</Text>
              : null}
          </PlanCard>
        )
        : null}
      <Text style={planStyles.heading}>Full operating plan</Text>
      {data.locations.map((l) => (
        <PlanCard key={l.id}>
          <Text style={planStyles.heading}>{l.name}</Text>
          {l.description ? <Text style={planStyles.text}>{l.description}</Text> : null}
          {data.reviews.find((r) => r.entity_kind === 'location' && r.entity_id === l.id)
            ? (
              <SourceLabel
                source={data.reviews.find((r) =>
                  r.entity_kind === 'location' && r.entity_id === l.id
                )!}
                snapshot={data}
              />
            )
            : null}
          {data.posts.filter((p) => p.location_id === l.id).map((p) => (
            <PlanCard key={p.id}>
              <Text style={planStyles.heading}>{p.name}</Text>
              <Text style={planStyles.badge}>
                {p.criticality.toUpperCase()} · {p.minimum_coverage} total volunteers
              </Text>
              <Text style={planStyles.text}>
                Supervisor: {p.supervisor ?? 'Missing'}
                {'\n'}Escalation: {p.escalation ?? 'Missing'}
              </Text>
              {p.instructions ? <Text style={planStyles.text}>{p.instructions}</Text> : null}
              <Text style={planStyles.help}>
                Qualified counts are included in the total; the same volunteer may meet multiple
                requirements.
              </Text>
              {data.requirements.filter((r) => r.post_id === p.id).map((r) => (
                <PlanCard key={r.id}>
                  <Text style={planStyles.text}>
                    {r.minimum_count} ×{' '}
                    {[r.certification_type, r.experience_requirement].filter(Boolean).join(' / ')}
                  </Text>
                  {review('requirement', r.id)}
                </PlanCard>
              ))}
              {!data.requirements.some((r) => r.post_id === p.id)
                ? (
                  <Text style={planStyles.help}>
                    No specific qualification requirements recorded. Confirm that this is
                    appropriate for this task.
                  </Text>
                )
                : null}
              {data.windows.filter((w) => w.post_id === p.id).map((w) => (
                <PlanCard key={w.id}>
                  <Text style={planStyles.text}>
                    {w.start_date}–{w.end_date} ·{' '}
                    {w.start_time.slice(0, 5)}–{w.end_time.slice(0, 5)}{' '}
                    ({data.event.timezone}){'\n'}
                    {w.minimum_coverage ?? p.minimum_coverage} minimum volunteers
                  </Text>
                  {review('window', w.id)}
                </PlanCard>
              ))}
              {review('post', p.id)}
            </PlanCard>
          ))}
        </PlanCard>
      ))}
      {data.procedures.map((p) => (
        <PlanCard key={p.id}>
          <Text style={planStyles.heading}>{p.title}</Text>
          <Text style={planStyles.text}>{p.content}</Text>
          {review('procedure', p.id)}
        </PlanCard>
      ))}
      <Button
        title='Edit locations, posts & qualifications'
        secondary
        disabled={s.pending}
        onPress={() => router.push({ pathname: '/events/[id]/site', params: { id } })}
      />
      <Button
        title='Edit operating hours & procedures'
        secondary
        disabled={s.pending}
        onPress={() => router.push({ pathname: '/events/[id]/operations', params: { id } })}
      />
      <Text style={planStyles.heading}>Resolve issues</Text>
      {readiness.issues.map((i, n) => <Notice key={`${i.code}-${n}`} message={i.message} />)}
      {data.issues.filter((i) => i.status === 'open').map((i) => (
        <PlanCard key={i.id}>
          <Text style={planStyles.badge}>{i.severity.toUpperCase()}</Text>
          <Text style={planStyles.text}>{i.question}</Text>
          <Text style={planStyles.help}>{i.evidence}</Text>
          {resolving === i.id
            ? (
              <>
                <Field
                  label='Decision and correction made'
                  value={resolution}
                  onChangeText={setResolution}
                  multiline
                />
                <Button
                  title='Record human resolution'
                  disabled={s.pending || !resolution.trim()}
                  onPress={() => {
                    void s.run(() => resolveIssue(i.id, resolution)).then((ok) => {
                      if (ok) {
                        setResolving(null);
                        setResolution('');
                      }
                    });
                  }}
                />
              </>
            )
            : (
              <Button
                title='Record a decision after correcting the plan'
                secondary
                compact
                disabled={s.pending}
                onPress={() => {
                  setResolving(i.id);
                  setResolution('');
                }}
              />
            )}
        </PlanCard>
      ))}
      <Button
        title={readiness.modelStatus === 'verified'
          ? 'Operating plan verified'
          : 'Verify current operating plan'}
        disabled={s.pending || readiness.issues.length > 0 || readiness.modelStatus === 'verified'}
        onPress={() => {
          void s.run(() => verifyModel(id, readiness.revision));
        }}
      />
      <Button
        title='Publish volunteer recruitment'
        disabled={s.pending || readiness.modelStatus !== 'verified'}
        onPress={() => router.push({ pathname: '/events/[id]/publish', params: { id } })}
      />
      <Button
        title='View change history'
        secondary
        compact
        disabled={s.pending}
        onPress={() => {
          void s.run(async () => {
            const { data, error } = await planningClient().from('setup_change_history').select(
              'id,entity_kind,changed_at,previous_data,next_data',
            ).eq('event_id', id).order('id', { ascending: false }).limit(40);
            if (error) throw error;
            setHistory(data as History[]);
          });
        }}
      />
      {history
        ? (
          <PlanCard>
            <Text style={planStyles.heading}>Recent changes</Text>
            {history.map((h) => (
              <Text key={h.id} style={planStyles.help}>
                {new Date(h.changed_at).toLocaleString()} · {h.entity_kind.replaceAll('_', ' ')} ·
                {' '}
                {h.entity_kind === 'source_before_edit'
                  ? 'Previous source retained'
                  : h.previous_data
                  ? 'Updated'
                  : h.next_data
                  ? 'Recorded'
                  : 'Removed'}
                {h.entity_kind === 'source_before_edit'
                  ? `: ${String(h.previous_data?.source_type ?? 'manual')} · ${
                    String(h.previous_data?.source_reference ?? '')
                  }`
                  : ''}
                {h.previous_data && h.next_data
                  ? `: ${
                    Object.keys(h.next_data).filter((k) =>
                      JSON.stringify(h.previous_data?.[k]) !== JSON.stringify(h.next_data?.[k])
                    ).map((k) => k.replaceAll('_', ' ')).join(', ')
                  }`
                  : ''}
              </Text>
            ))}
          </PlanCard>
        )
        : null}
      <Button
        title='Refresh plan'
        secondary
        compact
        disabled={s.pending}
        onPress={() => {
          void s.refresh();
        }}
      />
      <Button title='Back to setup' secondary disabled={s.pending} onPress={() => router.back()} />
    </Page>
  );
}

function CandidateReview(
  { id, job, data, userId, pending, run }: {
    id: string;
    job: AiJob;
    data: PlanningSnapshot;
    userId: string;
    pending: boolean;
    run: (action: () => Promise<unknown>) => Promise<boolean>;
  },
) {
  const draftKey = `gc:proposal:${userId}:${id}:${job.id}`;
  const [restored] = useState(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      return { plan: raw ? validateProposal(JSON.parse(raw), data) : job.output, error: null };
    } catch {
      return {
        plan: job.output,
        error: 'Could not restore edited candidate. The original AI candidate is available.',
      };
    }
  });
  const [plan, setPlan] = useState<OperatingPlan | null>(restored.plan);
  const [draftError, setDraftError] = useState<string | null>(restored.error);
  const [dismissal, setDismissal] = useState('');
  const stale = job.input_revision !== data.readiness.revision;
  function change(p: OperatingPlan) {
    setPlan(p);
    try {
      localStorage.setItem(draftKey, JSON.stringify(p));
      setDraftError(null);
    } catch {
      setDraftError(
        'Candidate edits could not be saved on this device. Keep this screen open until you apply them.',
      );
    }
  }
  return plan
    ? (
      <>
        {draftError ? <Notice message={draftError} /> : null}
        <Text style={planStyles.heading}>AI candidate — not applied</Text>
        {stale
          ? (
            <Notice message='Setup changed after this candidate was generated. Generate a fresh candidate before applying.' />
          )
          : null}
        <ProposalEditor value={plan} onChange={change} snapshot={data} disabled={pending} />
        {proposalGaps(plan).map((gap, i) => <Notice key={i} message={gap} />)}
        {plan.issues.map((i) => (
          <PlanCard key={i.key}>
            <Text style={planStyles.badge}>{i.severity.toUpperCase()}</Text>
            <Text style={planStyles.text}>{i.question}</Text>
            <Text style={planStyles.help}>{i.evidence}</Text>
          </PlanCard>
        ))}
        <Notice message='Applying merges this candidate into the existing plan by location/post name. Review changed staffing before proceeding. Existing records omitted from the candidate are retained. Operational records will still need confirmation.' />
        <Button
          title={pending ? 'Applying…' : 'Apply candidate as unconfirmed draft'}
          disabled={pending || Boolean(stale) || proposalGaps(plan).some((g) =>
            g.includes('minimum staffing') || g.includes('qualification counts') ||
            g.includes('operating hours/dates')
          )}
          onPress={() => {
            void run(() => applyProposal(job, plan, data)).then((ok) => {
              if (ok) {
                try {
                  if (draftKey) localStorage.removeItem(draftKey);
                } catch {
                  setDraftError('Applied, but the local candidate draft could not be cleared.');
                }
                setPlan(null);
              }
            });
          }}
        />
        <Field
          label='Reason to dismiss this candidate (optional alternative to applying)'
          value={dismissal}
          onChangeText={setDismissal}
          multiline
        />
        <Button
          title='Dismiss candidate & keep current plan'
          secondary
          compact
          disabled={pending || !dismissal.trim()}
          onPress={() => {
            void run(() => dismissProposal(job.id, dismissal, data.readiness.revision));
          }}
        />
        <Button
          title='Clarify with the assistant'
          secondary
          disabled={pending}
          onPress={() => router.push({ pathname: '/events/[id]/assistant', params: { id } })}
        />
      </>
    )
    : null;
}
