import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Play, Zap } from 'lucide-react';
import type { AgentView, CompetitionView } from '../../shared/api.ts';
import { Avatar, Badge, Button, Empty, EngineBadge, ErrorBox, Notice, PageHeader, Spinner } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { api, useApi } from '../lib/api.ts';
import { CATEGORY_LABEL, timeAgo } from '../lib/format.ts';

export default function CompetitionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const comp = useApi<CompetitionView>(`/api/competitions/${id}`);
  const agents = useApi<AgentView[]>('/api/agents');
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return setElapsed(0);
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(t);
  }, [running]);

  if ((comp.loading && !comp.data) || (agents.loading && !agents.data)) return <Spinner />;
  if (comp.error || !comp.data) return <ErrorBox message={comp.error ?? 'Competition not found.'} onRetry={comp.reload} />;
  const { info, currentRound, pastRounds, eligibility } = comp.data;
  const mine = agents.data ?? [];
  const experimental = info.status === 'experimental';
  const canQuick = eligibility.some((e) => e.eligible && !e.entered);
  const myEntered = mine.filter((a) => eligibility.find((e) => e.agentId === a.id)?.entered);

  const toggle = async (agentId: string, entered: boolean) => {
    setBusy(agentId);
    try {
      if (entered) await api('DELETE', `/api/competitions/${info.id}/entries/${agentId}`);
      else await api('POST', `/api/competitions/${info.id}/entries`, { agentId });
      comp.reload();
      toast(entered ? 'Agent withdrawn.' : 'Agent entered.');
    } catch (e: any) { toast(e.message, true); } finally { setBusy(null); }
  };
  const run = async (enterAll = false) => {
    setRunning(true);
    try {
      if (enterAll) {
        for (const e of eligibility) if (e.eligible && !e.entered) await api('POST', `/api/competitions/${info.id}/entries`, { agentId: e.agentId });
      }
      const { roundId } = await api<{ roundId: string }>('POST', `/api/competitions/${info.id}/run`);
      toast('Round complete. Results are in.');
      nav(`/rounds/${roundId}`);
    } catch (e: any) { toast(e.message, true); setRunning(false); }
  };

  return (
    <>
      <PageHeader title={info.name} subtitle={info.tagline} action={!experimental && <Button to="/predict">Predict this round</Button>} />
      <div className="mb-6 flex flex-wrap gap-2"><Badge tone="accent">{CATEGORY_LABEL[info.category]}</Badge><Badge>{info.durationLabel}</Badge><Badge>Standard championship</Badge><Badge>Max score {info.maxScore}</Badge>{experimental && <Badge tone="warn">Experimental</Badge>}</div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="card p-5 md:p-6">
            <p className="text-sm leading-relaxed text-muted">{info.description}</p>
            <div className="label mb-2 mt-6">Rules</div>
            <ul className="space-y-2 text-sm text-muted">{info.rules.map((r) => <li key={r} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />{r}</li>)}</ul>
            <div className="label mb-2 mt-6">Scoring</div>
            <div className="divide-y divide-line rounded-lg border border-line">
              {info.scoring.map((s) => (
                <div key={s.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div><div>{s.label}</div><div className="text-xs text-muted">{s.detail}</div></div>
                  <div className="font-semibold tabular-nums text-accent">{s.points}</div>
                </div>
              ))}
            </div>
            <div className="label mb-2 mt-6">Topics</div>
            <div className="flex flex-wrap gap-2">{info.topics.map((t) => <Badge key={t}>{t}</Badge>)}</div>
          </section>

          {pastRounds.length > 0 && (
            <section>
              <div className="label mb-3">Previous rounds</div>
              <div className="card divide-y divide-line">
                {pastRounds.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <div><div className="font-medium">Round {r.number}</div><div className="text-xs text-muted">Won by {r.winners.join(', ')} · {r.topScore}/{info.maxScore} · {r.completedAt && timeAgo(r.completedAt)}</div></div>
                    <Button small to={`/rounds/${r.id}`}>View Results</Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          {experimental || !currentRound ? (
            <Empty title="Not playable yet" text="This competition is not playable yet." action={<Button to="/arena">Back to Arena</Button>} />
          ) : (
            <>
              <section className="card p-5">
                <div className="label mb-1">Round {currentRound.number} · your agents</div>
                <p className="mb-4 text-xs text-muted">Only specialties accepted by this competition can enter. An agent enters with its current version.</p>
                {mine.length === 0 ? (
                  <Empty title="No agents yet" text="Create an agent to take part." action={<Button variant="primary" to="/agents/new">Create an Agent</Button>} />
                ) : (
                  <div className="space-y-2">
                    {mine.map((a) => {
                      const e = eligibility.find((x) => x.agentId === a.id);
                      return (
                        <div key={a.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
                          <Avatar avatar={a.avatar} size={36} />
                          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{a.name} <span className="text-xs text-muted">v{a.version}</span></div>
                            {e && !e.eligible && <div className="text-xs text-muted">{e.reason}</div>}</div>
                          <Button small variant={e?.entered ? 'ghost' : 'primary'} disabled={!e?.eligible && !e?.entered} loading={busy === a.id} onClick={() => toggle(a.id, !!e?.entered)}>{e?.entered ? 'Withdraw' : 'Enter'}</Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="card p-5">
                <div className="label mb-3">Participants ({currentRound.entrants.length})</div>
                <div className="space-y-2.5">
                  {currentRound.entrants.map((e) => (
                    <div key={e.agentId} className="flex items-center gap-3 text-sm">
                      <Avatar avatar={e.avatar} size={30} />
                      <div className="min-w-0 flex-1"><div className="truncate">{e.name}</div><div className="text-xs text-muted">{e.kind === 'house' ? `House bot · simulated skill ${Math.round((e.skill ?? 0) * 100)}%` : e.creator}</div></div>
                      <EngineBadge kind={e.engine} />
                    </div>
                  ))}
                </div>
                <div className="mt-5 border-t border-line pt-5">
                  {myEntered.length === 0 && canQuick ? (
                    <Button variant="primary" className="w-full" loading={running} onClick={() => run(true)}><Zap size={15} />{running ? 'Running…' : 'Quick play'}</Button>
                  ) : (
                    <Button variant="primary" className="w-full" disabled={myEntered.length === 0} loading={running} onClick={() => run()}><Play size={15} />{running ? 'Running agents…' : 'Run round'}</Button>
                  )}
                  {myEntered.length === 0 && !canQuick && <p className="mt-2 text-center text-xs text-muted">Enter at least one of your agents to start.</p>}
                  {myEntered.length === 0 && canQuick && <p className="mt-2 text-center text-xs text-muted">Enters your eligible agents and runs the round in one click.</p>}
                  {running && <p className="mt-2 text-center text-xs tabular-nums text-muted">{elapsed}s / {Math.round(info.limits.roundDeadlineMs / 1000)}s maximum</p>}
                </div>
              </section>
              <Notice>Agents run in parallel. A round lasts at most {Math.round(info.limits.roundDeadlineMs / 1000)}s, and every live agent gets the same limits ({info.limits.maxTokensPerTask} tokens and {info.limits.timeoutMsPerTask / 1000}s per task). See <Link to="/profile" className="text-accent">Profile</Link> for which engines are available.</Notice>
            </>
          )}
        </div>
      </div>
    </>
  );
}
