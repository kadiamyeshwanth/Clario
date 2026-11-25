/**
 * clario-sms — bank / UPI SMS auto-import (Android only).
 *
 * The native module exists only in Android builds of Clario (dev or store
 * build — not Expo Go, not iOS, not web). `isAvailable` tells the UI whether to
 * offer the feature at all.
 */
import { Platform, PermissionsAndroid } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

const Native = Platform.OS === 'android' ? requireOptionalNativeModule('ClarioSms') : null;

export const isAvailable = !!Native;

/** Asks for RECEIVE_SMS (live) and READ_SMS (backfill). Returns { receive, read }. */
export const requestPermissions = async () => {
  if (!Native) return { receive: false, read: false };
  const r = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    PermissionsAndroid.PERMISSIONS.READ_SMS,
  ]);
  return {
    receive: r[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED,
    read: r[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED,
    blocked: Object.values(r).includes(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN),
  };
};

export const configure = (webhookUrl, enabled) => (Native ? Native.configure(webhookUrl, enabled) : Promise.resolve(false));

export const getStatus = () => (Native ? Native.getStatus() : null);

export const flushQueue = () => (Native ? Native.flushQueue() : Promise.resolve(0));

/** Bank-looking SMS received since `sinceMs` (newest first, up to `limit`). */
export const readInbox = (sinceMs, limit = 500) => (Native ? Native.readInbox(sinceMs, limit) : Promise.resolve([]));
