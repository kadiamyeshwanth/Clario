import { Alert, Platform } from 'react-native';

/** A destructive-action confirm that works on iOS, Android and the web preview. */
export const confirm = (title, message, onYes, yesLabel = 'Delete') => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes(); return; }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: yesLabel, style: 'destructive', onPress: onYes }]);
};

export const notify = (title, message) => {
  if (Platform.OS === 'web') { globalThis.alert?.(`${title}\n\n${message || ''}`); return; }
  Alert.alert(title, message);
};
