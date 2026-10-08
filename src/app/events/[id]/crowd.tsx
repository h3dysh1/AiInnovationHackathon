import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { AppText as Text } from '@/components/app-text';
import { Button, Loading, Notice, Page, Section, Title } from '@/components/ui';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { EventManagerGate } from '@/components/event-manager-gate';
import { CameraCard, CrowdLegend, CrowdMap } from '@/components/crowd-map';
import { secondsAgo } from '@/domain/crowd';
import { useSiteMap } from '@/hooks/site-map';
import { usePolling } from '@/hooks/polling';
import { useStaffing } from '@/hooks/staffing';
import { crowdSnapshot } from '@/services/crowd';
import { proposeResponse } from '@/services/staffing';
import { colors } from '@/theme';

const REFRESH_MS = 5000;

export default function CrowdRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventManagerGate id={id}><CrowdDashboard id={id} /></EventManagerGate>;
}

function CrowdDashboard({ id }: { id: string }) {
  const s = useStaffing(useCallback(() => crowdSnapshot(id), [id]));
  const siteMap = useSiteMap(id);
  const [drafted, setDrafted] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const { refresh } = s;
  usePolling(useCallback(() => {
    setNow(Date.now());
    return refresh();
  }, [refresh]), REFRESH_MS);
  if (s.loading) return <Loading label='Loading crowd cameras…' />;
  const snapshot = s.data;
  const covered = snapshot?.locations.filter((l) => l.latest) ?? [];
  const uncovered = snapshot?.locations.filter((l) => !l.latest) ?? [];
  return (
    <Page>
      <Title subtitle='Camera estimates, refreshed every few seconds'>Crowd control</Title>
      {s.error ? <Notice tone='error' message={s.error} /> : null}
      {snapshot
        ? (
          <>
            {snapshot.alerts.length
              ? (
                <Section title='Crowding alerts' count={snapshot.alerts.length}>
                  {snapshot.alerts.map((alert) => (
                    <PlanCard key={alert.id} style={styles.alert}>
                      <Text style={[planStyles.badge, styles.alertBadge]}>{alert.severity.toUpperCase()} · {alert.title}</Text>
                      <Text style={planStyles.text}>{alert.explanation}</Text>
                      <Text style={planStyles.help}>Updated {secondsAgo(alert.updated_at ?? alert.created_at, now)}</Text>
                      {drafted.includes(alert.id)
                        ? <Notice tone='success' message='Response drafted. Review and approve it in Alerts before anyone is dispatched.' />
                        : <Button title='Draft response' secondary compact disabled={s.pending} onPress={() => {
                          void s.run(async () => { await proposeResponse(undefined, alert.id); setDrafted((d) => [...d, alert.id]); });
                        }} />}
                    </PlanCard>
                  ))}
                </Section>
              )
              : null}

            <Section title='Site'>
              {siteMap.map && siteMap.url
                ? <CrowdMap url={siteMap.url} width={siteMap.map.width} height={siteMap.map.height} locations={snapshot.locations} thresholds={snapshot.thresholds} />
                : <Notice message={siteMap.loading ? 'Loading site map…' : 'Upload a site map in event setup to see crowd levels on the map.'} />}
              <CrowdLegend thresholds={snapshot.thresholds} />
            </Section>

            <Section title='Cameras' count={covered.length}>
              {!covered.length
                ? <Notice message='No camera readings yet. Start the camera pipeline (cv/) to send readings for a location.' />
                : covered.map((location) => <CameraCard key={location.id} location={location} thresholds={snapshot.thresholds} now={now} />)}
            </Section>

            {uncovered.length
              ? <Text style={planStyles.help}>No camera: {uncovered.map((l) => l.name).join(', ')}. These places rely on volunteer reports.</Text>
              : null}
            <Text style={planStyles.help}>
              Cameras count people and estimate flow. No images or identities are stored. Numbers are estimates:
              confirm on the ground before acting. Every response needs a coordinator&apos;s approval.
            </Text>
          </>
        )
        : <Notice message='Crowd readings are unavailable.' />}
      <Button title='Alerts' secondary onPress={() => router.push({ pathname: '/events/[id]/live', params: { id } })} />
      <Button title='Back to event tools' secondary onPress={() => router.back()} />
    </Page>
  );
}

const styles = StyleSheet.create({
  alert: { borderTopWidth: 2, borderColor: colors.warning },
  alertBadge: { color: colors.warning },
});
