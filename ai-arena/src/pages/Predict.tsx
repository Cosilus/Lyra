import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CompetitionView, PredictionsData } from '../../shared/api.ts';
import type { AppConfig } from '../../shared/types.ts';
import { Avatar, Badge, Button, Empty, ErrorBox, Notice, PageHeader, Spinner, Stat } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { api, useApi } from '../lib/api.ts';
import { fmt, timeAgo } from '../lib/format.ts';

function RoundPredictor({ c, data, minStake, onDone }: { c: CompetitionView; data: PredictionsData; minStake: number; onDone: () => void }) {
  const toast = useToast();
  const round = c.currentRound!;
  const existing = data.predictions.find((p) => p.roundId === round.id);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [stake, setStake] = useState('50');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const n = round.entrants.length;

  const place = async () => {
    setErr(null);
    const value = Number(stake);
    if (!agentId) return setErr('Choose the agent you think will win.');
    if (!Number.isInteger(value) || value <= 0) return setErr('Enter a positive whole number of points.');
    if (value < minStake) return setErr(`Minimum stake is ${minStake} points.`);
    if (value > data.user.points) return setErr(`You only have ${fmt(data.user.points)} points.`);
    setBusy(true);
    try { await api('POST', '/api/predictions', { roundId: round.id, agentId, stake: value }); toast('Prediction placed.'); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <section className="card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-lg font-semibold">{c.info.name}</h3><p className="text-xs text-muted">Round {round.number} · {n} participants · pays x{n} on a win</p></div><Badge tone="accent">Open</Badge></div>
      {existing ? (
        <div className="mt-5 rounded-lg border border-line bg-bg p-4 text-sm">
          You staked <b>{existing.stake}</b> points on <b>{existing.agentName}</b> (x{existing.multiplier}). Run the round from the <Link to={`/arena/${c.info.id}`} className="text-accent">competition page</Link> to settle it.
        </div>
      ) : (
        <>
          <div className="label mb-2 mt-5">Who wins?</div>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
            {round.entrants.map((e) => (
              <button key={e.agentId} role="radio" aria-checked={agentId === e.agentId} onClick={() => setAgentId(e.agentId)} className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${agentId === e.agentId ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/40'}`}>
                <Avatar avatar={e.avatar} size={34} />
                <div className="min-w-0"><div className="truncate text-sm font-medium">{e.name}</div><div className="text-xs text-muted">{e.kind === 'house' ? `Simulated skill ${Math.round((e.skill ?? 0) * 100)}%` : `Yours · ${e.engine === 'live' ? 'live model' : 'simulated'}`}</div></div>
              </button>))}
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div className="w-40"><label className="label" htmlFor={`stake-${round.id}`}>Stake (points)</label><input id={`stake-${round.id}`} inputMode="numeric" className="input mt-2" value={stake} onChange={(e) => setStake(e.target.value)} /></div>
            <div className="flex gap-1.5">{[0.1, 0.25, 0.5, 1].map((f) => <Button key={f} small onClick={() => setStake(String(Math.max(0, Math.floor(data.user.points * f))))}>{f === 1 ? 'Max' : `${f * 100}%`}</Button>)}</div>
            <Button variant="primary" loading={busy} onClick={place}>Place prediction</Button>
          </div>
          {err && <p className="mt-3 text-sm text-bad" role="alert">{err}</p>}
          <p className="mt-3 text-xs text-muted">Win: stake × {n} returned. Loss: stake lost. Tie for first: stake refunded.</p>
        </>
      )}
    </section>
  );
}

export default function Predict() {
  const comps = useApi<CompetitionView[]>('/api/competitions');
  const pred = useApi<PredictionsData>('/api/predictions');
  const cfg = useApi<AppConfig>('/api/config');
  if ((comps.loading && !comps.data) || (pred.loading && !pred.data)) return <Spinner />;
  if (comps.error || pred.error || !comps.data || !pred.data) return <ErrorBox message={comps.error ?? pred.error ?? 'Could not load predictions.'} onRetry={() => { comps.reload(); pred.reload(); }} />;
  const reload = () => { comps.reload(); pred.reload(); };
  const open = comps.data.filter((c) => c.currentRound);
  const pending = pred.data.predictions.filter((p) => p.status === 'pending');
  const tone = { won: 'accent', lost: 'bad', refunded: 'neutral', pending: 'warn' } as const;

  return (
    <>
      <PageHeader title="Predict" subtitle="Pick the winner of an open round with virtual points." />
      <div className="mb-6"><Notice><b>Virtual points only.</b> No real money, no deposit, no withdrawal, no token. Points have no value outside this app and cannot be converted into money or assets.</Notice></div>
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Balance" value={fmt(pred.data.user.points)} hint="virtual points" />
        <Stat label="At stake" value={fmt(pending.reduce((s, p) => s + p.stake, 0))} hint={`${pending.length} pending`} />
        <Stat label="Settled" value={pred.data.predictions.length - pending.length} hint="predictions" />
      </div>

      <div className="space-y-5">{open.map((c) => <RoundPredictor key={c.info.id + c.currentRound!.id} c={c} data={pred.data!} minStake={cfg.data?.minStake ?? 10} onDone={reload} />)}</div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="label mb-3">Prediction history</div>
          {pred.data.predictions.length === 0 ? <Empty title="No predictions yet" text="Place your first prediction above." /> : (
            <div className="card divide-y divide-line">{pred.data.predictions.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div><div className="font-medium">{p.agentName}</div><div className="text-xs text-muted">{p.stake} pts × {p.multiplier} · {timeAgo(p.createdAt)}</div></div>
                <div className="text-right"><Badge tone={tone[p.status]}>{p.status}</Badge>{p.status !== 'pending' && <div className="mt-1 text-xs tabular-nums text-muted">{p.status === 'won' ? `+${p.payout - p.stake}` : p.status === 'lost' ? `-${p.stake}` : '±0'}</div>}</div>
              </div>))}</div>
          )}
        </section>
        <section>
          <div className="label mb-3">Points ledger</div>
          <div className="card divide-y divide-line">{pred.data.ledger.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 p-4 text-sm"><div className="min-w-0"><div className="truncate">{l.reason}</div><div className="text-xs text-muted">{timeAgo(l.at)}</div></div><div className="text-right tabular-nums"><div className={l.delta >= 0 ? 'text-accent' : 'text-bad'}>{l.delta >= 0 ? '+' : ''}{l.delta}</div><div className="text-xs text-muted">{fmt(l.balanceAfter)}</div></div></div>))}</div>
        </section>
      </div>
    </>
  );
}
