/**
 * SplitsPage — shared expenses with friends, flatmates and trips.
 *
 *   /splits      groups list, create a group, join with an invite code
 *   /splits/:id  one group: balances, "who pays whom", expenses, add / settle
 *
 * Built from the same primitives as the rest of the app (PageHeader, n-card,
 * pg-form, n-btn, n-input) so it reads as part of the existing design.
 */
import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Receipt, Plus, X, UsersThree, ArrowRight, Copy, SignIn, Trash, CaretLeft, HandCoins, UserPlus, Archive,
} from '@phosphor-icons/react';
import PageHeader from '../components/ui/PageHeader';
import { ErrorState, OfflineState } from '../components/ui/States';
import {
  fetchGroups, fetchGroup, createGroup, joinGroup, addMember, addSplitExpense, deleteSplitExpense, settleUp, leaveGroup, updateGroup, removeMember,
} from '../api/splits';
import { CURRENCY_CODES, currencyCode, moneyIn } from '../lib/money';
import { t } from '../lib/i18n';
import { EXPENSE_CATEGORIES } from '../constants/categories';

const errMsg = (e, fallback) => e?.response?.data?.error || e?.message || fallback;

const Failed = ({ q }) => (navigator.onLine === false
  ? <OfflineState onRetry={() => q.refetch()} compact />
  : <ErrorState error={q.error} onRetry={() => q.refetch()} compact />);

