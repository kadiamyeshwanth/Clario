/**
 * storage.js — where tokens and small state live.
 *
 * Tokens go to the OS keychain/keystore via expo-secure-store on iOS/Android.
 * SecureStore does not exist on web (the web preview is for development), so
 * there it falls back to localStorage. Non-secret data uses AsyncStorage.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const web = Platform.OS === 'web';

export const secure = {
  get: (k) => (web ? Promise.resolve(globalThis.localStorage?.getItem(k) ?? null) : SecureStore.getItemAsync(k)),
  set: (k, v) => (web ? Promise.resolve(globalThis.localStorage?.setItem(k, v)) : SecureStore.setItemAsync(k, v)),
  del: (k) => (web ? Promise.resolve(globalThis.localStorage?.removeItem(k)) : SecureStore.deleteItemAsync(k)),
};

export const plain = {
  get: async (k, fallback = null) => {
    try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set: (k, v) => AsyncStorage.setItem(k, JSON.stringify(v)),
  del: (k) => AsyncStorage.removeItem(k),
};
