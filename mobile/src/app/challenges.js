import React, { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { money } from '../lib/money';
import { confirm } from '../lib/confirm';
import { useTheme } from '../theme';
import { Screen, Card, Text, Button, Progress, Loading, ErrorNote } from '../components/ui';

export default function Challenges() {
  const t = useTheme();
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ['challenges'], queryFn: () => api.get('/challenges') });
  const cat = useQuery({ queryKey: ['challengeCatalogue'], queryFn: () => api.get('/challenges/catalogue') });
  const [error, setError] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['challenges'] });
  const join = useMutation({ mutationFn: (b) => api.post('/challenges/join', b), onSuccess: () => { refresh(); setError(''); }, onError: (e) => setError(e.message) });
  const end = useMutation({ mutationFn: (id) => api.post(`/challenges/${id}/abandon`), onSuccess: refresh });

  const active = (mine.data || []).filter((c) => c.status === 'active');
  const past = (mine.data || []).filter((c) => c.status !== 'active');
  const joined = new Set(active.map((c) => c.title));
  const isMoney = (k) => ['category_cap', 'total_cap', 'daily_cap'].includes(k);

  return (
    <Screen edges={[]} refreshing={mine.isRefetching} onRefresh={() => { mine.refetch(); cat.refetch(); }}>
      {mine.isLoading ? <Loading /> : mine.isError ? <ErrorNote error={mine.error} onRetry={mine.refetch} /> : active.map((c) => (
        <Card key={c.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="heading">{c.title}</Text>
            <Text variant="small">{c.daysLeft} days left</Text>
          </View>
          <Progress pct={c.progress?.pct || 0} color={c.progress?.onTrack === false ? t.red : t.brand} />
          <Text variant="small" color={c.progress?.onTrack === false ? t.red : undefined}>{c.progress?.detail}{c.progress?.onTrack === false ? ' · at risk' : ''}</Text>
          <Button small variant="ghost" title="End early" style={{ alignSelf: 'flex-start' }} onPress={() => confirm('End challenge?', c.title, () => end.mutate(c.id), 'End')} />
        </Card>
      ))}

      <Text variant="caption">Start a challenge</Text>
      {!!error && <Text variant="small" color={t.red}>{error}</Text>}
      {cat.isLoading ? <Loading /> : (cat.data || []).map((c, i) => {
        const target = c.suggestedTarget ?? c.target;
        const brand = i % 4 === 0;
        return (
          <Card key={c.key} brand={brand} style={{ gap: 8 }}>
            <Text variant="heading" color={brand ? '#fff' : undefined}>{c.title}</Text>
            <Text variant="small" color={brand ? 'rgba(255,255,255,0.8)' : undefined}>{c.description}</Text>
            {target ? <Text variant="small" color={brand ? '#fff' : t.text}>Target: {isMoney(c.kind) ? money(target) : c.kind === 'savings_rate' ? `${target}%` : `${target} days`} · {c.days} days</Text>
              : <Text variant="small" color={brand ? '#fff' : undefined}>Add a few weeks of spending so Clario can suggest a fair target.</Text>}
            <Button small variant={brand ? 'default' : 'primary'} style={{ alignSelf: 'flex-start', ...(brand && { borderColor: 'rgba(255,255,255,0.5)' }) }}
              title={joined.has(c.title) ? 'Joined' : 'Join'} disabled={joined.has(c.title) || !target}
              loading={join.isPending && join.variables?.key === c.key}
              onPress={() => join.mutate({ key: c.key, target, ...(c.category && { category: c.category }) })} />
          </Card>
        );
      })}

      {past.length > 0 && <Text variant="caption">History</Text>}
      {past.map((c) => (
        <Card key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="body">{c.title}</Text>
          <Text variant="small" color={c.status === 'completed' ? t.green : t.text3}>{c.status}</Text>
        </Card>
      ))}
    </Screen>
  );
}