const BalancePill = ({ amount, currency }) => {
  if (Math.abs(amount) < 0.01) return <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{t('All settled')}</span>;
  const owed = amount > 0;
  return (
    <span style={{ fontSize: '12px', fontWeight: 600, color: owed ? 'var(--green)' : 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>
      {owed ? t('You are owed') : t('You owe')} {moneyIn(amount, currency)}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Groups list
// ─────────────────────────────────────────────────────────────────────────────
const GroupsList = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['splitGroups'], queryFn: fetchGroups });
  const groups = useMemo(() => q.data || [], [q.data]);
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [form, setForm] = useState({ name: '', currency: currencyCode(), members: [{ name: '', email: '' }] });
  const [code, setCode] = useState('');

  const createMut = useMutation({
    mutationFn: createGroup,
    onSuccess: (g) => { qc.invalidateQueries({ queryKey: ['splitGroups'] }); toast.success('Group created'); navigate(`/splits/${g.id}`); },
    onError: (e) => toast.error(errMsg(e, 'Could not create the group')),
  });
  const joinMut = useMutation({
    mutationFn: joinGroup,
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['splitGroups'] }); toast.success(r.message); navigate(`/splits/${r.id}`); },
    onError: (e) => toast.error(errMsg(e, 'Could not join')),
  });

  const submitCreate = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Give the group a name'); return; }
    createMut.mutate({
      name: form.name.trim(), currency: form.currency,
      members: form.members.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), email: m.email.trim() })),
    });
  };
  const setMember = (i, patch) => setForm((f) => ({ ...f, members: f.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));

  const totals = useMemo(() => {
    const byCur = {};
    for (const g of groups) if (!g.archived) byCur[g.currency] = (byCur[g.currency] || 0) + g.myBalance;
    return Object.entries(byCur).filter(([, v]) => Math.abs(v) >= 0.01);
  }, [groups]);

  return (
    <div>
      {q.isError && <Failed q={q} />}
      <PageHeader
        icon={Receipt}
        title={t('Split expenses')}
        subtitle="Share costs with friends, flatmates and trips. They don't need the app to be included."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="n-btn n-btn-default n-btn-sm" onClick={() => setMode(mode === 'join' ? null : 'join')}><SignIn size={13} /> {t('Join a group')}</button>
            <motion.button whileHover={{ opacity: 0.85 }} whileTap={{ scale: 0.97 }} className="n-btn n-btn-primary n-btn-sm" onClick={() => setMode(mode === 'create' ? null : 'create')}>
              <Plus size={13} /> {t('New group')}
            </motion.button>
          </div>
        }
      />

      <AnimatePresence>
        {mode === 'join' && (
          <motion.div key="join" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
            <div className="pg-form">
              <form onSubmit={(e) => { e.preventDefault(); joinMut.mutate(code); }} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <label className="n-label">{t('Invite code')}</label>
                  <input className="n-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. K7Q2XPA" maxLength={8} autoFocus style={{ letterSpacing: '0.12em', fontFamily: 'var(--font-mono, monospace)' }} />
                </div>
                <button type="submit" className="n-btn n-btn-primary n-btn-sm" disabled={joinMut.isPending || code.length < 6}>{joinMut.isPending ? 'Joining…' : t('Join')}</button>
                <button type="button" className="n-btn n-btn-default n-btn-sm" onClick={() => setMode(null)}>{t('Cancel')}</button>
              </form>
            </div>
          </motion.div>
        )}
        {mode === 'create' && (
          <motion.div key="create" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
            <div className="pg-form">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{t('New group')}</span>
                <button onClick={() => setMode(null)} className="n-btn n-btn-ghost n-btn-sm" style={{ padding: '3px' }} aria-label="Close"><X size={14} /></button>
              </div>
              <form onSubmit={submitCreate}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label className="n-label">Group name</label>
                    <input className="n-input" placeholder="e.g. Goa trip, Flat 4B" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} />
                  </div>
                  <div>
                    <label className="n-label">{t('Currency')}</label>
                    <select className="n-input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                      {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <label className="n-label">People (you're added automatically)</label>
                {form.members.map((m, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', marginBottom: '8px' }}>
                    <input className="n-input" placeholder="Name" value={m.name} onChange={(e) => setMember(i, { name: e.target.value })} maxLength={60} />
                    <input className="n-input" type="email" placeholder="Email (optional — lets them claim their spot)" value={m.email} onChange={(e) => setMember(i, { email: e.target.value })} />
                    <button type="button" className="n-btn n-btn-ghost n-btn-sm" aria-label="Remove person" style={{ padding: '4px', color: 'var(--text-3)' }}
                      onClick={() => setForm((f) => ({ ...f, members: f.members.length > 1 ? f.members.filter((_, j) => j !== i) : [{ name: '', email: '' }] }))}><X size={13} /></button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button type="button" className="n-btn n-btn-default n-btn-sm" onClick={() => setForm((f) => ({ ...f, members: [...f.members, { name: '', email: '' }] }))}><UserPlus size={13} /> Add person</button>
                  <span style={{ flex: 1 }} />
                  <button type="submit" disabled={createMut.isPending} className="n-btn n-btn-primary n-btn-sm">{createMut.isPending ? 'Creating…' : t('Create')}</button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {totals.length > 0 && (
        <div className="n-card" style={{ padding: '16px 18px', marginBottom: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {totals.map(([cur, v]) => (
            <div key={cur}>
              <div style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: 2 }}>Across your groups · {cur}</div>
              <BalancePill amount={v} currency={cur} />
            </div>
          ))}
        </div>
      )}

      {q.isLoading ? (
        <div className="pg-cards">{[1, 2].map((i) => <div key={i} className="n-card" style={{ padding: '20px', height: '110px' }}><div className="n-skeleton" style={{ height: '100%' }} /></div>)}</div>
      ) : groups.length === 0 && !q.isError ? (
        <div className="n-empty">
          <div className="n-empty-icon"><UsersThree size={28} strokeWidth={1.2} /></div>
          <p style={{ fontWeight: 500, color: 'var(--text-2)', fontSize: '14px' }}>No shared groups yet</p>
          <p style={{ fontSize: '13px' }}>Create one for a trip or your flat, add who's in, and Clario keeps the running balance.</p>
          <button className="n-btn n-btn-default n-btn-sm" onClick={() => setMode('create')} style={{ marginTop: '10px' }}><Plus size={12} /> {t('New group')}</button>
        </div>
      ) : (
        <div className="pg-cards">
          {groups.map((g) => (
            <motion.div key={g.id} whileHover={{ borderColor: 'var(--border-strong)' }} className="n-card" style={{ padding: '18px', opacity: g.archived ? 0.6 : 1 }}>
              <Link to={`/splits/${g.id}`} style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', marginBottom: '2px' }}>{g.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>{g.memberCount} {g.memberCount === 1 ? 'person' : 'people'} · {g.currency}{g.archived ? ' · archived' : ''}</div>
                  </div>
                  <ArrowRight size={14} style={{ color: 'var(--text-3)' }} />
                </div>
                <BalancePill amount={g.myBalance} currency={g.currency} />
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// One group
// ─────────────────────────────────────────────────────────────────────────────
const METHODS = [['equal', 'Equally'], ['exact', 'Exact amounts'], ['percent', 'Percentages'], ['shares', 'Shares']];

const ExpenseForm = ({ group, onDone }) => {
  const qc = useQueryClient();
  const everyone = group.members.map((m) => m.id);
  const [f, setF] = useState({ description: '', amount: '', paidBy: group.me, method: 'equal', included: everyone, values: {}, category: 'Food', date: new Date().toISOString().slice(0, 10), addToMine: true });

  const mut = useMutation({
    mutationFn: addSplitExpense,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['splitGroup', group.id] }); qc.invalidateQueries({ queryKey: ['splitGroups'] }); qc.invalidateQueries({ queryKey: ['transactions'] }); toast.success('Expense added'); onDone(); },
    onError: (e) => toast.error(errMsg(e, 'Could not add the expense')),
  });

  const toggle = (id) => setF((s) => ({ ...s, included: s.included.includes(id) ? s.included.filter((x) => x !== id) : [...s.included, id] }));
  const sumValues = f.included.reduce((s, id) => s + (Number(f.values[id]) || 0), 0);
  const hint = f.method === 'exact' ? `${moneyIn(sumValues, group.currency)} of ${moneyIn(Number(f.amount) || 0, group.currency)}`
    : f.method === 'percent' ? `${sumValues}% of 100%` : null;

  const submit = (e) => {
    e.preventDefault();
    const amount = Number(f.amount);
    if (!f.description.trim() || !(amount > 0)) { toast.error('Add a description and an amount'); return; }
    if (!f.included.length) { toast.error('Choose who this is split between'); return; }
    mut.mutate({
      id: group.id, description: f.description.trim(), amount, paidByMemberId: f.paidBy, splitMethod: f.method,
      participants: f.method === 'equal' ? f.included : f.included.map((id) => ({ memberId: id, value: Number(f.values[id]) || 0 })),
      category: f.category, date: f.date, addToMyExpenses: f.addToMine,
    });
  };

  return (
    <div className="pg-form">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span style={{ fontWeight: 600, fontSize: '14px' }}>{t('Add expense')}</span>
        <button onClick={onDone} className="n-btn n-btn-ghost n-btn-sm" style={{ padding: '3px' }} aria-label="Close"><X size={14} /></button>
      </div>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '12px', marginBottom: '14px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="n-label">Description</label>
            <input className="n-input" placeholder="e.g. Dinner at Toit" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={120} required />
          </div>
          <div>
            <label className="n-label">Amount ({group.currency})</label>
            <input className="n-input" type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
          </div>
          <div>
            <label className="n-label">{t('Paid by')}</label>
            <select className="n-input" value={f.paidBy} onChange={(e) => setF({ ...f, paidBy: e.target.value })}>
              {group.members.map((m) => <option key={m.id} value={m.id}>{m.isMe ? `${m.name} (you)` : m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="n-label">Category</label>
            <select className="n-input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="n-label">Date</label>
            <input className="n-input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
        </div>

        <label className="n-label">Split</label>
        <div className="a11y-seg" style={{ marginBottom: '12px', display: 'inline-flex' }}>
          {METHODS.map(([v, l]) => <button key={v} type="button" aria-pressed={f.method === v} className={f.method === v ? 'is-on' : ''} onClick={() => setF({ ...f, method: v })}>{l}</button>)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {group.members.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="checkbox" id={`inc-${m.id}`} checked={f.included.includes(m.id)} onChange={() => toggle(m.id)} />
              <label htmlFor={`inc-${m.id}`} style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>{m.isMe ? `${m.name} (you)` : m.name}</label>
              {f.method !== 'equal' && f.included.includes(m.id) && (
                <input className="n-input" type="number" min="0" step="0.01" style={{ width: '120px' }}
                  placeholder={f.method === 'exact' ? group.currency : f.method === 'percent' ? '%' : 'shares'}
                  value={f.values[m.id] ?? ''} onChange={(e) => setF({ ...f, values: { ...f.values, [m.id]: e.target.value } })} />
              )}
            </div>
          ))}
          {hint && <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{hint}</span>}
        </div>
        <label className="a11y-row" style={{ marginBottom: '14px' }}>
          <div><b>Add my share to my expenses</b><span>So your budgets and reports include what this actually cost you.</span></div>
          <button type="button" role="switch" aria-checked={f.addToMine} className={`a11y-switch${f.addToMine ? ' is-on' : ''}`} onClick={() => setF({ ...f, addToMine: !f.addToMine })}><i /></button>
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="submit" disabled={mut.isPending} className="n-btn n-btn-primary n-btn-sm">{mut.isPending ? 'Adding…' : t('Add expense')}</button>
          <button type="button" onClick={onDone} className="n-btn n-btn-default n-btn-sm">{t('Cancel')}</button>
        </div>
      </form>
    </div>
  );
};

const GroupDetail = ({ id }) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['splitGroup', id], queryFn: () => fetchGroup(id) });
  const g = q.data;
  const [panel, setPanel] = useState(null); // 'expense' | 'member'
  const [member, setMember] = useState({ name: '', email: '' });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['splitGroup', id] }); qc.invalidateQueries({ queryKey: ['splitGroups'] }); };
  const settleMut = useMutation({ mutationFn: settleUp, onSuccess: () => { refresh(); toast.success('Payment recorded'); }, onError: (e) => toast.error(errMsg(e, 'Could not record the payment')) });
  const delMut = useMutation({ mutationFn: deleteSplitExpense, onSuccess: () => { refresh(); toast.success('Deleted'); }, onError: (e) => toast.error(errMsg(e, 'Could not delete')) });
  const memberMut = useMutation({ mutationFn: addMember, onSuccess: () => { refresh(); setMember({ name: '', email: '' }); setPanel(null); toast.success('Added'); }, onError: (e) => toast.error(errMsg(e, 'Could not add')) });
  const removeMut = useMutation({ mutationFn: removeMember, onSuccess: () => { refresh(); toast.success('Removed'); }, onError: (e) => toast.error(errMsg(e, 'Could not remove')) });
  const leaveMut = useMutation({ mutationFn: leaveGroup, onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['splitGroups'] }); toast.success(r.message); navigate('/splits'); }, onError: (e) => toast.error(errMsg(e, 'Could not leave')) });
  const archiveMut = useMutation({ mutationFn: updateGroup, onSuccess: () => { refresh(); toast.success('Group updated'); } });

  if (q.isLoading) return <div className="n-card" style={{ padding: '20px', height: '220px' }}><div className="n-skeleton" style={{ height: '100%' }} /></div>;
  if (q.isError) return <Failed q={q} />;

  const cur = g.currency;
  const nameOf = Object.fromEntries(g.members.map((m) => [m.id, m.isMe ? 'You' : m.name]));
  const myBal = g.balances.find((b) => b.memberId === g.me)?.net || 0;
  const copyCode = () => navigator.clipboard?.writeText(g.inviteCode).then(() => toast.success('Invite code copied'));

  return (
    <div>
      <PageHeader
        icon={Receipt}
        title={g.name}
        subtitle={`${g.members.length} people · ${cur} · ${moneyIn(g.totalSpent, cur)} spent together`}
        action={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Link to="/splits" className="n-btn n-btn-default n-btn-sm"><CaretLeft size={13} /> Groups</Link>
            <button className="n-btn n-btn-default n-btn-sm" onClick={() => setPanel(panel === 'member' ? null : 'member')}><UserPlus size={13} /> Person</button>
            {!g.archived && <motion.button whileHover={{ opacity: 0.85 }} whileTap={{ scale: 0.97 }} className="n-btn n-btn-primary n-btn-sm" onClick={() => setPanel(panel === 'expense' ? null : 'expense')}><Plus size={13} /> {t('Add expense')}</motion.button>}
          </div>
        }
      />

      <AnimatePresence>
        {panel === 'expense' && (
          <motion.div key="exp" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
            <ExpenseForm group={g} onDone={() => setPanel(null)} />
          </motion.div>
        )}
        {panel === 'member' && (
          <motion.div key="mem" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
            <div className="pg-form">
              <form onSubmit={(e) => { e.preventDefault(); memberMut.mutate({ id, name: member.name.trim(), email: member.email.trim() }); }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '8px', alignItems: 'end' }}>
                <div><label className="n-label">Name</label><input className="n-input" value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })} required maxLength={60} /></div>
                <div><label className="n-label">Email (optional)</label><input className="n-input" type="email" value={member.email} onChange={(e) => setMember({ ...member, email: e.target.value })} /></div>
                <button type="submit" className="n-btn n-btn-primary n-btn-sm" disabled={memberMut.isPending}>{t('Add')}</button>
                <button type="button" className="n-btn n-btn-default n-btn-sm" onClick={() => setPanel(null)}>{t('Cancel')}</button>
              </form>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '10px' }}>
                Or share the invite code <b style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.1em', color: 'var(--text)' }}>{g.inviteCode}</b> — anyone who signs up with Clario can join and claim their name.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        <div className="n-card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>{t('Balances')}</span>
            <BalancePill amount={myBal} currency={cur} />
          </div>
          {g.balances.map((b) => (
            <div key={b.memberId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>{nameOf[b.memberId]}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: b.net > 0.004 ? 'var(--green)' : b.net < -0.004 ? 'var(--red)' : 'var(--text-3)' }}>
                  {b.net > 0.004 ? '+' : b.net < -0.004 ? '−' : ''}{moneyIn(b.net, cur)}
                </span>
                {b.memberId !== g.me && Math.abs(b.net) < 0.01 && !g.members.find((m) => m.id === b.memberId)?.isUser && (
                  <button type="button" className="n-btn n-btn-ghost n-btn-sm" style={{ padding: '2px', color: 'var(--text-3)' }} aria-label={`Remove ${nameOf[b.memberId]}`}
                    onClick={() => { if (confirm(`Remove ${nameOf[b.memberId]} from the group?`)) removeMut.mutate({ id, memberId: b.memberId }); }}><X size={12} /></button>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="n-card" style={{ padding: '18px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{t('Settle up')}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '12px' }}>The fewest payments that make everyone even.</div>
          {g.settleUp.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>{t('All settled')} — nobody owes anything.</div>
          ) : g.settleUp.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px', flex: 1, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>{nameOf[s.from]} <ArrowRight size={11} style={{ color: 'var(--text-3)', flexShrink: 0 }} /> {nameOf[s.to]}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{moneyIn(s.amount, cur)}</span>
              <button type="button" className="n-btn n-btn-default n-btn-sm" disabled={settleMut.isPending}
                onClick={() => { if (confirm(`Record that ${nameOf[s.from]} paid ${nameOf[s.to]} ${moneyIn(s.amount, cur)}?`)) settleMut.mutate({ id, fromMemberId: s.from, toMemberId: s.to, amount: s.amount }); }}>
                <HandCoins size={12} /> Mark paid
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
            <button type="button" className="n-btn n-btn-ghost n-btn-sm" onClick={copyCode}><Copy size={12} /> {t('Invite code')}: {g.inviteCode}</button>
            <button type="button" className="n-btn n-btn-ghost n-btn-sm" onClick={() => archiveMut.mutate({ id, archived: !g.archived })}><Archive size={12} /> {g.archived ? 'Unarchive' : 'Archive'}</button>
            <button type="button" className="n-btn n-btn-danger-ghost n-btn-sm" onClick={() => { if (confirm('Leave this group? You must be settled up first.')) leaveMut.mutate(id); }}>Leave</button>
          </div>
        </div>
      </div>

      <div className="n-card" style={{ padding: '18px' }}>
        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '10px' }}>{t('Expenses')}</div>
        {g.expenses.length === 0 ? (
          <div className="n-empty" style={{ padding: '24px 0' }}>
            <p style={{ fontSize: '13px' }}>No expenses yet. Add the first one — who paid, and who it was for.</p>
          </div>
        ) : g.expenses.map((e) => {
          const myShare = e.shares.find((s) => s.memberId === g.me)?.amount || 0;
          const iPaid = e.paidByMemberId === g.me;
          const settlement = e.kind === 'settlement';
          return (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 40, fontSize: '11px', color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.2 }}>
                {new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {settlement ? <><HandCoins size={12} style={{ verticalAlign: '-1px' }} /> {nameOf[e.paidByMemberId]} paid {nameOf[e.shares[0]?.memberId]}</> : e.description}
                </div>
                {!settlement && <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{nameOf[e.paidByMemberId]} paid {moneyIn(e.amount, cur)} · {e.category}</div>}
              </div>
              {!settlement && (
                <div style={{ textAlign: 'right', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
                  {iPaid
                    ? <span style={{ color: 'var(--green)' }}>you lent {moneyIn(e.amount - myShare, cur)}</span>
                    : myShare > 0 ? <span style={{ color: 'var(--red)' }}>you owe {moneyIn(myShare, cur)}</span>
                    : <span style={{ color: 'var(--text-3)' }}>not involved</span>}
                </div>
              )}
              {settlement && <div style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>{moneyIn(e.amount, cur)}</div>}
              <button type="button" className="n-btn n-btn-ghost n-btn-sm" style={{ padding: '4px', color: 'var(--text-3)' }} aria-label="Delete"
                onClick={() => { if (confirm('Delete this entry?')) delMut.mutate({ id, expenseId: e.id }); }}><Trash size={13} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SplitsPage = () => {
  const { id } = useParams();
  return id ? <GroupDetail id={id} /> : <GroupsList />;
};

export default SplitsPage;
