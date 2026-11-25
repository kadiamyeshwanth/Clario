import React, { useState } from 'react';
import { View, Share } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { money } from '../../lib/money';
import { confirm } from '../../lib/confirm';
import { useTheme } from '../../theme';
import { Screen, Card, Text, Button, Field, Segmented, Row, Loading, ErrorNote, Empty } from '../../components/ui';

export default function SplitGroup() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams();
  const q = useQuery({ queryKey: ['splitGroup', id], queryFn: () => api.get(`/splits/groups/${id}`) });
  const g = q.data;
  const [adding, setAdding] = useState(false);
  const [e, setE] = useState({ description: '', amount: '', paidBy: null, included: null, addToMine: true });
  const [error, setError] = useState('');

  const refresh = () => { qc.invalidateQueries({ queryKey: ['splitGroup', id] }); qc.invalidateQueries({ queryKey: ['splitGroups'] }); qc.invalidateQueries({ queryKey: ['overview'] }); };
  const addExpense = useMutation({
    mutationFn: (b) => api.post(`/splits/groups/${id}/expenses`, b),
    onSuccess: () => { refresh(); setAdding(false); setE({ description: '', amount: '', paidBy: null, included: null, addToMine: true }); setError(''); },
    onError: (err) => setError(err.message),
  });
  const settle = useMutation({ mutationFn: (b) => api.post(`/splits/groups/${id}/settle`, b), onSuccess: refresh });
  const del = useMutation({ mutationFn: (eid) => api.del(`/splits/groups/${id}/expenses/${eid}`), onSuccess: refresh });

  if (q.isLoading) return <Screen edges={[]}><Loading /></Screen>;
  if (q.isError && !q.data) return <Screen edges={[]}><ErrorNote error={q.error} onRetry={q.refetch} /></Screen>;

  const cur = g.currency;
  const fmt = (n) => money(n, { code: cur, decimals: 2 });
  const nameOf = Object.fromEntries(g.members.map((m) => [m.id, m.isMe ? 'You' : m.name]));
  const paidBy = e.paidBy || g.me;
  const included = e.included || g.members.map((m) => m.id);

  return (
    <Screen edges={[]} refreshing={q.isRefetching} onRefresh={q.refetch}>
      <Stack.Screen options={{ title: g.name }} />
      <Card style={{ gap: 6 }}>
        <Text variant="small">{g.members.length} people · {fmt(g.totalSpent)} spent together</Text>
        {g.balances.map((b) => (
          <View key={b.memberId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="body">{nameOf[b.memberId]}</Text>
            <Text variant="mono" color={b.net > 0.004 ? t.green : b.net < -0.004 ? t.red : t.text3}>{b.net > 0.004 ? '+' : b.net < -0.004 ? '−' : ''}{fmt(Math.abs(b.net))}</Text>
          </View>
        ))}
        <Button small variant="ghost" title={`Share invite code ${g.inviteCode}`} style={{ alignSelf: 'flex-start' }}
          onPress={() => Share.share({ message: `Join “${g.name}” on Clario to split costs — invite code ${g.inviteCode}` })} />
      </Card>

      <Card style={{ gap: 4 }}>
        <Text variant="heading">Settle up</Text>
        {g.settleUp.length === 0 ? <Text variant="small">Everyone is even.</Text> : g.settleUp.map((s, i) => (
          <Row key={i} title={`${nameOf[s.from]} → ${nameOf[s.to]}`} subtitle={fmt(s.amount)}
            right={<Button small variant="default" title="Mark paid" loading={settle.isPending}
              onPress={() => confirm('Record payment?', `${nameOf[s.from]} paid ${nameOf[s.to]} ${fmt(s.amount)}.`, () => settle.mutate({ fromMemberId: s.from, toMemberId: s.to, amount: s.amount }), 'Record')} />} />
        ))}
      </Card>

      {!g.archived && (adding ? (
        <Card style={{ gap: 12 }}>
          <Field label="What for" value={e.description} onChangeText={(v) => setE({ ...e, description: v })} placeholder="e.g. Dinner" />
          <Field label={`Amount (${cur})`} keyboardType="decimal-pad" value={e.amount} onChangeText={(v) => setE({ ...e, amount: v })} />
          <Text variant="caption">Paid by</Text>
          <Segmented scroll value={paidBy} onChange={(v) => setE({ ...e, paidBy: v })} options={g.members.map((m) => [m.id, nameOf[m.id]])} />
          <Text variant="caption">Split equally between</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {g.members.map((m) => {
              const on = included.includes(m.id);
              return <Button key={m.id} small variant={on ? 'primary' : 'default'} title={nameOf[m.id]}
                onPress={() => setE({ ...e, included: on ? included.filter((x) => x !== m.id) : [...included, m.id] })} />;
            })}
          </View>
          {!!error && <Text variant="small" color={t.red}>{error}</Text>}
          <Button title="Add expense" loading={addExpense.isPending}
            onPress={() => addExpense.mutate({ description: e.description.trim(), amount: Number(e.amount), paidByMemberId: paidBy, splitMethod: 'equal', participants: included, addToMyExpenses: e.addToMine })} />
          <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} />
        </Card>
      ) : <Button title="Add a shared expense" onPress={() => setAdding(true)} />)}

      <Card style={{ gap: 2 }}>
        <Text variant="heading">Expenses</Text>
        {g.expenses.length === 0 ? <Empty title="Nothing yet" body="Add the first cost — who paid and who it was for." /> : g.expenses.map((x) => (
          <Row key={x.id}
            title={x.kind === 'settlement' ? `${nameOf[x.paidByMemberId]} paid ${nameOf[x.shares[0]?.memberId]}` : x.description}
            subtitle={`${nameOf[x.paidByMemberId]} paid ${fmt(x.amount)} · ${new Date(x.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
            onLongPress={() => confirm('Delete entry?', 'This changes everyone’s balance.', () => del.mutate(x.id))} />
        ))}
      </Card>
    </Screen>
  );
}
