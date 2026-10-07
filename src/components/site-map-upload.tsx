import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Loading, Notice } from '@/components/ui';
import { SiteMapImage } from '@/components/site-map-image';
import type { SiteMapState } from '@/hooks/site-map';

export function SiteMapUpload({ state, onUploaded, preview = true, disabled = false }: {
  state: SiteMapState; onUploaded?: () => void; preview?: boolean; disabled?: boolean;
}) {
  const [replacing, setReplacing] = useState(false);
  async function pick() {
    setReplacing(false);
    if (await state.upload()) onUploaded?.();
  }
  return <View style={styles.card}>
    <Text style={styles.title}>Event site map</Text>
    {state.error ? <><Notice message={state.error} /><Button title="Reload map" secondary disabled={state.uploading || disabled} onPress={state.refresh} /></> : null}
    {state.loading ? <Loading label="Loading map…" /> : null}
    {preview && state.map && state.url ? <SiteMapImage url={state.url} width={state.map.width} height={state.map.height} onError={state.reportPreviewError} /> : null}
    {!state.map && !state.loading ? <Text style={styles.help}>Upload the event site plan as an image, up to 10 MB.</Text> : null}
    {replacing ? <>
      <Notice message="Replacing the map clears its pins, circles and post check-in areas. Your locations and staffing posts are retained so you can place them on the new image." />
      <Button title="Choose replacement image" disabled={state.uploading || state.loading || Boolean(state.error) || disabled} onPress={() => { void pick(); }} />
      <Button title="Cancel replacement" secondary onPress={() => setReplacing(false)} />
    </> : <Button title={state.uploading ? 'Uploading…' : state.map ? 'Replace map image' : 'Upload map image'} disabled={state.loading || state.uploading || Boolean(state.error) || disabled} onPress={() => { if (state.map) setReplacing(true); else void pick(); }} />}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: '#D6E3E6' },
  title: { color: '#123B53', fontSize: 19, fontWeight: '800' },
  help: { color: '#45616E', fontSize: 14, lineHeight: 21 },
});
