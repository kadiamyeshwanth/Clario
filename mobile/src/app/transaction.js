/**
 * Add or edit a transaction (?id= edits). Supports accounts, foreign currency,
 * recurring entries, and works offline (queued with an idempotency key).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Switch } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { api } from '../lib/api';
import { createTransaction } from '../lib/outbox';
import { CURRENCY_CODES, currencyCode, money } from '../lib/money';
import { confirm, notify } from '../lib/confirm';
import { useTheme } from '../theme';
import { Screen, Card, Text, Field, Segmented, Button, Loading } from '../components/ui';

const EXPENSE = ['Food', 'Rent', 'Travel', 'Shopping', 'Entertainment', 'Utilities', 'Healthcare', 'Education', 'Other Expense'];
const INCOME = ['Salary', 'Freelance', 'Bonus', 'Investment', 'Gift', 'Other Income'];
const today = () => new Date().toISOString().slice(0, 10);

export default function TransactionScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams();
  const editing = !!id;

  const existing = useQuery({ queryKey: ['transaction', id], queryFn: () => api.get(`/transactions/${id}`), enabled: editing });
  const wallets = useQuery({ queryKey: ['wallets'], queryFn: () => api.get('/wallets') });
  const [f, setF] = useState({ type: 'expense', category: 'Food', amount: '', date: today(), merchant: '', description: '', currency: currencyCode(), walletId: null, isRecurring: false, frequency: 'monthly' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    const tx = existing.data;
    if (tx) setF({
      type: tx.type, category: tx.category, amount: String(tx.originalAmount ?? tx.amount), date: tx.date.slice(0, 10),
      merchant: tx.merchant || '', description: tx.description || '', currency: tx.originalCurrency || currencyCode(),
      walletId: tx.walletId || null, isRecurring: !!tx.isRecurring, frequency: tx.frequency === 'once' ? 'monthly' : tx.frequency,
    });
  }, [existing.data]);

  // New entries default to the default account.
  useEffect(() => {
    if (!editing && f.walletId === null && wallets.data?.data?.length) {
      const d = wallets.data.data.find((w) => w.isDefault);
      if (d) setF((s) => ({ ...s, walletId: d._id }));
    }
  }, [wallets.data, editing, f.walletId]);

  const cats = f.type === 'income' ? INCOME : EXPENSE;
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const walletOptions = useMemo(() => [['', 'None'], ...(wallets.data?.data || []).map((w) => [w._id, w.name])], [wallets.data]);

  const refreshAll = () => ['overview', 'transactions', 'wallets', 'budgets'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const suggest = async () => {
    if (!f.merchant.trim()) return;
    setSuggesting(true);
    try {
      const r = await api.post('/insights/suggest-category', { merchant: f.merchant, description: f.description });
      if (r?.category && (f.type === 'income' ? INCOME : EXPENSE).includes(r.category)) setF((s) => ({ ...s, category: r.category }));
    } catch { /* suggestion is best-effort */ } finally { setSuggesting(false); }
  };

  const save = async () => {
    setError('');
    const amount = Number(String(f.amount).replace(/,/g, ''));
    if (!(amount > 0)) { setError('Enter an amount greater than zero.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) { setError('Date must look like 2026-11-25.'); return; }
    const body = {
      type: f.type, category: f.category, amount, date: f.date, merchant: f.merchant.trim(), description: f.description.trim(),
      walletId: f.walletId || null, isRecurring: f.isRecurring, frequency: f.isRecurring ? f.frequency : 'once',
      ...(f.currency !== currencyCode() || editing ? { currency: f.currency } : {}),
    };
    setBusy(true);
    try {
      if (editing) await api.patch(`/transactions/${id}`, body);
      else {
        const r = await createTransaction(body);
        if (r.queued) notify('Saved offline', 'No connection right now — it will sync automatically.');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      refreshAll();
      router.back();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = () => confirm('Delete transaction?', 'This also reverses its effect on the account balance.', async () => {
    try { await api.del(`/transactions/${id}`); refreshAll(); router.back(); } catch (e) { setError(e.message); }
  });

  if (editing && existing.isLoading) return <Screen><Loading /></Screen>;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: editing ? 'Edit transaction' : 'New transaction' }} />
      <Segmented value={f.type} onChange={(v) => setF((s) => ({ ...s, type: v, category: (v === 'income' ? INCOME : EXPENSE)[0] }))} options={[['expense', 'Expense'], ['income', 'Income']]} />

      <Card style={{ gap: 14 }}>
        <Field label={`Amount (${f.currency})`} keyboardType="decimal-pad" value={f.amount} onChangeText={set('amount')} placeholder="0.00" autoFocus={!editing} />
        <Text variant="caption">Currency</Text>
        <Segmented scroll value={f.currency} onChange={set('currency')} options={[currencyCode(), ...CURRENCY_CODES.filter((c) => c !== currencyCode())].map((c) => [c, c])} />
        <Field label="Merchant / payee" value={f.merchant} onChangeText={set('merchant')} onBlur={suggest} placeholder="e.g. Starbucks, Uber, Amazon" />
        <Text variant="caption">Category {suggesting ? '· suggesting…' : ''}</Text>
        <Segmented scroll value={f.category} onChange={set('category')} options={cats.map((c) => [c, c])} />
        <Field label="Date" value={f.date} onChangeText={set('date')} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <Field label="Note" value={f.description} onChangeText={set('description')} placeholder="What was this for?" />
        {walletOptions.length > 1 && (
          <>
            <Text variant="caption">{f.type === 'income' ? 'Into account' : 'Paid from'}</Text>
            <Segmented scroll value={f.walletId || ''} onChange={(v) => set('walletId')(v || null)} options={walletOptions} />
          </>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text variant="body">Repeats</Text>
            <Text variant="small">Clario adds it for you on schedule.</Text>
          </View>
          <Switch value={f.isRecurring} onValueChange={set('isRecurring')} trackColor={{ true: t.brand }} />
        </View>
        {f.isRecurring && <Segmented value={f.frequency} onChange={set('frequency')} options={[['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]} />}
      </Card>

      {existing.data?.originalCurrency && (
        <Text variant="small">Recorded as {money(existing.data.amount)} in your currency at {existing.data.fxRate?.toFixed(4)}.</Text>
      )}
      {!!error && <Text variant="small" color={t.red}>{error}</Text>}
      <Button title={editing ? 'Save changes' : 'Add transaction'} onPress={save} loading={busy} />
      {editing && <Button title="Delete" variant="ghost" onPress={remove} />}
    </Screen>
  );
}
