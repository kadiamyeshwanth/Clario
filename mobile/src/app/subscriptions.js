import React, { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { money, symbol } from '../lib/money';
import { confirm } from '../lib/confirm';
import { useTheme } from '../theme';
import { Screen, Card, Text, Button, Field, Segmented, Row, Loading, ErrorNote, Empty } from '../components/ui';

export default function Subscriptions() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['subscriptions'], queryFn: () => api.get('/subscriptions') });
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['subscriptions'] }); qc.invalidateQueries({ queryKey: ['overview'] }); };
  const add = useMutation({ mutationFn: (b) => api.post('/subscriptions', b), onSuccess: () => { refresh(); setForm(null); setError(''); }, onError: (e) => setError(e.message) });
  const update = useMutation({ mutationFn: ({ id, ...b }) => api.patch(`/subscriptions/${id}`, b), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id) => api.del(`/subscriptions/${id}`), onSuccess: refresh });

  return (
    <Screen edges={[]} refreshing={q.isRefetching} onRefresh={q.refetch}>
      {q.isLoading ? <Loading /> : (q.isError && !q.data) ? <ErrorNote error={q.error} onRetry={q.refetch} /> : (
        <>
          <Card brand style={{ gap: 4 }}>
            <Text variant="caption" color="rgba(255,255,255,0.75)">Subscriptions cost you</Text>
            <Text variant="figure" color="#fff">{money(q.data.monthlyTotal)}<Text variant="small" color="#fff"> / month</Text></Text>
            <Text variant="small" color="rgba(255,255,255,0.8)">{money(q.data.yearlyTotal)} a year</Text>
          </Card>
          {form ? (
            <Card style={{ gap: 12 }}>
              <Field label="Service" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Netflix" />
              <Field label={`Price (${symbol()})`} keyboardType="decimal-pad" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} />
              <Segmented value={form.billingCycle} onChange={(v) => setForm({ ...form, billingCycle: v })} options={[['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]} />
              <Field label="Next renewal (YYYY-MM-DD)" value={form.renewalDate} onChangeText={(v) => setForm({ ...form, renewalDate: v })} autoCapitalize="none" />
              {!!error && <Text variant="small" color={t.red}>{error}</Text>}
              <Button title="Save" loading={add.isPending} onPress={() => add.mutate({ ...form, amount: Number(form.amount), renewalDate: form.renewalDate || undefined })} />
              <Button title="Cancel" variant="ghost" onPress={() => setForm(null)} />
            </Card>
          ) : <Button title="Add subscription" variant="default" onPress={() => setForm({ name: '', amount: '', billingCycle: 'monthly', renewalDate: '' })} />}
          {q.data.data.length === 0 ? <Empty title="Nothing tracked yet" body="Add the services you pay for. Clario reminds you 3 days before each renewal." /> : (
            <Card style={{ gap: 2 }}>
              {q.data.data.map((s) => (
                <Row key={s._id} title={s.name}
                  subtitle={`${s.billingCycle}${s.daysUntilRenewal != null ? ` · renews in ${s.daysUntilRenewal} days` : ''} · ${s.status}`}
                  right={<View style={{ alignItems: 'flex-end' }}><Text variant="mono">{money(s.amount)}</Text></View>}
                  onPress={() => update.mutate({ id: s._id, status: s.status === 'active' ? 'paused' : 'active' })}
                  onLongPress={() => confirm('Delete subscription?', s.name, () => del.mutate(s._id))} />
              ))}
              <Text variant="small" style={{ marginTop: 8 }}>Tap to pause or resume · long-press to delete</Text>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
