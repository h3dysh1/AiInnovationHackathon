import { Alert, Platform } from 'react-native';

export function confirmAction(title: string, message: string, action: () => void, destructive = false) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm(`${title}\n\n${message}`)) action();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', style: destructive ? 'destructive' : 'default', onPress: action },
  ]);
}
