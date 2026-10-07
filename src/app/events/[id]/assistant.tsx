import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { Text } from 'react-native';
import { EventManagerGate } from '@/components/event-manager-gate';
import { Button, Field, Loading, Notice, Page, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { proposalGaps } from '@/domain/operating-plan';
import { usePlanning } from '@/hooks/planning';
import { useAuth } from '@/hooks/auth';
import { analysisProgress, enqueueAnalysis, launchAnalysis } from '@/services/planning';
import {
  clearClarification,
  keepClarification,
  readClarification,
} from '@/services/clarification-drafts';
export default function AssistantRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EventManagerGate id={id}>
      <Assistant id={id} />
    </EventManagerGate>
  );
}
function Assistant({ id }: { id: string }) {
  const s = usePlanning(id);
  const { session } = useAuth();
  const userId = session!.user.id;
  const [restored] = useState(() => {
    try {
      return { draft: readClarification(id, userId), error: null };
    } catch {
      return { draft: null, error: 'Could not restore your local answer draft.' };
    }
  });
  const [answer, setAnswer] = useState(restored.draft?.answer ?? '');
  const [savedQuestion, setSavedQuestion] = useState<string | null>(
    restored.draft?.question ?? null,
  );
  const [requestId, setRequestId] = useState(() => restored.draft?.requestId ?? randomUUID());
  const [draftError, setDraftError] = useState<string | null>(restored.error);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const latest = s.data?.jobs[0];
  const busy = Boolean(
    latest && (latest.status === 'running' || latest.status === 'queued') &&
      now - Date.parse(latest.updated_at) < 240000,
  );
  const { refresh, setError } = s;
  const jobId = latest?.id;
  const jobStatus = latest?.status;
  const jobUpdated = latest?.updated_at;
  useFocusEffect(useCallback(() => {
    if (!busy || !jobId) return;
    let active = true;
    const timer = setInterval(() => {
      void analysisProgress(jobId).then((progress) => {
        if (active && (progress.status !== jobStatus || progress.updated_at !== jobUpdated)) {
          void refresh();
        }
      }).catch(() => {
        if (active) setError('Could not refresh analysis status. Your saved input is retained.');
      });
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [busy, jobId, jobStatus, jobUpdated, refresh, setError]));
  const proposal =
    latest?.status === 'succeeded' && !latest.applied_revision && !latest.dismissed_at
      ? latest.output
      : null;
  const issue = proposal?.issues.find((i) => i.severity === 'blocking') ?? proposal?.issues[0];
  const gap = proposal ? proposalGaps(proposal)[0] : null;
  const existingIssue =
    s.data?.issues.find((i) => i.status === 'open' && i.severity === 'blocking') ??
      s.data?.issues.find((i) => i.status === 'open');
  const question = savedQuestion ?? issue?.question ??
    (gap ? `Please clarify: ${gap}` : existingIssue?.question ??
      'What else should Ground Control know about staffing, hours, qualifications, supervision or safety procedures?');
  function change(value: string) {
    setAnswer(value);
    setSavedQuestion(question);
    try {
      keepClarification(id, userId, question, value, requestId);
      setDraftError(null);
    } catch {
      setDraftError(
        'Could not save an answer draft on this device. Keep this screen open until your answer is saved.',
      );
    }
  }
  async function analyse(withAnswer: boolean) {
    await s.run(async () => {
      const jobId = await enqueueAnalysis(
        id,
        requestId,
        withAnswer ? question : undefined,
        withAnswer ? answer : undefined,
      );
      setAnswer('');
      setSavedQuestion(null);
      setRequestId(randomUUID());
      try {
        clearClarification(id, userId);
      } catch {
        setDraftError('Input saved, but the old local draft could not be cleared.');
      }
      await launchAnalysis(jobId);
    });
  }
  if (s.loading) return <Loading />;
  return (
    <Page>
      <Title subtitle='Answers are saved before AI runs. Every result remains a proposal.'>
        Setup assistant
      </Title>
      {s.error ? <Notice message={s.error} /> : null}
      {draftError ? <Notice message={draftError} /> : null}
      <Notice message='Gemini drafts the plan and identifies ambiguity. You review staffing and safety requirements before the event can be verified.' />
      {latest
        ? (
          <PlanCard>
            <Text style={planStyles.badge}>Analysis: {latest.status.toUpperCase()}</Text>
            <Text style={planStyles.help}>
              Started {new Date(latest.created_at).toLocaleString()}
            </Text>
            {latest.error_message ? <Notice message={latest.error_message} /> : null}
            {busy
              ? (
                <Text style={planStyles.text}>
                  Processing your saved inputs. You can leave this screen and return.
                </Text>
              )
              : null}
            {latest.status === 'succeeded'
              ? (
                <Button
                  title='Review candidate operating plan'
                  disabled={s.pending}
                  onPress={() => router.push({ pathname: '/events/[id]/review', params: { id } })}
                />
              )
              : null}
            {(latest.status === 'failed' || latest.status === 'queued' ||
                latest.status === 'running' && !busy)
              ? (
                <Button
                  title='Retry saved analysis'
                  secondary
                  disabled={s.pending}
                  onPress={() => {
                    void s.run(() => launchAnalysis(latest.id));
                  }}
                />
              )
              : null}
          </PlanCard>
        )
        : null}
      {!busy
        ? (
          <Button
            title={latest ? 'Analyse latest setup again' : 'Generate candidate operating plan'}
            disabled={s.pending || Boolean(answer.trim())}
            onPress={() => {
              void analyse(false);
            }}
          />
        )
        : null}
      {!busy
        ? (
          <PlanCard>
            <Text style={planStyles.heading}>One thing to clarify</Text>
            <Text style={planStyles.text}>{question}</Text>
            {issue?.evidence
              ? <Text style={planStyles.help}>Why this matters: {issue.evidence}</Text>
              : existingIssue?.evidence
              ? <Text style={planStyles.help}>Why this matters: {existingIssue.evidence}</Text>
              : null}
            <Field
              label='Your answer'
              value={answer}
              onChangeText={change}
              multiline
              editable={!s.pending}
            />
            <Text style={planStyles.help}>
              {answer.length} / 4,000 characters ·{' '}
              {answer ? 'Draft kept on this device' : 'Answer in your own words.'}
            </Text>
            <Button
              title={s.pending ? 'Saving answer…' : 'Save answer & update candidate'}
              disabled={s.pending || !answer.trim() || answer.length > 4000}
              onPress={() => {
                void analyse(true);
              }}
            />
          </PlanCard>
        )
        : null}
      {s.data?.answers.length
        ? (
          <PlanCard>
            <Text style={planStyles.heading}>Saved conversation</Text>
            {s.data.answers.map((a) => (
              <PlanCard key={a.id}>
                <Text style={planStyles.help}>{a.question}</Text>
                <Text style={planStyles.text}>{a.answer}</Text>
              </PlanCard>
            ))}
          </PlanCard>
        )
        : null}
      <Button
        title='Use manual editor'
        secondary
        disabled={s.pending}
        onPress={() => router.push({ pathname: '/events/[id]/site', params: { id } })}
      />
      <Button
        title='Refresh status'
        secondary
        disabled={s.pending}
        onPress={() => {
          void s.refresh();
        }}
      />
      <Button title='Back to setup' secondary disabled={s.pending} onPress={() => router.back()} />
    </Page>
  );
}
