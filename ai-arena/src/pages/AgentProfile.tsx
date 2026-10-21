import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, Pencil, Trash2 } from 'lucide-react';
import { PERSONALITIES, SPECIALTIES, STRATEGIES } from '../../shared/catalog.ts';
import type { AgentDetail } from '../../shared/api.ts';
import { Avatar, Badge, Button, Empty, EngineBadge, ErrorBox, LineChart, Modal, Spinner, Stat } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { api, useApi } from '../lib/api.ts';
import { CATEGORY_LABEL, timeAgo } from '../lib/format.ts';

export default function AgentProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data: a, error, loading, reload } = useApi<AgentDetail>(`/api/agents/${id}`);
  const [confirm, setConfirm] = useState(false);
  if (loading && !a) return <Spinner />;
  if (error || !a) return <ErrorBox message={error ?? 'Agent not found.'} onRetry={reload} />;
  const s = a.stats;
  const label = (list: { id: string; label: string }[], v: string) => list.find((x) => x.id === v)?.label ?? v;
  const remove = async () => {
    try { await api('DELETE', `/api/agents/${a.id}`); toast(`${a.name} deleted.`); nav('/agents'); } catch (e: any) { toast(e.message, true); setConfirm(false); }
  };
  const ToneIcon = { good: CheckCircle2, warn: AlertTriangle, info: Info };

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Avatar avatar={a.avatar} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{a.name} <span className="text-base font-normal text-muted">v{a.version}</span></h1>
          <p className="mt-1 text-sm text-muted">{a.description || 'No description'}</p>
          <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone="accent">{label(PERSONALITIES, a.config.personality)}</Badge><Badge>{label(SPECIALTIES, a.config.specialty)}</Badge><Badge>{label(STRATEGIES, a.config.strategy)}</Badge><EngineBadge kind={a.config.provider === 'demo' ? 'simulated' : 'live'} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button to={`/agents/${a.id}/edit`} variant="primary"><Pencil size={15} />Improve Agent</Button>
          <Button to="/arena">Enter Arena</Button>
          <Button variant="danger" onClick={() => setConfirm(true)} aria-label="Delete agent"><Trash2 size={15} /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Competitions" value={s.rounds} />
        <Stat label="Wins" value={s.wins} hint={s.rounds ? `${s.rounds - s.wins} other results` : undefined} />
        <Stat label="Win rate" value={s.rounds ? `${Math.round(s.winRate)}%` : '—'} />
        <Stat label="Average score" value={s.rounds ? `${Math.round(s.avgScorePct)}%` : '—'} hint="of the maximum, all runs" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <div className="label mb-4">Score over time (% of maximum)</div>
            {s.history.length === 0 ? <p className="py-6 text-center text-sm text-muted">No results yet. Enter a competition to start building a history.</p> : <LineChart points={s.history.map((h) => ({ label: `${h.competitionName} R${h.roundNumber}`, value: Math.round((h.score / h.maxScore) * 100) }))} />}
          </section>

          <section>
            <div className="label mb-3">Scores by category</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(['brain', 'research', 'strategy'] as const).map((c) => (
                <div key={c} className="card p-4"><div className="text-xs text-muted">{CATEGORY_LABEL[c]}</div>
                  {s.byCategory[c].rounds ? <><div className="mt-1.5 text-xl font-semibold tabular-nums">{s.byCategory[c].avgScore}<span className="text-xs font-normal text-muted"> avg / 100</span></div><div className="mt-1 text-xs text-muted">{s.byCategory[c].wins} win(s) · {s.byCategory[c].rounds} run(s) · best {s.byCategory[c].bestScore}</div></>
                    : <div className="mt-1.5 text-sm text-muted">No runs yet</div>}</div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Categories are never merged: each uses its own scale and its own ranking.</p>
          </section>

          <section>
            <div className="label mb-3">Competition history</div>
            {s.history.length === 0 ? <Empty title="No competitions yet" text="Results will appear here after your first round." /> : (
              <div className="card divide-y divide-line">
                {[...s.history].reverse().map((h) => (
                  <Link key={h.roundId} to={`/rounds/${h.roundId}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm transition hover:bg-raised">
                    <div><div className="font-medium">{h.competitionName} · Round {h.roundNumber}</div><div className="text-xs text-muted">{timeAgo(h.at)} · version {h.version} · {h.rank === 1 ? 'Win' : `Rank ${h.rank} of ${h.entrants}`}</div></div>
                    <div className="flex items-center gap-3"><EngineBadge kind={h.engine} /><span className="font-semibold tabular-nums">{h.score}/{h.maxScore}</span></div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <div className="label mb-3">Performance Insights</div>
            <ul className="space-y-3">
              {a.insights.map((i) => { const I = ToneIcon[i.tone]; return (
                <li key={i.text} className="flex gap-2.5 text-sm"><I size={16} className={`mt-0.5 shrink-0 ${i.tone === 'good' ? 'text-accent' : i.tone === 'warn' ? 'text-warn' : 'text-muted'}`} /><span className="text-muted">{i.text}</span></li>); })}
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">Computed from recorded results only. Agents do not learn on their own: to improve one, change its settings and compare versions.</p>
          </section>

          <section className="card p-5">
            <div className="label mb-3">Recent errors</div>
            {s.recentMistakes.length === 0 ? <p className="text-sm text-muted">No recorded errors.</p> : <ul className="space-y-2 text-xs text-muted">{s.recentMistakes.map((m, i) => <li key={i}><Link to={`/rounds/${m.roundId}`} className="hover:text-accent">{m.text}</Link></li>)}</ul>}
          </section>

          <section className="card p-5">
            <div className="label mb-3">Version history</div>
            <ul className="space-y-3">
              {[...a.versions].reverse().map((v) => { const st = s.versions.find((x) => x.version === v.version)!; return (
                <li key={v.version} className="border-l-2 border-line pl-3 text-sm">
                  <div className="flex justify-between"><span className="font-medium">Version {v.version}{v.version === a.version && <span className="ml-2 text-xs text-accent">current</span>}</span><span className="text-xs tabular-nums text-muted">{st.avgScorePct === null ? 'no runs' : `${st.avgScorePct}% avg · ${st.rounds} run(s)`}</span></div>
                  <div className="text-xs text-muted">{v.note} · {label(PERSONALITIES, v.config.personality)} · {label(STRATEGIES, v.config.strategy)}</div>
                </li>); })}
            </ul>
          </section>

          <details className="card p-5 text-xs text-muted">
            <summary className="cursor-pointer text-sm text-ink">Runtime instructions</summary>
            <pre className="mt-3 whitespace-pre-wrap leading-relaxed">{a.systemPrompt}</pre>
          </details>
        </div>
      </div>

      <Modal open={confirm} title={`Delete ${a.name}?`} onClose={() => setConfirm(false)}>
        <p>The agent is removed from open rounds. Its past results stay in the leaderboard and history.</p>
        <div className="mt-5 flex justify-end gap-2"><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></div>
      </Modal>
    </>
  );
}
