/**
 * Sign in / create account / forgot password — the phone version of the web
 * login: the promise on top, a flat card below, one orange action.
 */
import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuth } from '../lib/auth';
import { API_URL } from '../lib/api';
import { useTheme } from '../theme';
import { Text, Button, Field, Card } from '../components/ui';
import Logo from '../components/Logo';

export default function SignIn() {
  const t = useTheme();
  const { signIn, signUp, forgotPassword, completeOAuth } = useAuth();
  const [mode, setMode] = useState('login'); // login | register | forgot
  const [f, setF] = useState({ username: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async () => {
    setError(''); setNotice('');
    if (mode === 'register' && f.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'login') await signIn(f.username, f.password);
      else if (mode === 'register') await signUp(f.username, f.email, f.password);
      else { const r = await forgotPassword(f.email); setNotice(r.message); }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError('');
    const redirect = Linking.createURL('auth/callback');
    const result = await WebBrowser.openAuthSessionAsync(`${API_URL}/auth/google?platform=mobile`, redirect);
    if (result.type === 'success') {
      const { queryParams } = Linking.parse(result.url);
      if (queryParams?.code) {
        try { await completeOAuth(String(queryParams.code)); } catch (e) { setError(e.message); }
      } else setError(queryParams?.error === 'oauth_unavailable' ? 'Google sign-in isn’t set up on this server.' : 'Google sign-in was cancelled.');
    }
  };

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Android 15 draws edge-to-edge, so the window no longer resizes for the
          keyboard by itself — without 'height' the password field and Continue
          sat hidden behind the keyboard (found testing on a realme, Android 15). */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 22, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Logo size={30} color={t.brand} />
              <Text variant="display" style={{ fontSize: 22 }}>Clario</Text>
            </View>
            <Text variant="display" style={{ fontSize: 30, lineHeight: 36 }}>Know where it went.{'\n'}Without handing over your bank.</Text>
            <Text variant="small">No bank login, ever. Forward an SMS, drop a CSV, or add it in two taps.</Text>
          </View>

          <Card style={{ gap: 14 }}>
            <Text variant="heading" style={{ fontSize: 18 }}>
              {mode === 'login' ? 'Log in to Clario' : mode === 'register' ? 'Create your account' : 'Reset your password'}
            </Text>

            {mode !== 'forgot' && (
              <Button title="Continue with Google" variant="default" onPress={google} />
            )}

            {mode !== 'forgot' && (
              <Field label={mode === 'login' ? 'Username or email' : 'Username'} value={f.username} onChangeText={set('username')}
                autoCapitalize="none" autoCorrect={false} textContentType="username" autoComplete="username" placeholder={mode === 'login' ? 'Enter username or email' : 'e.g. yeshwanth'} />
            )}
            {mode !== 'login' && (
              <Field label="Email" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address"
                textContentType="emailAddress" autoComplete="email" placeholder="you@example.com" />
            )}
            {mode !== 'forgot' && (
              <Field label="Password" value={f.password} onChangeText={set('password')} secureTextEntry
                textContentType={mode === 'register' ? 'newPassword' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} onSubmitEditing={submit} />
            )}

            {!!error && <Text variant="small" color={t.red}>{error}</Text>}
            {!!notice && <Text variant="small" color={t.green}>{notice}</Text>}

            <Button title={mode === 'login' ? 'Continue' : mode === 'register' ? 'Create account' : 'Send reset link'} onPress={submit} loading={busy} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              {mode === 'login' ? (
                <>
                  <Pressable onPress={() => setMode('register')}><Text variant="small">No account? <Text variant="small" color={t.brand}>Sign up free</Text></Text></Pressable>
                  <Pressable onPress={() => setMode('forgot')}><Text variant="small" color={t.brand}>Forgot password?</Text></Pressable>
                </>
              ) : (
                <Pressable onPress={() => setMode('login')}><Text variant="small">Have an account? <Text variant="small" color={t.brand}>Log in</Text></Text></Pressable>
              )}
            </View>
          </Card>
          <Text variant="small" style={{ textAlign: 'center' }}>You never have to connect a bank account.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
