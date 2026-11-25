/**
 * SpendingChallengesPage — Gamified spending challenges
 * Users can join challenges like "7-day no-spend", "save ₹5000 this month",
 * "coffee detox", etc. Progress is tracked in real-time against transactions.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchChallenges, joinChallenge, abandonChallenge, removeChallenge } from '../api/challenges';
import { t } from '../lib/i18n';
import { motion } from 'framer-motion';
import {
  Trophy,
  Flame,
  Target,
  Lightning as Zap,
  Coffee,
  ShoppingBag,
  Wallet,
  Star,
  CheckCircle as CheckCircle2,
  TrendDown as TrendingDown,
  ChartBar as BarChart3,
} from '@phosphor-icons/react';
import { fetchTransactions } from '../api/transactions';
import { fetchBudgets }      from '../api/budgets';
import PageHeader from '../components/ui/PageHeader';
import toast from 'react-hot-toast';
import { cs, nl } from '@/lib/money';

// ── Challenge definitions ─────────────────────────────────────────────────────
// Each card shows this month's progress computed from your transactions. Cards
// with a `server` spec can be joined as a commitment: the server tracks it over
// its own window, sends a result notification and keeps the history.
const buildChallenges = (txns, budgets) => {
  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart  = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());

  const thisMonthTxns = txns.filter(t => new Date(t.date) >= monthStart && !t.isRecurring);

  const totalMonthExpense = thisMonthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalMonthIncome  = thisMonthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth   = now.getDate();
  const daysPassed   = dayOfMonth;

  const spendDays = new Set(
    thisMonthTxns.filter(t => t.type === 'expense').map(t => new Date(t.date).getDate())
  );
  const noSpendDays = daysPassed - spendDays.size;

  const coffeeSpend  = thisMonthTxns.filter(t => ['Coffee', 'Food', 'Dining'].includes(t.category) && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const onlineSpend  = thisMonthTxns.filter(t => ['Shopping', 'Online Shopping'].includes(t.category) && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const entertainSpend = thisMonthTxns.filter(t => t.category === 'Entertainment' && t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const savingsAmount  = totalMonthIncome - totalMonthExpense;
  const savingsTarget  = totalMonthIncome * 0.20;

  const dailyAvg = daysPassed > 0 ? totalMonthExpense / daysPassed : 0;
  const projectedMonthTotal = dailyAvg * daysInMonth;

  // Caps are personal: 80% of what you usually spend in a month on that
  // category (last 3 full months), so they mean the same thing in any currency
  // and at any income. The original fixed amounts are only a first-month fallback.
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const history = txns.filter(t => !t.isRecurring && t.type === 'expense' && new Date(t.date) >= threeMonthsAgo && new Date(t.date) < monthStart);
  const monthlyAvg = (cats) => history.filter(t => cats.includes(t.category)).reduce((s, t) => s + t.amount, 0) / 3;
  const niceCap = (avg, fallback) => {
    if (!(avg > 0)) return fallback;
    const v = avg * 0.8;
    const step = Math.pow(10, Math.max(1, Math.floor(Math.log10(v)) - 1));
    return Math.max(step, Math.round(v / step) * step);
  };
  const foodCap = niceCap(monthlyAvg(['Coffee', 'Food', 'Dining']), 1500);
  const shopCap = niceCap(monthlyAvg(['Shopping', 'Online Shopping']), 500);
  const funCap  = niceCap(monthlyAvg(['Entertainment']), 1000);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthTotal = txns.filter(t => !t.isRecurring && t.type === 'expense' && new Date(t.date) >= lastMonthStart && new Date(t.date) < monthStart).reduce((s, t) => s + t.amount, 0);
  const fmt0 = (n) => `${cs()}${Math.round(n).toLocaleString(nl())}`;

  return [
    {
      id: 'no_spend_week',
      icon: Flame,
      color: 'var(--red)',
      title: '7-Day No-Spend Challenge',
      description: 'Go 7 consecutive days without any discretionary spending.',
      category: 'Discipline',
      difficulty: 'Medium',
      reward: 'Streak Master badge',
      current: noSpendDays,
      target: 7,
      unit: 'no-spend days this month',
      completed: noSpendDays >= 7,
      server: { key: 'no_spend_month', target: 7, days: 30 },
      tip: 'Meal prep on weekends to avoid food delivery temptation.',
    },
    {
      id: 'save_20_pct',
      icon: Target,
      color: 'var(--brand)',
      title: 'Save 20% of Income',
      description: `Save at least 20% of your income (${cs()}${savingsTarget.toLocaleString(nl(), { maximumFractionDigits: 0 })}) this month.`,
      category: 'Savings',
      difficulty: 'Hard',
      reward: 'Silent Saver badge',
      current: Math.max(0, savingsAmount),
      target: Math.max(savingsTarget, 1),
      unit: 'saved this month',
      completed: savingsAmount >= savingsTarget && totalMonthIncome > 0,
      server: { key: 'save_20', target: 20, days: 30 },
      tip: 'Set up automatic transfers to savings on payday.',
    },
    {
      id: 'coffee_budget',
      icon: Coffee,
      color: '#c2a35a',
      title: 'Coffee & Food Detox',
      description: `Keep food & coffee spending under ${fmt0(foodCap)} this month.`,
      category: 'Food',
      difficulty: 'Easy',
      reward: 'Mindful Eater badge',
      current: coffeeSpend,
      target: foodCap,
      unit: 'spent on food & coffee',
      lowerIsBetter: true,
      completed: coffeeSpend <= foodCap,
      server: { key: 'food_cap', category: 'Food', target: foodCap, days: 30 },
      tip: 'Cook at home 5 days a week to easily hit this target.',
    },
    {
      id: 'no_impulse_week',
      icon: ShoppingBag,
      color: '#FF9A3D',
      title: 'Zero Impulse Buys',
      description: `Keep shopping under ${fmt0(shopCap)} this month.`,
      category: 'Shopping',
      difficulty: 'Medium',
      reward: 'Budget Ninja badge',
      current: onlineSpend,
      target: shopCap,
      unit: 'spent on shopping this month',
      lowerIsBetter: true,
      completed: onlineSpend <= shopCap,
      server: { key: 'shopping_cap', category: 'Shopping', target: shopCap, days: 30 },
      tip: 'Use the 24-hour rule: wait a day before any online purchase.',
    },
    {
      id: 'entertainment_cap',
      icon: Zap,
      color: 'var(--red)',
      title: 'Entertainment Cap',
      description: `Keep entertainment spending under ${fmt0(funCap)} this month.`,
      category: 'Entertainment',
      difficulty: 'Easy',
      reward: 'Focus Mode badge',
      current: entertainSpend,
      target: funCap,
      unit: 'spent on entertainment',
      lowerIsBetter: true,
      completed: entertainSpend <= funCap,
      server: { key: 'shopping_cap', category: 'Entertainment', target: funCap, days: 30 },
      tip: 'Use free streaming trials and free events in your city.',
    },
    {
      id: 'track_every_day',
      icon: BarChart3,
      color: 'var(--brand)',
      title: 'Daily Tracker',
      description: 'Log at least one transaction every day for 30 days.',
      category: 'Habit',
      difficulty: 'Easy',
      reward: 'Data Master badge',
      current: spendDays.size + noSpendDays,
      target: 30,
      unit: 'days with activity logged',
      completed: (spendDays.size + noSpendDays) >= 30,
      tip: 'Set a daily reminder at 9 PM to review and log your spending.',
    },
    {
      id: 'reduce_expenses',
      icon: TrendingDown,
      color: 'var(--green)',
      title: 'Expense Reduction',
      description: lastMonthTotal > 0 ? `Spend at least 10% less than last month (${fmt0(lastMonthTotal)}).` : 'Spend less this month than last month.',
      category: 'Savings',
      difficulty: 'Hard',
      reward: 'Downtrend badge',
      current: totalMonthExpense,
      target: Math.max(lastMonthTotal > 0 ? lastMonthTotal * 0.9 : projectedMonthTotal * 0.9, 1),
      unit: 'spent this month',
      lowerIsBetter: true,
      completed: lastMonthTotal > 0 ? totalMonthExpense < lastMonthTotal * 0.9 : false,
      server: lastMonthTotal > 0 ? { key: 'total_cap', target: Math.round(lastMonthTotal * 0.9), days: 30 } : null,
      tip: "Review last month's statement and pick one category to cut.",
    },
    {
      id: 'budget_adherence',
      icon: Wallet,
      color: '#fb923c',
      title: 'Budget Perfectionist',
      description: 'Stay under budget in ALL categories this month.',
      category: 'Budgets',
      difficulty: 'Hard',
      reward: 'Budget King badge',
      current: budgets.filter(b => {
        const spent = thisMonthTxns.filter(t => t.category === b.category && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        return spent <= b.limit;
      }).length,
      target: Math.max(budgets.length, 1),
      unit: 'budgets on track',
      completed: budgets.length > 0 && budgets.every(b => {
        const spent = thisMonthTxns.filter(t => t.category === b.category && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        return spent <= b.limit;
      }),
      tip: 'Check your budget status every Monday morning.',
    },
  ];
};

// ── Solid card fills (no gradients) — cycled across the grid ──────────────────
const FILLS = [
  { bg: '#E85002', fg: '#FFFFFF', dim: 'rgba(255,255,255,0.68)', track: 'rgba(255,255,255,0.22)' },
  { bg: '#161514', fg: '#FFFFFF', dim: 'rgba(255,255,255,0.60)', track: 'rgba(255,255,255,0.16)' },
  { bg: '#2C2A28', fg: '#FFFFFF', dim: 'rgba(255,255,255,0.60)', track: 'rgba(255,255,255,0.16)' },
  { bg: '#EEE9E1', fg: '#161514', dim: 'rgba(22,21,20,0.55)',   track: 'rgba(22,21,20,0.14)' },
];

// ── Challenge Card — minimal, solid fill, flat progress ──────────────────────
const ChallengeCard = ({ ch, joined, onJoin, fill }) => {
  const displayPct = ch.lowerIsBetter
    ? Math.max(0, Math.min(100, 100 - (ch.current / ch.target) * 100))
    : Math.min(100, (ch.current / ch.target) * 100);
  const CIcon = ch.icon;
  const f = fill;

  const amount = ch.lowerIsBetter
    ? `${cs()}${ch.current.toLocaleString(nl(), { maximumFractionDigits: 0 })} / ${cs()}${ch.target.toLocaleString(nl(), { maximumFractionDigits: 0 })}`
    : (typeof ch.current === 'number' && ch.current < 100)
      ? `${ch.current} / ${ch.target} ${ch.unit}`
      : `${cs()}${ch.current.toLocaleString(nl(), { maximumFractionDigits: 0 })} / ${cs()}${ch.target.toLocaleString(nl(), { maximumFractionDigits: 0 })}`;

  return (
    <div style={{
      background: f.bg, color: f.fg, borderRadius: 'var(--r-lg)',
      padding: '18px 20px', height: '100%',
      display: 'flex', flexDirection: 'column', gap: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <CIcon size={18} weight="fill" style={{ color: f.fg, flexShrink: 0 }} />
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: f.dim }}>{ch.difficulty}</span>
        <span style={{ flex: 1 }} />
        {ch.completed && <CheckCircle2 size={17} weight="fill" style={{ color: f.fg }} />}
      </div>

      <div>
        <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', marginBottom: '4px' }}>{ch.title}</div>
        <div style={{ fontSize: '12.5px', lineHeight: 1.5, color: f.dim }}>{ch.description}</div>
      </div>

      <div style={{ marginTop: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', color: f.dim }}>{amount}</span>
          <span style={{ fontSize: '13px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{displayPct.toFixed(0)}%</span>
        </div>
        <div style={{ height: '4px', background: f.track, overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${displayPct}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{ height: '100%', background: f.fg }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '14px' }}>
          <span style={{ fontSize: '11px', color: f.dim, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.reward}</span>
          {ch.completed ? (
            <span style={{ fontSize: '12px', fontWeight: 700, color: f.fg, flexShrink: 0 }}>Completed</span>
          ) : !ch.server ? (
            <span style={{ fontSize: '11px', fontWeight: 600, color: f.dim, flexShrink: 0 }}>Auto-tracked</span>
          ) : (
            <button
              onClick={() => onJoin(ch.id)}
              style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '6px 13px', borderRadius: '999px', border: `1px solid ${f.track}`,
                background: joined ? f.track : 'transparent', color: f.fg,
                fontSize: '12px', fontWeight: 700, cursor: joined ? 'default' : 'pointer',
              }}
            >
              {joined ? <><CheckCircle2 size={12} weight="fill" /> Joined</> : 'Join'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const SpendingChallengesPage = () => {
  const [filter, setFilter] = useState('all');
  const qc = useQueryClient();
  const { data: commitments = [] } = useQuery({ queryKey: ['challenges'], queryFn: fetchChallenges });
  const active = commitments.filter(c => c.status === 'active');
  const finished = commitments.filter(c => c.status !== 'active').slice(0, 6);
  const joinedTitles = new Set(active.map(c => c.title));

  const joinMut = useMutation({
    mutationFn: joinChallenge,
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['challenges'] }); toast.success(`Challenge accepted — ${c.daysLeft} days to go`); },
    onError: (e) => toast.error(e.response?.data?.error || 'Could not join the challenge'),
  });
  const abandonMut = useMutation({
    mutationFn: abandonChallenge,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['challenges'] }); toast.success('Challenge ended'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Could not end the challenge'),
  });
  const removeMut = useMutation({ mutationFn: removeChallenge, onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges'] }) });

  const { data: allTxns = [], isLoading } = useQuery({ queryKey: ['transactions'], queryFn: fetchTransactions });
  const { data: budgets = [] }            = useQuery({ queryKey: ['budgets'],      queryFn: fetchBudgets });

  const challenges = useMemo(() => buildChallenges(allTxns, budgets), [allTxns, budgets]);

  const handleJoin = (id) => {
    const ch = challenges.find(c => c.id === id);
    if (!ch?.server || joinedTitles.has(ch.title)) return;
    joinMut.mutate({ ...ch.server, title: ch.title });
  };

  const completed = challenges.filter(c => c.completed).length;
  const total     = challenges.length;
  const pct       = total ? (completed / total) * 100 : 0;
  const categories = ['all', ...new Set(challenges.map(c => c.category))];
  const filtered = filter === 'all' ? challenges : challenges.filter(c => c.category === filter);

  return (
    <div>
      <PageHeader
        icon={Trophy}
        title="Spending Challenges"
        subtitle={`${completed} of ${total} challenges completed this month`}
      />

      {/* Score card — quiet surface, orange only in the accents */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px',
        background: 'var(--border)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: '20px',
      }}>
        {[
          { label: 'Completed', node: <><span style={{ color: 'var(--text)' }}>{completed}</span><span style={{ color: 'var(--text-3)', fontWeight: 600 }}> / {total}</span></> },
          { label: 'Score', node: <><span style={{ color: 'var(--brand)' }}>{completed * 125}</span><span style={{ color: 'var(--text-3)', fontSize: '14px', fontWeight: 600 }}> XP</span></> },
          { label: 'Joined', node: <span style={{ color: 'var(--text)' }}>{active.length}</span> },
        ].map(({ label, node }) => (
          <div key={label} style={{ background: 'var(--bg)', padding: '16px 18px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: '6px' }}>{label}</div>
            <div style={{ fontSize: '24px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{node}</div>
          </div>
        ))}
      </div>

      {/* Progress toward Finance Master */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: '24px', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '12px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text)' }}>
            <Star size={13} weight="fill" style={{ color: 'var(--brand)' }} /> Progress to Finance Master
          </span>
          <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{pct.toFixed(0)}%</span>
        </div>
        <div style={{ height: '8px', borderRadius: '999px', background: 'var(--border-strong)', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ height: '100%', borderRadius: '999px', background: 'var(--brand)' }}
          />
        </div>
      </div>

      {/* Joined challenges — tracked on the server over their own window */}
      {active.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: '20px', background: 'var(--bg)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '10px' }}>{t('Active challenges')}</div>
          {active.map(c => {
            const p = c.progress || {};
            const pct = Math.max(0, Math.min(100, p.pct || 0));
            const atRisk = p.onTrack === false;
            return (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 14px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{c.title}</div>
                  <div style={{ fontSize: '12px', color: atRisk ? 'var(--red)' : 'var(--text-3)' }}>{p.detail} · {c.daysLeft} day{c.daysLeft === 1 ? '' : 's'} left{atRisk ? ' · at risk' : ''}</div>
                </div>
                <button type="button" className="n-btn n-btn-ghost n-btn-sm" style={{ color: 'var(--text-3)' }}
                  onClick={() => { if (confirm(`End "${c.title}" early?`)) abandonMut.mutate(c.id); }}>End</button>
                <div style={{ gridColumn: '1 / -1', height: '4px', background: 'var(--border-strong)', borderRadius: '999px', overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: 'easeOut' }}
                    style={{ height: '100%', background: atRisk ? 'var(--red)' : 'var(--brand)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {finished.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {finished.map(c => (
            <span key={c.id} className="n-btn n-btn-sm n-btn-default" style={{ cursor: 'default', gap: 6 }}>
              {c.status === 'completed' ? <CheckCircle2 size={12} weight="fill" style={{ color: 'var(--green)' }} /> : null}
              {c.title} · {c.status}
              <button type="button" aria-label="Remove from history" onClick={() => removeMut.mutate(c.id)} style={{ background: 'none', border: 0, color: 'var(--text-3)', cursor: 'pointer', padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Category filters */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`n-btn n-btn-sm ${filter === cat ? 'n-btn-primary' : 'n-btn-default'}`}
          >
            {cat === 'all' ? 'All challenges' : cat}
          </button>
        ))}
      </div>

      {/* Challenge grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="n-skeleton" style={{ height: '210px', borderRadius: 'var(--r-lg)' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px', alignItems: 'stretch' }}>
          {filtered.map((ch, i) => (
            <motion.div key={ch.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <ChallengeCard ch={ch} joined={joinedTitles.has(ch.title)} onJoin={handleJoin} fill={FILLS[i % FILLS.length]} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Info callout */}
      <div style={{ marginTop: '28px', padding: '14px 16px', background: 'var(--brand-bg)', borderRadius: 'var(--r-md)', border: '1px solid var(--green-border)', fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--brand)' }}>How challenges work:</strong> Progress is calculated automatically from your transaction history.
        Cards reset at the start of each month. Join one to commit to it: Clario tracks it over its own window, warns you if you're at risk, and records the result.
      </div>
    </div>
  );
};

export default SpendingChallengesPage;
