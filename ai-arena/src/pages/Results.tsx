import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import type { RoundDetail } from '../../shared/api.ts';
import { Avatar, Badge, Bar, EngineBadge, ErrorBox, Notice, PageHeader, Spinner } from '../components/ui.tsx';
import { useApi } from '../lib/api.ts';

export default function Results() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<RoundDetail>(`/api/rounds/${id}`);
  const [sel, setSel] = useState<string | null>(null);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? 'Results not found.'} onRetry={reload} />;
  const { info, results, tasks, round } = data;
  const current = results.find((r) => r.agentId === (sel ?? results.find((x) => x.kind === 'user')?.agentId ?? results[0].agentId))!;
  const anySim = results.some((r) => r.engine.kind === 'simulated');
  const promptOf = (taskId: string) => tasks.find((t) => t.id === taskId)?.prompt ?? '';

  return (
    <>
      <PageHeader title={`${info.name} · Round ${round.number}`} subtitle="Final ranking, answers, explanations and score breakdown." action={<Link to={`/arena/${info.id}`} className="text-sm text-accent">Back to competition</Link>} />
      {anySim && <div className="mb-6"><Notice tone="warn"><b>Simulated results.</b> Agents marked "Simulated" were played by the demo engine: random draws, not AI reasoning. Their scores say nothing about the quality of an agent's settings.</Notice></div>}

      <div className="label mb-3">Final ranking</div>
      <div className="card divide-y divide-line">
        {results.map((r) => (
          <button key={r.agentId} onClick={() => setSel(r.agentId)} className={`flex w-full items-center gap-3 p-4 text-left transition hover:bg-raised ${current.agentId === r.agentId ? 'bg-accent-soft' : ''}`}>
            <span className={`w-8 text-lg font-semibold tabular-nums ${r.rank === 1 ? 'text-accent' : 'text-muted'}`}>{r.rank}</span>
            <Avatar avatar={r.avatar} size={34} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{r.agentName}<span className="text-xs text-muted">v{r.agentVersion}</span>{r.kind === 'house' ? <Badge>House bot</Badge> : <Badge tone="accent">You</Badge>}<EngineBadge kind={r.engine.kind} /></div>
              <div className="mt-2 max-w-sm"><Bar value={r.score} max={r.maxScore} /></div>
            </div>
            <div className="text-right"><div className="text-lg font-semibold tabular-nums">{r.score}</div><div className="text-xs text-muted">/ {r.maxScore}</div></div>
          </button>
        ))}
      </div>
      {results.filter((r) => r.rank === 1).length > 1 && <p className="mt-2 text-xs text-muted">Equal scores share a rank. Predictions on tied leaders are refunded.</p>}

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Avatar avatar={current.avatar} size={40} />
        <div><h2 className="text-xl font-semibold">{current.agentName} <span className="text-sm font-normal text-muted">rank #{current.rank} · {current.score}/{current.maxScore}</span></h2>
          <p className="text-xs text-muted">Engine: {current.engine.model}{current.engine.kind === 'live' ? ` · ${Math.round(current.durationMs / 100) / 10}s` : ''}</p></div>
      </div>
      {current.errors.length > 0 && <div className="mt-4"><ErrorBox message={`Some model calls failed: ${[...new Set(current.errors)].join('; ')}`} /></div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-1">
          <div className="label mb-4">Score breakdown</div>
          <div className="space-y-4">
            {current.criteria.map((c) => (
              <div key={c.id}><div className="mb-1.5 flex justify-between text-sm"><span>{c.label}</span><span className="tabular-nums text-muted">{c.earned} / {c.max}</span></div><Bar value={c.earned} max={c.max} tone={c.earned / c.max < 0.4 ? 'bad' : c.earned / c.max < 0.7 ? 'warn' : 'accent'} /></div>
            ))}
          </div>
          <div className="label mb-2 mt-6">Strengths</div>
          {current.strengths.length ? <ul className="space-y-1.5 text-sm text-muted">{current.strengths.map((s) => <li key={s} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-accent" />{s}</li>)}</ul> : <p className="text-sm text-muted">No category with full marks.</p>}
          <div className="label mb-2 mt-6">Errors</div>
          {current.mistakes.length ? <ul className="space-y-1.5 text-sm text-muted">{current.mistakes.map((s) => <li key={s} className="flex gap-2"><X size={14} className="mt-0.5 shrink-0 text-bad" />{s}</li>)}</ul> : <p className="text-sm text-muted">No errors. Perfect score.</p>}
        </section>

        <section className="space-y-3 lg:col-span-2">
          {info.category === 'brain' ? current.answers.map((a) => (
            <div key={a.taskId} className="card p-4">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${a.correct ? 'bg-accent-soft text-accent' : 'bg-bad/10 text-bad'}`}>{a.correct ? <Check size={14} /> : <X size={14} />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted"><span>{a.label} · {a.tag}</span><span className="tabular-nums">{a.points}/{a.max}</span></div>
                  <p className="mt-1 text-sm">{promptOf(a.taskId).split('\n')[0]}</p>
                  <div className="mt-2.5 grid gap-1 text-xs sm:grid-cols-2">
                    <div><span className="text-muted">Agent answered: </span>{a.parsed ?? <i className="text-bad">no valid answer</i>}</div>
                    {info.publishAnswers && <div><span className="text-muted">Correct answer: </span>{a.expected}</div>}
                  </div>
                  {a.note && <p className="mt-1.5 text-xs text-warn">{a.note}</p>}
                  {info.publishAnswers && <p className="mt-2 text-xs leading-relaxed text-muted">{a.explanation}</p>}
                </div>
              </div>
            </div>
          )) : (
            <>
              <div className="card p-4">
                <div className="label mb-2">{info.category === 'research' ? 'Report produced by the agent' : 'Simulation log (computed by the platform)'}</div>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-muted">{current.report || '(empty)'}</pre>
              </div>
              {current.criteria.map((c) => (
                <div key={c.id} className="card p-4">
                  <div className="mb-2 flex justify-between text-sm font-medium"><span>{c.label}</span><span className="tabular-nums">{c.earned}/{c.max}</span></div>
                  <div className="divide-y divide-line">{c.items.map((i) => (
                    <div key={i.label} className="flex items-start justify-between gap-3 py-2 text-xs"><span className="text-muted">{i.label}{i.note && <span className="ml-2 opacity-70">· {i.note}</span>}</span><span className={`tabular-nums ${i.earned === i.max ? 'text-accent' : 'text-bad'}`}>{i.earned}/{i.max}</span></div>
                  ))}</div>
                </div>
              ))}
              {info.category === 'research' && <Notice>The rubric checks for the presence of facts, risks, citations and structure with fixed keyword rules. It is reproducible but imperfect, and it does not judge the quality of the argument.</Notice>}
            </>
          )}
          <details className="card p-4 text-xs text-muted">
            <summary className="cursor-pointer text-sm text-ink">Instructions this agent ran with</summary>
            <pre className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{current.systemPrompt}</pre>
          </details>
        </section>
      </div>
    </>
  );
}
