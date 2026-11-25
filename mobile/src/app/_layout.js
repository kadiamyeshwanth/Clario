/**
 * Root layout: fonts, providers, and the signed-in / signed-out split.
 */
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { Unbounded_700Bold } from '@expo-google-fonts/unbounded';
import { GeistMono_500Medium, GeistMono_700Bold } from '@expo-google-fonts/geist-mono';
import { AuthProvider, useAuth } from '../lib/auth';
import { queryClient } from '../lib/query';
import { linkFor } from '../lib/push';
import { flushOutbox } from '../lib/outbox';
import { flushQueue as flushSmsQueue } from '../../modules/clario-sms';
import { useTheme } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigator() {
  const { user, ready } = useAuth();
  const t = useTheme();

  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);

  // Send any entries saved while offline as soon as we're signed in.
  useEffect(() => {
    if (!user) return;
    flushOutbox().catch(() => {});
    flushSmsQueue().catch(() => {}); // bank SMS that arrived while offline
  }, [user]);

  // A tapped notification opens the screen it is about.
  useEffect(() => {
    if (Platform.OS === 'web' || !user) return undefined;
    const go = (resp) => { const link = resp?.notification?.request?.content?.data?.link; if (link) router.push(linkFor(link)); };
    const last = Notifications.getLastNotificationResponse?.();
    if (last) go(last);
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => sub.remove();
  }, [user]);

  if (!ready) return null;

  const screen = { headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, headerTitleStyle: { fontFamily: t.font.uiBold }, headerShadowVisible: false, contentStyle: { backgroundColor: t.bg } };

  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ ...screen, headerShown: false }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="transaction" options={{ presentation: 'modal', headerShown: true, title: 'Transaction' }} />
          <Stack.Screen name="wallets" options={{ headerShown: true, title: 'Accounts' }} />
          <Stack.Screen name="splits/index" options={{ headerShown: true, title: 'Split expenses' }} />
          <Stack.Screen name="splits/[id]" options={{ headerShown: true, title: 'Group' }} />
          <Stack.Screen name="challenges" options={{ headerShown: true, title: 'Challenges' }} />
          <Stack.Screen name="subscriptions" options={{ headerShown: true, title: 'Subscriptions' }} />
          <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications' }} />
          <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
          <Stack.Screen name="sms-import" options={{ headerShown: true, title: 'SMS auto-import' }} />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold,
    Unbounded_700Bold, GeistMono_500Medium, GeistMono_700Bold,
  });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Navigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
