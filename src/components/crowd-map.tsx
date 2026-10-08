import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { circleDiameter } from '@/domain/site-geometry';
import { PlanCard, planStyles } from '@/components/plan-ui';
import { crowdLevel, crowdLevelLabel, densityLevel, secondsAgo, type CrowdLevel, type CrowdLocation, type CrowdThresholds } from '@/domain/crowd';

export const crowdColours: Record<CrowdLevel, string> = {
  clear: '#2E7D4F',
  caution: '#B7791F',
  high: '#C2410C',
  critical: '#B91C1C',
  stale: '#7A8C94',
  none: '#7A8C94',
};

/** The uploaded site map with each location tinted by its latest camera density. */
export function CrowdMap({ url, width, height, locations, thresholds }: {
  url: string; width: number; height: number; locations: CrowdLocation[]; thresholds: CrowdThresholds;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  const placed = locations.flatMap((l) => (l.map_x != null && l.map_y != null ? [{ ...l, x: l.map_x, y: l.map_y }] : []));
  return (
    <View
      accessibilityRole='image'
      accessibilityLabel={`Crowd map. ${placed.map((l) => `${l.name}: ${l.latest ? `${l.latest.density} people per square metre` : 'no camera'}`).join('. ')}`}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      style={[styles.map, { aspectRatio: width / height }]}
    >
      <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode='contain' onError={() => setFailed(true)} />
      {placed.map((l) => {
        const level = crowdLevel(l, thresholds);
        const colour = crowdColours[level];
        const diameter = Math.max(36, circleDiameter(l.map_radius_percent ?? 5, size));
        const covered = level !== 'none';
        return (
          <View key={l.id} pointerEvents='none' style={[styles.zone, {
            left: `${l.x}%`, top: `${l.y}%`, width: diameter, height: diameter, borderRadius: diameter / 2,
            transform: [{ translateX: -diameter / 2 }, { translateY: -diameter / 2 }],
            borderColor: colour, backgroundColor: covered ? `${colour}55` : 'rgba(122, 140, 148, 0.12)',
            borderStyle: covered ? 'solid' : 'dashed',
          }]}>
            <View style={[styles.tag, { backgroundColor: colour }]}>
              <Text style={styles.tagText} numberOfLines={1}>
                {l.name}{l.latest && level !== 'stale' ? ` · ${l.latest.density.toFixed(1)}` : ''}
              </Text>
            </View>
          </View>
        );
      })}
      {failed ? <View style={[StyleSheet.absoluteFill, styles.status]}><Text style={styles.statusText}>Could not display the site map.</Text></View> : null}
    </View>
  );
}

export function CrowdLegend({ thresholds }: { thresholds: CrowdThresholds }) {
  const items: [CrowdLevel, string][] = [
    ['clear', `Under ${thresholds.caution}`],
    ['caution', `${thresholds.caution}+`],
    ['high', `${thresholds.high}+`],
    ['critical', `${thresholds.critical}+`],
    ['none', 'No camera'],
  ];
  return (
    <View style={styles.legend}>
      {items.map(([level, text]) => (
        <View key={level} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: crowdColours[level] }]} />
          <Text style={styles.legendText}>{level === 'none' ? text : `${crowdLevelLabel[level]} (${text.toLowerCase()})`}</Text>
        </View>
      ))}
      <Text style={styles.legendText}>people per m²</Text>
    </View>
  );
}

/** Recent density as small bars, coloured by level; the dashed line is the caution threshold. */
export function DensityBars({ recent, thresholds }: { recent: { density: number; captured_at: string }[]; thresholds: CrowdThresholds }) {
  const max = Math.max(thresholds.critical + 0.5, ...recent.map((r) => r.density));
  const h = 44;
  return (
    <View accessibilityLabel={`Recent density from ${recent[0]?.density ?? 0} to ${recent.at(-1)?.density ?? 0} people per square metre`} style={[styles.bars, { height: h }]}>
      <View style={[styles.threshold, { bottom: (thresholds.caution / max) * h }]} />
      {recent.map((r) => {
        return <View key={r.captured_at} style={[styles.bar, { height: Math.max(2, (r.density / max) * h), backgroundColor: crowdColours[densityLevel(r.density, thresholds)] }]} />;
      })}
    </View>
  );
}

/** One camera-covered location: density, trend, opposing flows, recent history and freshness. */
export function CameraCard({ location, thresholds, now }: { location: CrowdLocation; thresholds: CrowdThresholds; now: number }) {
  const latest = location.latest!;
  const level = crowdLevel(location, thresholds, now);
  const colour = crowdColours[level];
  const arrow = latest.trend === 'rising' ? '↑' : latest.trend === 'falling' ? '↓' : '→';
  return (
    <PlanCard style={{ borderLeftWidth: 6, borderLeftColor: colour }}>
      <View style={cardStyles.row}>
        <Text style={planStyles.heading}>{location.name}</Text>
        <Text style={[cardStyles.level, { color: colour }]}>{crowdLevelLabel[level].toUpperCase()}</Text>
      </View>
      <View style={cardStyles.row}>
        <Text style={[cardStyles.big, level === 'stale' && { color: crowdColours.stale }]}>{latest.density.toFixed(1)}</Text>
        <Text style={planStyles.text}>people/m² · about {latest.people} people · {arrow} {latest.trend}</Text>
      </View>
      {latest.counterflow != null && latest.counterflow >= 0.5
        ? <Text style={[planStyles.text, cardStyles.warn]}>Opposing crowd flows ({latest.counterflow.toFixed(2)}): people are pushing in both directions.</Text>
        : null}
      <DensityBars recent={location.recent} thresholds={thresholds} />
      <Text style={planStyles.help}>
        {latest.camera_id} · {secondsAgo(latest.captured_at, now)}
        {latest.confidence != null ? ` · confidence ${Math.round(latest.confidence * 100)}%` : ''}
        {level === 'stale' ? ' · camera has gone quiet; this number may be out of date' : ''}
      </Text>
    </PlanCard>
  );
}

const cardStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  level: { fontSize: 13, fontWeight: '800' },
  big: { fontSize: 34, fontWeight: '800', color: '#123B53' },
  warn: { color: '#B91C1C', fontWeight: '700' },
});

const styles = StyleSheet.create({
  map: { width: '100%', backgroundColor: '#E4EFF1', borderRadius: 12, overflow: 'hidden' },
  zone: { position: 'absolute', borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', top: -14, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, maxWidth: 160 },
  tagText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  status: { backgroundColor: '#E4EFF1', alignItems: 'center', justifyContent: 'center', padding: 16 },
  statusText: { color: '#45616E', fontSize: 14, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 12, color: '#45616E' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, borderColor: '#D6E3E6' },
  bar: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  threshold: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#B7791F' },
});
