import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { circleDiameter, pointFromTap, type MapPoint } from '@/domain/site-geometry';

export type ImageMapMarker = { key: string; point: MapPoint; label: string; selected?: boolean; radiusPercent?: number | null; checkIn?: boolean };

export function SiteMapImage({ url, width, height, markers = [], onTap, onError }: {
  url: string; width: number; height: number; markers?: ImageMapMarker[]; onTap?: (point: MapPoint) => void; onError?: () => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const ready = loadedUrl === url && failedUrl !== url;
  return <Pressable
    accessibilityRole={onTap ? 'button' : 'image'}
    accessibilityLabel={onTap ? 'Site map. Tap to add, select or position a site item.' : 'Event site map'}
    disabled={Boolean(onTap) && !ready}
    onLayout={event => { const { width: viewWidth, height: viewHeight } = event.nativeEvent.layout; setSize({ width: viewWidth, height: viewHeight }); }}
    onPress={onTap ? event => {
      const point = pointFromTap(event.nativeEvent.locationX, event.nativeEvent.locationY, size.width, size.height);
      if (point) onTap(point);
    } : undefined}
    style={[styles.map, { aspectRatio: width / height }]}
  >
    <View pointerEvents="none" style={StyleSheet.absoluteFill}><Image
      key={url} source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="contain"
      onLoad={() => { setLoadedUrl(url); setFailedUrl(null); }}
      onError={() => { setFailedUrl(url); onError?.(); }}
    /></View>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {markers.filter(marker => marker.radiusPercent != null).map(marker => {
        const diameter = circleDiameter(marker.radiusPercent!, size);
        return <View key={`${marker.key}-circle`} style={[styles.circle, marker.selected && styles.selectedCircle, marker.checkIn && styles.checkInCircle, {
          left: `${marker.point.x}%`, top: `${marker.point.y}%`, width: diameter, height: diameter, borderRadius: diameter / 2,
          transform: [{ translateX: -diameter / 2 }, { translateY: -diameter / 2 }],
        }]} />;
      })}
      {markers.map(marker => <View key={marker.key} style={[styles.marker, marker.selected && styles.selected, marker.checkIn && styles.checkInMarker, { left: `${marker.point.x}%`, top: `${marker.point.y}%` }]}>
        <Text style={styles.markerText}>{marker.label}</Text>
      </View>)}
    </View>
    {!ready ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.status]}><Text style={styles.statusText}>{failedUrl === url ? 'Could not display the map. Reload its preview to try again.' : 'Loading map image…'}</Text></View> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  map: { width: '100%', backgroundColor: '#E4EFF1', borderRadius: 12, overflow: 'hidden' },
  marker: { position: 'absolute', minWidth: 24, height: 24, paddingHorizontal: 4, borderRadius: 12, backgroundColor: '#123B53', borderWidth: 2, borderColor: '#FFF', transform: [{ translateX: -12 }, { translateY: -12 }], alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: '#AF4D12', borderColor: '#FFE8A5' },
  circle: { position: 'absolute', borderWidth: 2, borderColor: '#123B53', backgroundColor: 'rgba(18, 59, 83, 0.10)' },
  selectedCircle: { borderColor: '#AF4D12', backgroundColor: 'rgba(175, 77, 18, 0.12)' },
  checkInCircle: { borderStyle: 'dashed', borderColor: '#126B79', backgroundColor: 'rgba(18, 107, 121, 0.08)' },
  checkInMarker: { backgroundColor: '#126B79', transform: [{ translateX: -12 }, { translateY: -30 }] },
  markerText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  status: { backgroundColor: '#E4EFF1', alignItems: 'center', justifyContent: 'center', padding: 16 },
  statusText: { color: '#45616E', fontSize: 14, textAlign: 'center' },
});
