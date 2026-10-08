import { Image, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppText as Text } from './app-text';
import { Button } from './ui';
import { colors } from '@/theme';

export function Welcome() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= 768;
  return <ScrollView contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 24 }]}>
    <View style={[styles.content, wide && { flexDirection: 'row', maxWidth: 1100, paddingTop: insets.top + 40 }]}>
      <Image accessibilityLabel='Illustrative event crew welcoming attendees at an outdoor festival' source={require('../../assets/images/welcome-crew.jpg')} resizeMode='cover' style={[styles.photo, { height: wide ? 620 : Math.max(240, Math.min(height * 0.4, 380)) }, wide && { flex: 1, width: '50%' }]} />
      <View style={[styles.copy, wide && { flex: 1, justifyContent: 'center', padding: 48 }]}>
        <Text style={styles.brand}>Ground Control</Text>
        <Text accessibilityRole='header' style={styles.title}>Good events.{ '\n' }Great people.</Text>
        <Text style={styles.subtitle}>Find your place in the crew. Get ready, stay connected and make the event happen.</Text>
        <View style={{ gap: 12, marginTop: 12 }}>
          <Button title='Get started' onPress={() => router.push('/sign-up')} />
          <Button title='Log in' secondary onPress={() => router.push('/sign-in')} />
        </View>
      </View>
    </View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: colors.canvas }, content: { width: '100%', alignSelf: 'center' }, photo: { width: '100%' },
  copy: { padding: 28, gap: 16 }, brand: { fontSize: 16, fontWeight: '500', color: colors.brand },
  title: { fontSize: 43, lineHeight: 48, letterSpacing: -1.4, fontWeight: '400' }, subtitle: { fontSize: 16, lineHeight: 25, color: colors.secondary },
});
