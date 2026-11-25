/**
 * Accounts — balances per account (each in its own currency), add/remove
 * accounts, and move money between them.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { money, currencyCode, CURRENCY_CODES } from '../lib/money';
import { confirm } from '../lib/confirm';
import { useTheme } from '../theme';
import { Screen, Card, Text, Button, Field, Segmented, Loading, ErrorNote, Empty } from '../components/ui';

const TYPES = [['bank', 'Bank'], ['cash', 'Cash'], ['savings', 'Savings'], ['credit', 'Credit card'], ['investment', 'Investment']];

export default function Wallets() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['wallets'], queryFn: () => api.get('/wallets') });
  const [mode, setMode] = useState(null); // 'add' | 'transfer'
  const [w, setW] = useState({ name: '', type: 'bank', balance: '', currency: currencyCode() });
  const [tf, setTf] = useState({ from: '', to: '', amount: '' });
  const [error, setError] = useState('');

  const done = () => { qc.invalidateQueries({ queryKey: ['wallets'] }); qc.invalidateQueries({ queryKey: ['overview'] }); setMode(null); setError(''); };
  const add = useMutation({ mutationFn: (b) => api.post('/wallets', b), onSuccess: done, onError: (e) => setError(e.message) });
  const del = useMutation({ mutationFn: (id) => api.del(`/wallets/${id}`), onSuccess: done });
  const transfer = useMutation({ mutationFn: (b) => api.post('/wallets/transfer', b), onSuccess: done, onError: (e) => setError(e.message) });

  const list = q.data?.data || [];
  const opts = list.map((x) => [x._id, x.name]);

  return (
    <Screen edges={[]} refreshing={q.isRefetching} onRefresh={q.refetch}>
      {q.isLoading ? <Loading /> : (q.isError && !q.data) ? <ErrorNote error={q.error} onRetry={q.refetch} /> : (
        <>
          <Card brand style={{ gap: 4 }}>
            <Text variant="caption" color="rgba(255,255,255,0.75)">Net worth across accounts</Text>
            <Text variant="figure" color="#fff">{money(q.data.totalBalance, { sign: true })}</Text>
            {q.data.approximate && <Text variant="small" color="rgba(255,255,255,0.8)">Includes approximate exchange rates.</Text>}
          </Card>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Add account" style={{ flex: 1 }} variant={mode === 'add' ? 'primary' : 'default'} onPress={() => setMode(mode === 'add' ? null : 'add')} />
            {list.length > 1 && <Button title="Transfer" style={{ flex: 1 }} variant={mode === 'transfer' ? 'primary' : 'default'} onPress={() => setMode(mode === 'transfer' ? null : 'transfer')} />}
          </View>

          {mode === 'add' && (
            <Card style={{ gap: 12 }}>
              <Field label="Name" value={w.name} onChangeText={(v) => setW({ ...w, name: v })} placeholder="e.g. HDFC Savings, Cash" />
              <Segmented scroll value={w.type} onChange={(v) => setW({ ...w, type: v })} options={TYPES} />
              <Field label={`Current balance (${w.currency})`} keyboardType="numbers-and-punctuation" value={w.balance} onChangeText={(v) => setW({ ...w, balance: v })} placeholder="0" />
              <Segmented scroll value={w.currency} onChange={(v) => setW({ ...w, currency: v })} options={[currencyCode(), ...CURRENCY_CODES.filter((c) => c !== currencyCode())].map((c) => [c, c])} />
              {!!error && <Text variant="small" color={t.red}>{error}</Text>}
              <Button title="Save account" loading={add.isPending} onPress={() => add.mutate({ ...w, balance: Number(w.balance) || 0 })} />
            </Card>
          )}

          {mode === 'transfer' && (
            <Card style={{ gap: 12 }}>
              <Text variant="caption">From</Text>
              <Segmented scroll value={tf.from} onChange={(v) => setTf({ ...tf, from: v })} options={opts} />
              <Text variant="caption">To</Text>
              <Segmented scroll value={tf.to} onChange={(v) => setTf({ ...tf, to: v })} options={opts.filter(([id]) => id !== tf.from)} />
              <Field label="Amount" keyboardType="decimal-pad" value={tf.amount} onChangeText={(v) => setTf({ ...tf, amount: v })} />
              <Text variant="small">Transfers aren’t income or spending — they just move money between your own accounts.</Text>
              {!!error && <Text variant="small" color={t.red}>{error}</Text>}
              <Button title="Move money" loading={transfer.isPending} disabled={!tf.from || !tf.to || tf.from === tf.to}
                onPress={() => transfer.mutate({ fromWalletId: tf.from, toWalletId: tf.to, amount: Number(tf.amount) })} />
            </Card>
          )}

          {list.length === 0 ? <Empty title="No accounts yet" body="Add your bank, cash and cards. Linked transactions keep each balance up to date." /> : list.map((x) => (
            <Card key={x._id} style={{ gap: 4 }} onPress={() => confirm('Delete account?', `Delete “${x.name}”? Its transactions are kept.`, () => del.mutate(x._id))}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="heading">{x.name}{x.isDefault ? '  ·  default' : ''}</Text>
                <Text variant="small">{TYPES.find(([k]) => k === x.type)?.[1]}</Text>
              </View>
              <Text variant="mono" style={{ fontSize: 22 }} color={x.balance < 0 ? t.red : undefined}>{money(x.balance, { code: x.currency, sign: true, decimals: 2 })}</Text>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
