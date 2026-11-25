/**
 * Settings — currency, language, notifications, signed-in devices, data.
 * Preferences are stored on the server, so they follow you to the web app.
 */
import React, { useState } from 'react';
import { View, Switch, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { api } from '../lib/api';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || Constants.expoConfig?.extra?.webUrl || 'http://localhost:5173').replace(/\/$/, '');
import { useAuth } from '../lib/auth';
import { CURRENCY_CODES } from '../lib/money';
import { LANGUAGES } from '../lib/i18n';
import { confirm, notify } from '../lib/confirm';
import { useTheme } from '../theme';
import { Screen, Card, Text, Button, Field, Segmented, Row, Loading } from '../components/ui';

export default function Settings() {
  const t = useTheme();
  const qc = useQueryClient();
  const { user, updateUser, signOut } = useAuth();
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: () => api.get('/users/preferences') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get('/auth/sessions') });
  const [convert, setConvert] = useState(true);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');

  const save = useMutation({
    mutationFn: (patch) => api.patch('/users/preferences', patch),
    onSuccess: (r) => {
      updateUser({ ...user, preferences: r.preferences });
      qc.invalidateQueries();
      setMsg(r.converted ? `Converted ${r.converted.transactions} transactions at ${r.converted.rate.toFixed(4)}.` : 'Saved.');
    },
    onError: (e) => setMsg(e.message),
  });
  const revoke = useMutation({ mutationFn: (id) => api.del(`/auth/sessions/${id}`), onSuccess: () => sessions.refetch() });
  const exportData = useMutation({
    mutationFn: () => api.get('/users/export'),
    onSuccess: (d) => notify('Export ready', `${d.transactions?.length || 0} transactions, ${d.wallets?.length || 0} accounts. For a downloadable file, use Settings → Export on the web app.`),
  });
  const deleteAccount = useMutation({
    mutationFn: () => api.del('/users/account', { password: pw }),
    onSuccess: async () => { await signOut(); },
    onError: (e) => setMsg(e.message),
  });

  if (prefs.isLoading) return <Screen edges={[]}><Loading /></Screen>;
  const p = prefs.data || {};
  const notif = p.notifications || {};

  return (
    <Screen edges={[]}>
      <Card style={{ gap: 12 }}>
        <Text variant="heading">Currency</Text>
        <Segmented scroll value={p.currency} onChange={(c) => c !== p.currency && save.mutate({ currency: c, convertExisting: convert })} options={CURRENCY_CODES.map((c) => [c, c])} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text variant="small" style={{ flex: 1 }}>When changing currency, convert my existing amounts at today’s rate</Text>
          <Switch value={convert} onValueChange={setConvert} trackColor={{ true: t.brand }} />
        </View>
        <Text variant="heading">Language</Text>
        <Segmented scroll value={p.language} onChange={(l) => save.mutate({ language: l })} options={LANGUAGES.map((l) => [l.code, l.label])} />
        <Text variant="small">Timezone: {p.timezone}</Text>
        {!!msg && <Text variant="small" color={t.brand}>{msg}</Text>}
      </Card>

      <Card style={{ gap: 4 }}>
        <Text variant="heading">Notifications</Text>
        {[['budgetAlerts', 'Budget alerts'], ['billReminders', 'Bill reminders'], ['weeklyDigest', 'Weekly digest'], ['push', 'Push to this phone']].map(([k, label]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text variant="body">{label}</Text>
            <Switch value={notif[k] !== false} onValueChange={(v) => save.mutate({ notifications: { [k]: v } })} trackColor={{ true: t.brand }} />
          </View>
        ))}
      </Card>

      <Card style={{ gap: 2 }}>
        <Text variant="heading">Signed-in devices</Text>
        {(sessions.data || []).map((s) => (
          <Row key={s.id} title={`${s.device}${s.current ? ' · this device' : ''}`}
            subtitle={`last active ${new Date(s.lastUsedAt).toLocaleString()}`}
            right={!s.current ? <Button small variant="ghost" title="Sign out" onPress={() => revoke.mutate(s.id)} /> : null} />
        ))}
      </Card>

      <Card style={{ gap: 10 }}>
        <Text variant="heading">Your data</Text>
        <Button variant="default" title="Check my export" loading={exportData.isPending} onPress={() => exportData.mutate()} />
        <Button variant="default" title="SMS auto-import setup (web)" onPress={() => Linking.openURL(`${WEB_URL}/settings`)} />
        {Platform.OS !== 'web' && <Text variant="small">Android: install the Clario SMS forwarder to import bank SMS automatically.</Text>}
      </Card>

      <Card style={{ gap: 10, borderColor: t.red }}>
        <Text variant="heading" color={t.red}>Delete account</Text>
        <Text variant="small">Deletes your account and everything in it. This can’t be undone.</Text>
        {user?.hasPassword !== false && <Field label="Your password" secureTextEntry value={pw} onChangeText={setPw} />}
        <Button variant="danger" title="Delete my account" loading={deleteAccount.isPending}
          onPress={() => confirm('Delete account?', 'Everything will be permanently deleted.', () => deleteAccount.mutate())} />
      </Card>
    </Screen>
  );
}
