/**
 * clario://auth/callback?code=… — fallback when the OS opens the deep link
 * directly instead of returning it to the auth session (some Android browsers).
 */
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, Redirect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { Screen, Loading, Text } from '../../components/ui';

export default function OAuthCallback() {
  const { code } = useLocalSearchParams();
  const { completeOAuth, user } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    if (code && !user) completeOAuth(String(code)).catch((e) => setError(e.message));
  }, [code, user, completeOAuth]);

  if (user) return <Redirect href="/" />;
  if (!code || error) return <Redirect href="/sign-in" />;
  return <Screen scroll={false}><Loading /><Text variant="small" style={{ textAlign: 'center' }}>Signing you in…</Text></Screen>;
}
