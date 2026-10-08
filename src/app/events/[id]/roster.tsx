import { AppText as Text } from '@/components/app-text';
import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { randomUUID } from 'expo-crypto';
import { EventManagerGate } from '@/components/event-manager-gate';
import { Button, Disclosure, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { useStaffing } from '@/hooks/staffing';
import { assignmentProblem, qualified, rosterCoverage, shiftHours } from '@/domain/roster';
import { invokeStaffing, rosterContext, rosterReadiness, rosters } from '@/services/staffing';
import { getEvent } from '@/services/events';
import { setupRpc } from '@/services/planning';
import { RosterRules } from '@/components/roster-rules';
import type { RestRules } from '@/domain/roster-rest';
export default function RosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EventManagerGate id={id}>
      <RosterEditor id={id} />
    </EventManagerGate>
  );
}
function RosterEditor({ id }: { id: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [list, event, rules] = await Promise.all([rosters(id), getEvent(id), setupRpc<RestRules | null>('get_roster_rules', { p_event_id: id })]);
    const r = list.find((r) => r.id === selected) ?? list.find((r) => r.status === 'draft') ??
      list.find((r) => r.status === 'published');
    return {
      list,
      event,
      rules,
      ctx: r ? await rosterContext(r.id) : null,
      ready: r ? await rosterReadiness(r.id) : null,
    };
  }, [id, selected]);
  const s = useStaffing(load);
  const [length, setLength] = useState('4');
  const [message, setMessage] = useState('');
  const draftId = useRef(randomUUID());
  const generationId = useRef<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [edit, setEdit] = useState<
    { id: string; start: string; end: string; coverage: string } | null
  >(null);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const coverage = useMemo(() => s.data?.ctx ? rosterCoverage(s.data.ctx) : [], [s.data]);
  const [visible, setVisible] = useState(25);
  const [gapsOnly, setGapsOnly] = useState(false);
  if (s.loading) return <Loading label='Loading roster…' />;
  const data = s.data, ctx = data?.ctx;
  const draft = ctx?.roster.status === 'draft';
  const base = { p_roster_id: ctx?.roster.id, p_revision: ctx?.roster.revision };

  const chosen =
    ctx?.assignments.map((a) => ({ shiftId: a.shift_id, userId: a.user_id, locked: a.locked })) ??
      [];
  const change = (action: () => Promise<unknown>) =>
    s.run(async () => {
      await action();
      generationId.current = null;
      setPublishConfirm(false);
      setDiscardConfirm(false);
    });
  function localInput(iso: string) {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: ctx!.event.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const v = (k: string) => p.find((x) => x.type === k)?.value;
    return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
  }
  return (
    <Page>
      <Title subtitle='1. Generate shift times. 2. Automatically assign eligible crew. 3. Review and publish.'>
        Roster & shifts
      </Title>
      {s.error && <Notice tone="error" message={s.error} />}
      {message ? <Notice message={message} /> : null}
      {data ? <RosterRules eventId={id} rules={data.rules} disabled={s.pending || data.event.status === 'live' || data.event.status === 'completed'} save={change} /> : null}
      <Button
        title='Review crew qualifications'
        secondary
        compact
        onPress={() => router.push({ pathname: '/events/[id]/qualifications', params: { id } })}
      />
      {!data && (
        <Button
          title='Retry'
          onPress={() => {
            void s.refresh();
          }}
        />
      )}
      {data && !data.list.some((r) => r.status === 'draft') && (
        <Disclosure title={data.list.some(r => r.status === 'published') ? 'Create a replacement roster' : 'Generate shift times'} initiallyOpen={!data.list.some(r => r.status === 'published')}>
          <Field
            label='Shift length (hours, 1–12)'
            value={length}
            onChangeText={setLength}
            keyboardType='number-pad'
          />
          <Button
            title={data.list.some((r) => r.status === 'published') ? '1. Create replacement shift draft' : '1. Generate shift times'}
            disabled={s.pending || data.event.model_status !== 'verified'}
            onPress={() => {
              void change(async () => {
                const result = await setupRpc<string>('create_shift_draft', {
                  p_event_id: id,
                  p_roster_id: draftId.current,
                  p_shift_hours: Number(length),
                  p_expected_model_revision: data.event.setup_revision,
                });
                setSelected(result);
                draftId.current = randomUUID();
              });
            }}
          />
          {data.event.model_status !== 'verified' && (
            <Notice message='Verify the operating plan before generating shifts.' />
          )}
        </Disclosure>
      )}
      {data?.list.map((r) => (
        <Button
          key={r.id}
          title={`${r.status.toUpperCase()} · ${new Date(r.created_at).toLocaleDateString()}${
            ctx?.roster.id === r.id ? ' · selected' : ''
          }`}
          secondary
          onPress={() => {
            setSelected(r.id);
            setPublishConfirm(false);
            setDiscardConfirm(false);
          }}
        />
      ))}
      {ctx && (
        <>
          <PlanCard>
            <Text style={planStyles.heading}>
              {ctx.roster.status.toUpperCase()} · {ctx.shifts.length} shifts
            </Text>
            <Text>
              {ctx.assignments.length} assignments · {coverage.reduce((n, c) => n + c.missing, 0)}
              {' '}
              unfilled places
            </Text>
            {data?.ready?.issues.slice(0, 25).map((i, n) => (
              <Notice
                key={n}
                message={typeof i === 'string'
                  ? i
                  : `${
                    ctx.posts.find((p) =>
                      p.id === ctx.shifts.find((s) => s.id === i.shiftId)?.post_id
                    )?.name ?? 'Shift'
                  } · ${
                    ctx.shifts.find((s) => s.id === i.shiftId)?.starts_at
                      ? localInput(
                        ctx.shifts.find((s) => s.id === i.shiftId)!.starts_at,
                      ).replace('T', ' ')
                      : ''
                  }: ${i.message}`}
              />
            ))}
            {data?.ready?.warnings.map((w, n) => <Text key={n}>Review: {w}</Text>)}
            {draft && (
              <Button
                title={s.pending ? 'Assigning crew…' : '2. Automatically assign / improve crew'}
                disabled={s.pending}
                onPress={() => {
                  void s.run(async () => {
                    generationId.current ??= randomUUID();
                    const result = await invokeStaffing('roster-generate', {
                      rosterId: ctx.roster.id,
                      revision: ctx.roster.revision,
                      generationId: generationId.current,
                    });
                    generationId.current = null;
                    setMessage(
                      result.complete
                        ? 'A complete candidate is ready for your review.'
                        : `Partial candidate saved. Review coverage gaps and volunteer availability.${result.searchLimited ? ' The search limit was reached; this does not prove a complete roster is impossible.' : ''}`,
                    );
                  });
                }}
              />
            )}
          </PlanCard>
          {!draft ? <Notice message='This roster is published. Create a replacement shift draft above to try automatic assignment; the current roster stays published until you approve its replacement.' /> :
            <Notice message='Automatic assignment checks qualifications, availability, overlapping shifts and hour limits. Manual assignments are kept. You review coverage before publication.' />}
          <Button
            title={gapsOnly ? 'Show all shifts' : 'Show only coverage gaps'}
            secondary
            compact
            onPress={() => {
              setGapsOnly(!gapsOnly);
              setVisible(25);
            }}
          />
          <Disclosure title='Crew workload and hour limits'>
          {ctx.crew.map((m) => {
            const hours = ctx.assignments.filter((a) => a.user_id === m.user_id).reduce(
              (n, a) => n + shiftHours(ctx.shifts.find((x) => x.id === a.shift_id)!),
              0,
            );
            return (
              <Text key={m.user_id}>
                {m.display_name}: {hours.toFixed(1)}h assigned /{' '}
                {m.onboarding?.desired_hours ?? '?'}h desired (max{' '}
                {m.onboarding?.maximum_hours ?? '?'})
              </Text>
            );
          })}
          </Disclosure>
          {coverage.filter((c) =>
            !gapsOnly || c.missing || c.invalid.length ||
            c.qualifications.some((q) => q.actual < q.required)
          ).slice(0, visible).map((c) => {
            const shift = c.shift;
            const post = ctx.posts.find((p) => p.id === shift.post_id);
            return (
              <PlanCard key={shift.id}>
                <Text style={planStyles.heading}>{post?.location_name} · {post?.name}</Text>
                <Text>
                  {localInput(shift.starts_at).replace('T', ' ')} –{' '}
                  {localInput(shift.ends_at).slice(11)} · {ctx.event.timezone}
                </Text>
                <Text>{c.assigned} / {shift.minimum_coverage} staffed · {shift.criticality}</Text>
                {c.qualifications.map((q, i) => (
                  <Text key={i}>
                    {q.label}: {q.actual} / {q.required} qualified within total staffing
                  </Text>
                ))}
                {c.invalid.map((reason, i) => <Notice key={i} message={reason} />)}
                {ctx.assignments.filter((a) => a.shift_id === shift.id).map((a) => (
                  <PlanCard key={a.id}>
                    <Text>
                      {ctx.crew.find((m) =>
                        m.user_id === a.user_id
                      )?.display_name ??
                        'Inactive volunteer'}
                      {a.locked ? ' · Manual assignment kept on regeneration' : ''}
                    </Text>
                    {draft && (
                      <>
                        <Button
                          title='Replace volunteer'
                          secondary
                          compact
                          disabled={s.pending}
                          onPress={() => {
                            setExpanded(shift.id);
                            setReplacement(a.id);
                          }}
                        />
                        <Button
                          title='Remove assignment'
                          secondary
                          compact
                          disabled={s.pending}
                          onPress={() => {
                            void change(() =>
                              setupRpc('remove_roster_assignment', {
                                ...base,
                                p_assignment_id: a.id,
                              })
                            );
                          }}
                        />
                      </>
                    )}
                  </PlanCard>
                ))}
                {draft && (
                  <>
                    <Button
                      title={expanded === shift.id ? 'Hide volunteers' : 'Assign volunteer'}
                      secondary
                      compact
                      disabled={s.pending}
                      onPress={() => {
                        setExpanded(expanded === shift.id ? null : shift.id);
                        setReplacement(null);
                      }}
                    />
                    {expanded === shift.id && (
                      <>
                        {replacement && (
                          <Notice message='Select the replacement volunteer. The current assignment is kept if saving fails.' />
                        )}
                        {ctx.crew.map((m) => {
                          const reason = assignmentProblem(
                            ctx,
                            chosen.filter((a) =>
                              !replacement ||
                              !ctx.assignments.some((x) =>
                                x.id === replacement && x.shift_id === a.shiftId &&
                                x.user_id === a.userId
                              )
                            ),
                            shift,
                            m,
                          );
                          const full = c.assigned >= shift.minimum_coverage && !replacement;
                          return (
                            <Button
                              key={m.user_id}
                              title={`${m.display_name}${
                                shift.requirements.some((r) => qualified(m, r, ctx))
                                  ? ' · Qualified'
                                  : ''
                              }${reason ? ` · ${reason}` : full ? ' · Shift full' : ''}`}
                              secondary
                              disabled={s.pending || Boolean(reason) || full}
                              onPress={() => {
                                void change(async () => {
                                  await setupRpc('set_roster_assignment', {
                                    ...base,
                                    p_shift_id: shift.id,
                                    p_user_id: m.user_id,
                                    p_replace_id: replacement,
                                  });
                                  setReplacement(null);
                                  setExpanded(null);
                                });
                              }}
                            />
                          );
                        })}
                      </>
                    )}
                    <Button
                      title='Edit shift'
                      secondary
                      compact
                      disabled={s.pending || c.assigned > 0}
                      onPress={() =>
                        setEdit({
                          id: shift.id,
                          start: localInput(shift.starts_at),
                          end: localInput(shift.ends_at),
                          coverage: String(shift.minimum_coverage),
                        })}
                    />
                    {edit?.id === shift.id && (
                      <>
                        <Field
                          label='Start (local YYYY-MM-DDTHH:MM)'
                          value={edit.start}
                          onChangeText={(v) => setEdit({ ...edit, start: v })}
                        />
                        <Field
                          label='End (local YYYY-MM-DDTHH:MM)'
                          value={edit.end}
                          onChangeText={(v) => setEdit({ ...edit, end: v })}
                        />
                        <Field
                          label='Minimum staffing'
                          value={edit.coverage}
                          onChangeText={(v) => setEdit({ ...edit, coverage: v })}
                          keyboardType='number-pad'
                        />
                        <Button
                          title='Save shift'
                          disabled={s.pending}
                          onPress={() => {
                            void change(async () => {
                              await setupRpc('edit_shift', {
                                ...base,
                                p_shift_id: shift.id,
                                p_start: edit.start,
                                p_end: edit.end,
                                p_coverage: Number(edit.coverage),
                              });
                              setEdit(null);
                            });
                          }}
                        />
                        <Button
                          title='Cancel edit'
                          secondary
                          compact
                          onPress={() => setEdit(null)}
                        />
                      </>
                    )}
                  </>
                )}
              </PlanCard>
            );
          })}
          {visible < coverage.filter((c) =>
                !gapsOnly || c.missing || c.invalid.length ||
                c.qualifications.some((q) => q.actual < q.required)
              ).length && (
            <Button
              title='Show more shifts'
              secondary
              compact
              onPress={() => setVisible(visible + 25)}
            />
          )}
          {draft && (
            <>
              <Button
                title={publishConfirm
                  ? 'Confirm publication to volunteers'
                  : 'Publish reviewed roster'}
                disabled={s.pending || !data?.ready?.ready}
                onPress={() => {
                  if (!publishConfirm) {
                    setPublishConfirm(true);
                    return;
                  }
                  void change(() =>
                    setupRpc('publish_roster', {
                      ...base,
                      p_staffing_revision: data.ready!.staffingRevision,
                    })
                  );
                }}
              />
              {publishConfirm && (
                <Notice message='Publishing shares each volunteer’s own assignments. Confirm after reviewing coverage and qualifications.' />
              )}
              <Button
                title={discardConfirm ? 'Confirm discard (history retained)' : 'Discard draft'}
                secondary
                compact
                disabled={s.pending}
                onPress={() => {
                  if (!discardConfirm) {
                    setDiscardConfirm(true);
                    return;
                  }
                  void change(async () => {
                    await setupRpc('discard_roster_draft', base);
                    setSelected(null);
                  });
                }}
              />
            </>
          )}
        </>
      )}
      <Button
        title='Refresh'
        secondary
        compact
        disabled={s.pending}
        onPress={() => {
          void s.refresh();
        }}
      />
      <Button title='Back' secondary compact onPress={() => router.back()} />
    </Page>
  );
}
