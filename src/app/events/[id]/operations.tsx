import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { EventManagerGate } from '@/components/event-manager-gate';
import { Button, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { validPlanDate, validPlanTime } from '@/domain/operating-plan';
import { usePlanning } from '@/hooks/planning';
import { removeProcedure, removeWindow, saveProcedure, saveWindow } from '@/services/planning';
export default function OperationsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EventManagerGate id={id}>
      <Operations id={id} />
    </EventManagerGate>
  );
}
type WindowDraft = {
  id?: string;
  postId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  coverage: string;
};
function Operations({ id }: { id: string }) {
  const s = usePlanning(id);
  const [draft, setDraft] = useState<WindowDraft | null>(null);
  const [procedure, setProcedure] = useState<
    { id?: string; title: string; content: string } | null
  >(null);
  const [remove, setRemove] = useState<string | null>(null);
  if (s.loading) return <Loading />;
  const data = s.data;
  async function saveHours() {
    if (!draft || !data) return;
    const ok = await s.run(async () => {
      if (
        !validPlanDate(draft.startDate) || !validPlanDate(draft.endDate) ||
        draft.startDate < data!.event.start_date || draft.endDate > data!.event.end_date ||
        draft.endDate < draft.startDate
      ) throw new Error('Enter valid dates within this event.');
      if (
        !validPlanTime(draft.startTime) || !validPlanTime(draft.endTime) ||
        draft.endTime <= draft.startTime
      ) throw new Error('Use same-day hours as HH:MM, with the end after the start.');
      if (
        draft.coverage && !/^\d+$/.test(draft.coverage) ||
        draft.coverage && (Number(draft.coverage) < 1 || Number(draft.coverage) > 10000)
      ) throw new Error('Staffing override must be a positive whole number.');
      await saveWindow(id, draft.postId, {
        start_date: draft.startDate,
        end_date: draft.endDate,
        start_time: draft.startTime,
        end_time: draft.endTime,
        minimum_coverage: draft.coverage ? Number(draft.coverage) : null,
      }, draft.id);
    });
    if (ok) setDraft(null);
  }
  return (
    <Page>
      <Title subtitle={data?.event.name}>Operating hours & procedures</Title>
      {s.error ? <Notice message={s.error} /> : null}
      <Text style={planStyles.help}>
        Each window applies daily from the first date through the last, in the event timezone.
        Qualified counts must fit every window. Changes require a new review.
      </Text>
      {data?.posts.map((p) => (
        <PlanCard key={p.id}>
          <Text style={planStyles.heading}>{p.name}</Text>
          <Text style={planStyles.help}>
            {data.locations.find((l) => l.id === p.location_id)?.name} · {p.minimum_coverage}{' '}
            volunteers by default
          </Text>
          {data.windows.filter((w) => w.post_id === p.id).map((w) => (
            <PlanCard key={w.id}>
              <Text style={planStyles.text}>
                {w.start_date}–{w.end_date} · {w.start_time.slice(0, 5)}–{w.end_time.slice(0, 5)}
                {'\n'}
                {w.minimum_coverage ?? p.minimum_coverage} minimum volunteers
              </Text>
              <Button
                title='Edit operating window'
                secondary
                disabled={s.pending}
                onPress={() =>
                  setDraft({
                    id: w.id,
                    postId: p.id,
                    startDate: w.start_date,
                    endDate: w.end_date,
                    startTime: w.start_time.slice(0, 5),
                    endTime: w.end_time.slice(0, 5),
                    coverage: w.minimum_coverage?.toString() ?? '',
                  })}
              />
              {remove === w.id
                ? (
                  <>
                    <Notice message='Removing these hours changes this post’s staffing plan.' />
                    <Button
                      title='Confirm removal'
                      disabled={s.pending}
                      onPress={() => {
                        void s.run(() => removeWindow(w.id)).then((ok) => {
                          if (ok) setRemove(null);
                        });
                      }}
                    />
                    <Button title='Cancel' secondary onPress={() => setRemove(null)} />
                  </>
                )
                : (
                  <Button
                    title='Remove operating window'
                    secondary
                    disabled={s.pending}
                    onPress={() => setRemove(w.id)}
                  />
                )}
            </PlanCard>
          ))}
          <Button
            title='Add operating window'
            secondary
            disabled={s.pending}
            onPress={() =>
              setDraft({
                postId: p.id,
                startDate: data.event.start_date,
                endDate: data.event.end_date,
                startTime: '',
                endTime: '',
                coverage: '',
              })}
          />
        </PlanCard>
      ))}
      {draft
        ? (
          <PlanCard>
            <Text style={planStyles.heading}>
              Operating window · {data?.posts.find((p) => p.id === draft.postId)?.name}
            </Text>
            {(['startDate', 'endDate', 'startTime', 'endTime'] as const).map((k) => (
              <Field
                key={k}
                label={`${k} (${k.includes('Date') ? 'YYYY-MM-DD' : 'HH:MM'})`}
                value={draft[k]}
                onChangeText={(v) => setDraft({ ...draft, [k]: v })}
              />
            ))}
            <Field
              label='Minimum volunteers override (optional)'
              value={draft.coverage}
              keyboardType='number-pad'
              onChangeText={(coverage) => setDraft({ ...draft, coverage })}
            />
            <Button
              title='Save operating window'
              disabled={s.pending}
              onPress={() => {
                void saveHours();
              }}
            />
            <Button
              title='Cancel window edit'
              secondary
              disabled={s.pending}
              onPress={() => setDraft(null)}
            />
          </PlanCard>
        )
        : null}
      <Text style={planStyles.heading}>Procedures</Text>
      {data?.procedures.map((p) => (
        <PlanCard key={p.id}>
          <Text style={planStyles.heading}>{p.title}</Text>
          <Text style={planStyles.text}>{p.content}</Text>
          <Button
            title='Edit procedure'
            secondary
            disabled={s.pending}
            onPress={() => setProcedure(p)}
          />
          {remove === p.id
            ? (
              <>
                <Notice message='Confirm this procedure is no longer needed before removing it.' />
                <Button
                  title='Confirm removal'
                  disabled={s.pending}
                  onPress={() => {
                    void s.run(() => removeProcedure(p.id)).then((ok) => {
                      if (ok) setRemove(null);
                    });
                  }}
                />
                <Button title='Cancel' secondary onPress={() => setRemove(null)} />
              </>
            )
            : (
              <Button
                title='Remove procedure'
                secondary
                disabled={s.pending}
                onPress={() => setRemove(p.id)}
              />
            )}
        </PlanCard>
      ))}
      {procedure
        ? (
          <PlanCard>
            <Field
              label='Procedure title'
              value={procedure.title}
              onChangeText={(title) => setProcedure({ ...procedure, title })}
            />
            <Field
              label='Procedure text'
              value={procedure.content}
              multiline
              onChangeText={(content) => setProcedure({ ...procedure, content })}
            />
            <Button
              title='Save procedure'
              disabled={s.pending}
              onPress={() => {
                void s.run(() =>
                  saveProcedure(id, procedure.title, procedure.content, procedure.id)
                ).then((ok) => {
                  if (ok) setProcedure(null);
                });
              }}
            />
            <Button
              title='Cancel procedure edit'
              secondary
              disabled={s.pending}
              onPress={() => setProcedure(null)}
            />
          </PlanCard>
        )
        : (
          <Button
            title='Add procedure'
            disabled={s.pending}
            onPress={() => setProcedure({ title: '', content: '' })}
          />
        )}
      <Button
        title='Review plan'
        disabled={s.pending || Boolean(draft) || Boolean(procedure)}
        onPress={() => router.push({ pathname: '/events/[id]/review', params: { id } })}
      />
      <Button
        title='Back'
        secondary
        disabled={s.pending || Boolean(draft) || Boolean(procedure)}
        onPress={() => router.back()}
      />
    </Page>
  );
}
