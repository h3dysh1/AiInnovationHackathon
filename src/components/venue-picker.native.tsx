import { AppText as Text } from '@/components/app-text';
import { colors } from '@/theme';
import { useRef } from 'react';
import MapView, { Marker } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui';
import type { VenuePickerProps } from '@/components/venue-picker';

export default function VenuePicker({ value, onChange, disabled }: VenuePickerProps) {
  const map = useRef<MapView>(null);
  return <View style={styles.container}>
    <Text style={styles.help}>Pan and zoom to the event site, then tap to place its venue pin. You can drag the pin to adjust it.</Text>
    <MapView
      ref={map}
      style={styles.map}
      initialRegion={{ latitude: value?.latitude ?? -37.818, longitude: value?.longitude ?? 144.974, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
      onPress={event => { if (!disabled) onChange(event.nativeEvent.coordinate); }}
      showsUserLocation={false}
    >
      {value ? <Marker coordinate={value} title="Event venue" draggable={!disabled} onDragEnd={event => { if (!disabled) onChange(event.nativeEvent.coordinate); }} /> : null}
    </MapView>
    {value ? <Button title="Centre on selected venue" secondary disabled={disabled} onPress={() => map.current?.animateToRegion({ ...value, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 300)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  map: { width: '100%', height: 280, borderRadius: 12 },
  help: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
});
