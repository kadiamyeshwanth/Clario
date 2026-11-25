/**
 * SMS auto-import — every UPI / card / bank payment becomes a transaction.
 *
 * Android: Clario itself listens for bank SMS (even when closed) and can import
 * the last 30 days from the inbox. iPhone: Apple lets no app read SMS, so we
 * walk the user through a one-time iOS Shortcuts automation that forwards bank
 * messages to the same webhook.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Platform, Switch, Share, AppState } from 'react-native';
import * as Linking from 'expo-linking';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChatCircleText, CheckCircle, WarningCircle } from 'phosphor-react-native';
import * as Sms from '../../modules/clario-sms';
import { api } from '../lib/api';
import { money } from '../lib/money';
import { useTheme } from '../theme';
import { Screen, Card, Text, Button, Row, Loading, ErrorNote } from '../components/ui';

const DAY = 864e5;

export default function SmsImport() {
  const t = useTheme();
  const qc = useQueryClient();
  const setup = useQuery({ queryKey: ['smsSetup'], queryFn: () => api.get('/sms/setup') });
  const history = useQuery({ queryKey: ['smsHistory'], queryFn: () => api.get('/sms/history') });
  const [status, setStatus] = useState(() => Sms.getStatus());
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const refreshStatus = useCallback(() => setStatus(Sms.getStatus()), []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refreshStatus());
    return () => sub.remove();
  }, [refreshStatus]);

  // Keep the native forwarder pointed at this account's current webhook.
  useEffect(() => {
    if (setup.data?.webhookUrl && Sms.getStatus()?.enabled) {
      Sms.configure(setup.data.webhookUrl, true).then(refreshStatus).catch(() => {});
    }
  }, [setup.data?.webhookUrl, refreshStatus]);

  const refreshData = () => {
    ['smsHistory', 'transactions', 'overview', 'wallets', 'budgets'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const backfill = async (days = 30) => {
    setBusy('import'); setNote('');
    try {
      const msgs = await Sms.readInbox(Date.now() - days * DAY, 1000);
      if (!msgs.length) { setNote(`No bank messages found in the last ${days} days.`); return; }
      const total = { created: 0, duplicate: 0, skipped: 0 };
      for (let i = 0; i < msgs.length; i += 200) {
        const r = await api.post('/sms/import', { messages: msgs.slice(i, i + 200) });
        total.created += r.created; total.duplicate += r.duplicate; total.skipped += r.skipped;
      }
      setNote(`Added ${total.created} transaction${total.created === 1 ? '' : 's'} from ${msgs.length} bank messages` +
        `${total.duplicate ? ` · ${total.duplicate} already recorded` : ''}${total.skipped ? ` · ${total.skipped} weren't payments (OTPs, reminders…)` : ''}.`);
      refreshData();
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy('');
    }
  };

  const turnOn = async () => {
    setBusy('toggle'); setNote('');
    try {
      const p = await Sms.requestPermissions();
      if (!p.receive) {
        setNote(p.blocked ? 'SMS permission is blocked. Allow it in Android Settings → Apps → Clario → Permissions.' : 'Clario needs SMS permission to read bank messages.');
        return;
      }
      await Sms.configure(setup.data.webhookUrl, true);
      refreshStatus();
      if (p.read && !history.data?.length) await backfill(30);
      else setNote('On. New bank messages will appear here within seconds.');
    } finally {
      setBusy('');
    }
  };

  const turnOff = async () => {
    await Sms.configure(setup.data.webhookUrl, false);
    refreshStatus();
    setNote('Off. Clario no longer reads incoming SMS.');
  };

  const flush = async () => {
    setBusy('flush');
    const n = await Sms.flushQueue();
    refreshStatus(); refreshData();
    setNote(n ? `Sent ${n} message${n === 1 ? '' : 's'} saved while offline.` : 'Nothing could be sent yet — check your connection.');
    setBusy('');
  };

  if (setup.isLoading) return <Screen edges={[]}><Loading /></Screen>;
  if (setup.isError && !setup.data) return <Screen edges={[]}><ErrorNote error={setup.error} onRetry={setup.refetch} /></Screen>;
  const s = setup.data;

  return (
    <Screen edges={[]} refreshing={history.isRefetching} onRefresh={() => { history.refetch(); refreshStatus(); }}>
      <Card brand style={{ gap: 6 }}>
        <ChatCircleText size={26} color="#fff" weight="fill" />
        <Text variant="heading" color="#fff" style={{ fontSize: 18 }}>Pay with any UPI app. Clario writes it down.</Text>
        <Text variant="small" color="rgba(255,255,255,0.85)">
          GPay, PhonePe, Paytm, cards, ATM, salary — your bank texts you about every one. Clario turns those texts into transactions: amount, merchant, category, time.
        </Text>
      </Card>

      {!s.reachableFromPhone && (
        <Card style={{ gap: 6, borderColor: t.brand }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><WarningCircle size={18} color={t.brand} weight="fill" /><Text variant="heading">Server not reachable from a phone</Text></View>
          <Text variant="small">This Clario server's public address is set to localhost, so a phone can't deliver messages to it. Set BACKEND_URL on the server to its public https address.</Text>
        </Card>
      )}

      {Sms.isAvailable ? (
        <>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text variant="heading">Auto-import bank SMS</Text>
                <Text variant="small">Works in the background, even when Clario is closed. Personal messages never leave your phone.</Text>
              </View>
              <Switch value={!!status?.enabled && !!status?.canReceive} disabled={busy === 'toggle'}
                onValueChange={(v) => (v ? turnOn() : turnOff())} trackColor={{ true: t.brand }} />
            </View>
            {status?.enabled && !status?.canReceive && <Text variant="small" color={t.red}>SMS permission was removed. Turn the switch off and on to allow it again.</Text>}
            {status?.enabled && status?.canReceive && (
              <View style={{ gap: 4 }}>
                <Text variant="small">
                  {status.forwarded ? `${status.forwarded} message${status.forwarded === 1 ? '' : 's'} sent to Clario from this phone.` : 'Waiting for your next bank SMS.'}
                  {status.lastAt ? ` Last: ${new Date(status.lastAt).toLocaleString()}${status.lastOk ? '' : ' (failed — will retry)'}.` : ''}
                </Text>
                {status.queued > 0 && <Button small variant="default" title={`Send ${status.queued} saved offline`} loading={busy === 'flush'} onPress={flush} style={{ alignSelf: 'flex-start' }} />}
              </View>
            )}
            <Button variant="default" title="Import last 30 days of bank SMS" loading={busy === 'import'} disabled={!status?.canRead && !status?.enabled}
              onPress={async () => { if (!status?.canRead) { const p = await Sms.requestPermissions(); refreshStatus(); if (!p.read) return; } backfill(30); }} />
            {!!note && <Text variant="small" color={t.brand}>{note}</Text>}
          </Card>
          <Text variant="small">
            Google Play only allows SMS access for money-management apps after review; Clario asks for it only when you switch this on, and you can switch it off any time.
          </Text>
        </>
      ) : Platform.OS === 'ios' ? (
        <Card style={{ gap: 10 }}>
          <Text variant="heading">On iPhone: a one-time Shortcut</Text>
          <Text variant="small">Apple doesn't let any app read your messages, so iPhone uses the built-in Shortcuts app to forward bank messages to Clario — set it up once, then it runs by itself.</Text>
          {[
            'Open Shortcuts → Automation → + → Message.',
            'Message Contains: "debited" (make a second automation for "credited"). Choose "Run Immediately".',
            'Add the action "Get Contents of URL". URL: paste your Clario link (button below). Method: POST. Request Body: JSON.',
            'Add two fields: "message" = Shortcut Input → Content, and "from" = Shortcut Input → Sender.',
            'Done. Your next bank SMS appears in Clario within seconds.',
          ].map((step, i) => <Text key={i} variant="body">{i + 1}. {step}</Text>)}
          <Button title="Share my Clario link" onPress={() => Share.share({ message: s.webhookUrl })} />
          <Button variant="ghost" title="Open Shortcuts" onPress={() => Linking.openURL('shortcuts://').catch(() => {})} />
          <Text variant="small">Keep this link private — anyone with it can add transactions to your account. You can replace it in Settings on the web.</Text>
        </Card>
      ) : (
        <Card style={{ gap: 8 }}>
          <Text variant="heading">Available in the Clario Android app</Text>
          <Text variant="small">SMS import needs the installed Android app (it isn't available in a browser or in Expo Go). Your personal webhook link, for other forwarder apps:</Text>
          <Text variant="mono" style={{ fontSize: 12 }} selectable>{s.webhookUrl}</Text>
        </Card>
      )}

      <Card style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <CheckCircle size={18} color={t.green} weight="fill" />
          <Text variant="heading">Imported from SMS</Text>
        </View>
        {history.isLoading ? <Loading /> : !history.data?.length ? (
          <Text variant="small">Nothing yet.</Text>
        ) : history.data.slice(0, 15).map((tx) => (
          <Row key={tx._id} title={tx.merchant || tx.description || tx.category}
            subtitle={`${tx.category} · ${new Date(tx.date).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`}
            right={<Text variant="mono" color={tx.type === 'income' ? t.green : t.red}>{tx.type === 'income' ? '+' : '−'}{money(tx.amount)}</Text>} />
        ))}
      </Card>
    </Screen>
  );
}
