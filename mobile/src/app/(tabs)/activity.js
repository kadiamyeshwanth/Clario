/**
 * Activity — searchable, filterable, paginated transactions (infinite scroll).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Plus, CloudArrowUp } from 'phosphor-react-native';
import { api } from '../../lib/api';
import { pending, flushOutbox } from '../../lib/outbox';
import { money } from '../../lib/money';
import { useTheme } from '../../theme';
import { Text, Field, Segmented, Row, Money, Loading, ErrorNote, Empty, Header } from '../../components/ui';

const PAGE = 30;

export default function Activity() {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('all');
  useEffect(() => { const id = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(id); }, [search]);

  const q = useInfiniteQuery({
    queryKey: ['transactions', 'list', debounced, type],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get(`/transactions?page=${pageParam}&limit=${PAGE}&recurring=false&type=${type}${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const outbox = useQuery({ queryKey: ['outbox'], queryFn: pending, refetchInterval: 15000 });
  const rows = useMemo(() => (q.data?.pages || []).flatMap((p) => p.data), [q.data]);
  const total = q.data?.pages?.[0]?.total ?? 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Header title="Transactions" subtitle={`${total} recorded`}
          right={<Pressable accessibilityLabel="Add transaction" onPress={() => router.push('/transaction')}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}><Plus size={20} color="#fff" weight="bold" /></Pressable>} />
        <Field placeholder="Search merchant, description, category…" value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" />
        <Segmented value={type} onChange={setType} options={[['all', 'All'], ['expense', 'Spending'], ['income', 'Income']]} />
        {outbox.data?.length > 0 && (
          <Pressable onPress={async () => { await flushOutbox(); outbox.refetch(); q.refetch(); }}
            style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: t.brandBg, padding: 10, borderRadius: t.radius.md }}>
            <CloudArrowUp size={18} color={t.brand} />
            <Text variant="small" color={t.brand}>{outbox.data.length} saved offline — tap to sync now</Text>
          </Pressable>
        )}
      </View>
      {q.isLoading ? <Loading /> : q.isError ? <View style={{ padding: 16 }}><ErrorNote error={q.error} onRetry={q.refetch} /></View> : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x._id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={t.brand} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListEmptyComponent={<Empty title={debounced ? 'No matches' : 'Nothing here yet'} body={debounced ? 'Try a different word.' : 'Add your first transaction with the + button.'} />}
          ListFooterComponent={q.isFetchingNextPage ? <Loading /> : null}
          renderItem={({ item: tx }) => (
            <Row
              title={tx.merchant || tx.description || tx.category}
              subtitle={`${tx.category} · ${new Date(tx.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}${tx.source === 'sms_webhook' ? ' · SMS' : ''}`}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Money value={tx.amount} type={tx.type} />
                  {!!tx.originalCurrency && <Text variant="small">{money(tx.originalAmount, { code: tx.originalCurrency })}</Text>}
                </View>
              }
              onPress={() => router.push({ pathname: '/transaction', params: { id: tx._id } })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
