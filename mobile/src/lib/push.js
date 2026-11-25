/**
 * push.js — budget alerts, bill reminders and split updates as phone notifications.
 *
 * Remote push needs a development or store build with an EAS projectId
 * (app.json → extra.eas.projectId). In Expo Go, on web, on simulators, or before
 * a projectId is configured, registration is skipped quietly and the in-app
 * notification list still works.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from './api';
import { plain } from './storage';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

const projectId = () => Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId || '';

export const registerForPush = async () => {
  if (Platform.OS === 'web' || !Device.isDevice || !projectId()) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Clario', importance: Notifications.AndroidImportance.DEFAULT, lightColor: '#E85002' });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
  await api.post('/users/push-token', { token, platform: Platform.OS });
  await plain.set('clario.pushToken', token);
  return token;
};

export const unregisterPush = async () => {
  const token = await plain.get('clario.pushToken');
  if (token) await api.del('/users/push-token', { token });
  await plain.del('clario.pushToken');
};

/** Routes a tapped notification to its screen (server sends web paths like /budgets). */
export const linkFor = (path = '') => {
  if (path.startsWith('/splits/')) return path;
  if (path.startsWith('/budgets') || path.startsWith('/goals')) return '/plan';
  if (path.startsWith('/transactions')) return '/activity';
  if (path.startsWith('/challenges')) return '/challenges';
  if (path.startsWith('/subscriptions')) return '/subscriptions';
  return '/';
};
