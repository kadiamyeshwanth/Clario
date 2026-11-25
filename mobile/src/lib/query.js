/**
 * query.js — data cache, kept on the phone so the app works offline.
 *
 * Every screen's last successful data is saved to device storage. With no
 * signal the app shows that (and says it's offline) instead of an empty error
 * screen; when the connection returns, it refreshes on its own. The saved copy
 * is wiped on sign-out so one account's data can never show for another.
 */
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Must outlive the saved copy, or restored data would be thrown away.
      gcTime: WEEK,
      // Show cached data first, then refetch — instead of pausing when offline.
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'offlineFirst' },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'clario.queryCache',
  throttleTime: 2000,
});

export const persistOptions = {
  persister,
  maxAge: WEEK,
  // Bump to invalidate every phone's saved cache after a data-shape change.
  buster: 'v3.1',
};

/** Forget everything cached (sign-out). */
export const clearCache = async () => {
  queryClient.clear();
  await persister.removeClient();
};

export { onlineManager };
