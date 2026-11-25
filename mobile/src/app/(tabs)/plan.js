/**
 * Plan — monthly budgets (with live status) and savings goals.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { confirm } from '../../lib/confirm';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { money, symbol } from '../../lib/money';
import { useTheme } from '../../theme';
import { Screen, Card, Text, Progress, Button, Field, Segmented, Loading, ErrorNote, Empty, Header } from '../../components/ui';

const CATEGORIES = ['Food', 'Rent', 'Travel', 'Shopping', 'Entertainment', 'Utilities', 'Healthcare', 'Education', 'Other Expense'];

export default function Plan() {
  const t = useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState('budgets');
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');

  const budgets = useQuery({ queryKey: ['budgets'], queryFn: () => api.get('/budgets') });
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => api.get('/goals') });
  const done = () => { qc.invalidateQueries({ queryKey: ['budgets'] }); qc.invalidateQueries({ queryKey: ['goals'] }); qc.invalidateQueries({ queryKey: ['overview'] }); setForm(null); setError(''); };
  const fail = (e) => setError(e.message);

  const saveBudget = useMutation({ mutationFn: (b) => api.post('/budgets/add', b), onSuccess: done, onError: fail });
  const delBudget = useMutation({ mutationFn: (id) => api.del(`/budgets/${id}`), onSuccess: done });
  const addGoal = useMutation({ mutationFn: (g) => api.post('/goals/add', g), onSuccess: done, onError: fail });
  const contribute = useMutation({ mutationFn: ({ id, ...g }) => api.post(`/goals/update/${id}`, g), onSuccess: done, onError: fail });
  const delGoal = useMutation({ mutationFn: (id) => api.del(`/goals/${id}`), onSuccess: done });

  return (
    <Screen refreshing={budgets.isRefetching || goals.isRefetching} onRefresh={() => { budgets.refetch(); goals.refetch(); }}>
      <Header title="Plan" subtitle="Budgets reset every month. Goals keep going." />
      <Segmented value={tab} onChange={(v) => { setTab(v); setForm(null); }} options={[['budgets', 'Budgets'], ['goals', 'Goals']]} />

      {tab === 'budgets' && (
        <>
          {form ? (
            <Card style={{ gap: 12 }}>
              <Text variant="heading">Monthly budget</Text>
              <Segmented scroll value={form.category} onChange={(c) => setForm({ ...form, category: c })} options={CATEGORIES.map((c) => [c, c])} />
              <Field label={`Limit per month (${symbol()})`} keyboardType="decimal-pad" value={form.limit} onChangeText={(v) => setForm({ ...form, limit: v })} placeholder="e.g. 8000" />
              {!!error && <Text variant="small" color={t.red}>{error}</Text>}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Save" style={{ flex: 1 }} loading={saveBudget.isPending} onPress={() => saveBudget.mutate({ category: form.category, limit: Number(form.limit) })} />
                <Button title="Cancel" variant="default" onPress={() => setForm(null)} />
              </View>
            </Card>
          ) : <Button title="Set a budget" variant="default" onPress={() => setForm({ category: 'Food', limit: '' })} />}

          {budgets.isLoading ? <Loading /> : (budgets.isError && !budgets.data) ? <ErrorNote error={budgets.error} onRetry={budgets.refetch} /> : budgets.data.length === 0 ? (
            <Empty title="No budgets yet" body="Pick a category and a monthly limit. Clario warns you before you go over." />
          ) : budgets.data.map((b) => (
            <Card key={b._id} style={{ gap: 8 }} onPress={() => confirm('Delete budget?', `Remove the ${b.category} budget?`, () => delBudget.mutate(b._id))}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="heading">{b.category}</Text>
                <Text variant="small" color={b.state === 'over' ? t.red : b.state === 'warning' ? t.brand : t.green}>
                  {b.state === 'over' ? 'Over' : b.state === 'warning' ? 'Close to limit' : 'On track'}
                </Text>
              </View>
              <Progress pct={b.pct} color={b.state === 'over' ? t.red : b.state === 'warning' ? t.brand : t.green} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="small">{money(b.spent)} of {money(b.effectiveLimit ?? b.limit)}</Text>
                <Text variant="small">{b.remaining >= 0 ? `${money(b.remaining)} left` : `${money(-b.remaining)} over`}</Text>
              </View>
              {b.projected > (b.effectiveLimit ?? b.limit) && b.state !== 'over' && (
                <Text variant="small" color={t.brand}>At this pace you’ll reach {money(b.projected)} by month end.</Text>
              )}
            </Card>
          ))}
        </>
      )}

      {tab === 'goals' && (
        <>
          {form ? (
            <Card style={{ gap: 12 }}>
              <Text variant="heading">{form.id ? `Add to ${form.name}` : 'New savings goal'}</Text>
              {!form.id && <Field label="Goal" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Emergency fund" />}
              {!form.id && <Field label={`Target (${symbol()})`} keyboardType="decimal-pad" value={form.target} onChangeText={(v) => setForm({ ...form, target: v })} />}
              {!!form.id && <Field label={`Amount to add (${symbol()})`} keyboardType="decimal-pad" value={form.add} onChangeText={(v) => setForm({ ...form, add: v })} autoFocus />}
              {!!error && <Text variant="small" color={t.red}>{error}</Text>}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Save" style={{ flex: 1 }} loading={addGoal.isPending || contribute.isPending} onPress={() => (form.id
                  ? contribute.mutate({ id: form.id, currentAmount: form.current + Number(form.add || 0) })
                  : addGoal.mutate({ name: form.name, targetAmount: Number(form.target), currentAmount: 0 }))} />
                <Button title="Cancel" variant="default" onPress={() => setForm(null)} />
              </View>
            </Card>
          ) : <Button title="New goal" variant="default" onPress={() => setForm({ name: '', target: '' })} />}

          {goals.isLoading ? <Loading /> : (goals.isError && !goals.data) ? <ErrorNote error={goals.error} onRetry={goals.refetch} /> : goals.data.length === 0 ? (
            <Empty title="No goals yet" body="A trip, a laptop, three months of rent in the bank — name it and watch it fill." />
          ) : goals.data.map((g) => {
            const pct = Math.min(100, (g.currentAmount / g.targetAmount) * 100);
            return (
              <Card key={g._id} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="heading">{g.name}</Text>
                  <Text variant="small">{Math.round(pct)}%</Text>
                </View>
                <Text variant="mono" style={{ fontSize: 20 }}>{money(g.currentAmount)} <Text variant="small">of {money(g.targetAmount)}</Text></Text>
                <Progress pct={pct} color={pct >= 100 ? t.green : t.brand} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {pct < 100 && <Button small title="Add money" onPress={() => setForm({ id: g._id, name: g.name, current: g.currentAmount, add: '' })} />}
                  <Button small variant="ghost" title="Delete" onPress={() => confirm('Delete goal?', `Remove “${g.name}”?`, () => delGoal.mutate(g._id))} />
                </View>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
