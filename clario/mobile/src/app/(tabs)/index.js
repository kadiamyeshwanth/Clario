/**
 * Home — the month on one screen: balance tile (brand fill), income/spend,
 * health score, top categories, budgets, upcoming bills, recent activity.
 * One API call (/meta/overview) instead of downloading every transaction.
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, Bell, ArrowUpRight, ArrowDownLeft } from 'phosphor-react-native';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { money } from '../../lib/money';
import { useTheme } from '../../theme';
import { Screen, Card, Text, Money, Progress, Row, Loading, ErrorNote, Empty, Button } from '../../components/ui';

export default function Home() {
  const t = useTheme();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api.get('/meta/overview') });
  const unread = useQuery({ queryKey: ['notifications'], queryFn: () => api.get('/notifications'), refetchInterval: 60000 });
  const o = q.data;

  const delta = o && o.totals.prevExpenses > 0 ? Math.round(((o.totals.expenses - o.totals.prevExpenses) / o.totals.prevExpenses) * 100) : null;
  const monthName = o ? new Date(`${o.month}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long' }) : '';

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => { q.refetch(); unread.refetch(); }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text variant="small">Welcome back</Text>
          <Text variant="title">{user?.displayName || user?.username}</Text>
        </View>
        <Pressable accessibilityLabel="Notifications" onPress={() => router.push('/notifications')}
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' }}>
          <Bell size={20} color={t.text} weight="fill" />
          {unread.data?.unreadCount > 0 && <View style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: t.brand }} />}
        </Pressable>
      </View>

      {q.isLoading ? <Loading /> : q.isError ? <ErrorNote error={q.error} onRetry={q.refetch} /> : (
        <>
          <Card brand style={{ gap: 6 }}>
            <Text variant="caption" color="rgba(255,255,255,0.75)">Total balance · across accounts</Text>
            <Text variant="figure" color="#FFFFFF" style={{ fontSize: 34 }}>{money(o.netWorth, { sign: true })}</Text>
            <Text variant="small" color="rgba(255,255,255,0.8)">
              {o.totals.savingsRate === null
                ? `No income recorded in ${monthName} yet`
                : o.totals.savingsRate < 0
                  // A % of a tiny income reads as nonsense ("-50904%"); say it in money.
                  ? `${money(o.totals.expenses - o.totals.income)} more went out than came in this ${monthName}`
                  : `Saving ${o.totals.savingsRate}% of income in ${monthName}`}
            </Text>
          </Card>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><ArrowDownLeft size={14} color={t.green} weight="bold" /><Text variant="caption">In</Text></View>
              <Text variant="mono" style={{ fontSize: 20 }}>{money(o.totals.income)}</Text>
            </Card>
            <Card style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><ArrowUpRight size={14} color={t.red} weight="bold" /><Text variant="caption">Out</Text></View>
              <Text variant="mono" style={{ fontSize: 20 }}>{money(o.totals.expenses)}</Text>
              {delta !== null && <Text variant="small" color={delta > 0 ? t.red : t.green}>{delta > 0 ? '+' : ''}{delta}% vs last month</Text>}
            </Card>
          </View>

          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 58, height: 58, borderRadius: 29, borderWidth: 5, borderColor: o.healthScore >= 70 ? t.green : o.healthScore >= 40 ? t.brand : t.red, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="mono" style={{ fontSize: 17 }}>{o.healthScore}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="heading">Financial health</Text>
              <Text variant="small">Savings rate, budget discipline and your cash buffer, scored out of 100.</Text>
            </View>
          </Card>

          <Button title="Add a transaction" icon={<Plus size={18} color="#fff" weight="bold" />} onPress={() => router.push('/transaction')} />

          <Card style={{ gap: 10 }}>
            <Text variant="heading">Where it went in {monthName}</Text>
            {o.categories.length === 0 ? <Text variant="small">Nothing spent yet this month.</Text> : o.categories.slice(0, 5).map((c) => (
              <View key={c.name} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="body">{c.name}</Text>
                  <Text variant="mono">{money(c.amount)} <Text variant="small">· {Math.round(c.pct)}%</Text></Text>
                </View>
                <Progress pct={c.pct} />
              </View>
            ))}
          </Card>

          {o.budgets?.items?.length > 0 && (
            <Card style={{ gap: 10 }} onPress={() => router.push('/plan')}>
              <Text variant="heading">Budgets this month</Text>
              {o.budgets.items.slice(0, 4).map((b) => (
                <View key={b.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="body">{b.category}</Text>
                    <Text variant="small" color={b.state === 'over' ? t.red : undefined}>{money(b.spent)} / {money(b.limit)}</Text>
                  </View>
                  <Progress pct={b.pct} color={b.state === 'over' ? t.red : b.state === 'warning' ? t.brand : t.green} />
                </View>
              ))}
            </Card>
          )}

          {o.subscriptions.upcoming.length > 0 && (
            <Card style={{ gap: 4 }} onPress={() => router.push('/subscriptions')}>
              <Text variant="heading">Renewing this week</Text>
              {o.subscriptions.upcoming.map((s) => (
                <Row key={s.id} title={s.name} subtitle={new Date(s.renewalDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} right={<Text variant="mono">{money(s.amount)}</Text>} />
              ))}
            </Card>
          )}

          <Card style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text variant="heading">Recent</Text>
              <Pressable onPress={() => router.push('/activity')}><Text variant="small" color={t.brand}>See all</Text></Pressable>
            </View>
            {o.recent.length === 0 ? (
              <Empty title="No transactions yet" body="Add your first one — or forward a bank SMS with the Android forwarder." />
            ) : o.recent.map((tx) => (
              <Row key={tx.id} title={tx.merchant || tx.description || tx.category}
                subtitle={`${tx.category} · ${new Date(tx.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                right={<Money value={tx.amount} type={tx.type} />}
                onPress={() => router.push({ pathname: '/transaction', params: { id: tx.id } })} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
