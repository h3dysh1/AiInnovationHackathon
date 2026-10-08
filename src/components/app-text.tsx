import { Text, StyleSheet, type TextProps } from 'react-native';
import { isLoaded } from 'expo-font';
import { colors, fonts } from '@/theme';

// Static font files avoid synthetic weights and keep Android/iOS lettering aligned.
export function AppText({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style);
  const weight = flat?.fontWeight === 'bold' ? 600 : Number(flat?.fontWeight ?? 400);
  const family = weight >= 600 ? fonts.semibold : weight >= 500 ? fonts.medium : fonts.regular;
  const loaded = isLoaded(family);
  return <Text {...props} style={[{ color: colors.text, fontSize: 15, lineHeight: 23 }, style, loaded && { fontFamily: family, fontWeight: 'normal' }]} />;
}
