import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { money, currencyCode } from '../../lib/money';
import { useTheme } from '../../theme';
import { Screen, Card, Text, Button, Field, Loading, ErrorNote, Empty } from '../../components/ui';

export default function SplitGroups() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['splitGroups'], queryFn: () => api.get('/splits/groups') });
  const [mode, setMode] = useState(null);
  const [name, setName] = useState('');
  const [people, setPeople] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () => api.post('/splits/groups', {
      name: name.trim(), currency: currencyCode(),
      members: people.split(',').map((p) => p.trim()).filter(Boolean).map((p) => (p.includes('@') ? { name: p.split('@')[0], email: p } : { name: p })),
    }),
    onSuccess: (g) => { qc.invalidateQueries({ queryKey: ['splitGroups'] }); setMode(null); router.push(`/splits/${g.id}`); },
    onError: (e) => setError(e.message),
  });
  const join = useMutation({
    mutationFn: () => api.post('/splits/groups/join', { code: code.trim().toUpperCase() }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['splitGroups'] }); setMode(null); router.push(`/splits/${r.id}`); },
    onError: (e) => setError(e.message),
  });

  return (
    <Screen edges={[]} refreshing={q.isRefetching} onRefresh={q.refetch}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="New group" style={{ flex: 1 }} variant={mode === 'new' ? 'primary' : 'default'} onPress={() => { setMode(mode === 'new' ? null : 'new'); setError(''); }} />
        <Button title="Join with code" style={{ flex: 1 }} variant={mode === 'join' ? 'primary' : 'default'} onPress={() => { setMode(mode === 'join' ? null : 'join'); setError(''); }} />
      </View>
      {mode === 'new' && (
        <Card style={{ gap: 12 }}>
          <Field label="Group name" value={name} onChangeText={setName} placeholder="e.g. Goa trip, Flat 4B" />
          <Field label="Who’s in (comma-separated names or emails)" value={people} onChangeText={setPeople} placeholder="Ana, ben@example.com" autoCapitalize="none" />
          {!!error && <Text variant="small" color={t.red}>{error}</Text>}
          <Button title="Create group" loading={create.isPending} disabled={!name.trim()} onPress={() => create.mutate()} />
        </Card>
      )}
      {mode === 'join' && (
        <Card style={{ gap: 12 }}>
          <Field label="Invite code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={8} placeholder="K7Q2XPA" />
          {!!error && <Text variant="small" color={t.red}>{error}</Text>}
          <Button title="Join" loading={join.isPending} disabled={code.trim().length < 6} onPress={() => join.mutate()} />
        </Card>
      )}
      {q.isLoading ? <Loading /> : (q.isError && !q.data) ? <ErrorNote error={q.error} onRetry={q.refetch} /> : q.data.length === 0 ? (
        <Empty title="No shared groups yet" body="Create one for a trip or your flat. Friends don’t need the app to be included." />
      ) : q.data.map((g) => (
        <Card key={g.id} onPress={() => router.push(`/splits/${g.id}`)} style={{ gap: 4, opacity: g.archived ? 0.6 : 1 }}>
          <Text variant="heading">{g.name}</Text>
          <Text variant="small">{g.memberCount} people · {g.currency}</Text>
          <Text variant="body" color={Math.abs(g.myBalance) < 0.01 ? t.text3 : g.myBalance > 0 ? t.green : t.red}>
            {Math.abs(g.myBalance) < 0.01 ? 'All settled' : g.myBalance > 0 ? `You are owed ${money(g.myBalance, { code: g.currency, decimals: 2 })}` : `You owe ${money(-g.myBalance, { code: g.currency, decimals: 2 })}`}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
