import { Link } from 'react-router-dom';
import { PERSONALITIES, SPECIALTIES, STRATEGIES } from '../../shared/catalog.ts';
import type { AgentView } from '../../shared/api.ts';
import { Avatar, Badge, Button, EngineBadge } from './ui.tsx';

export default function AgentCard({ a }: { a: AgentView }) {
  const per = PERSONALITIES.find((p) => p.id === a.config.personality)!;
  const spe = SPECIALTIES.find((p) => p.id === a.config.specialty)!;
  const str = STRATEGIES.find((p) => p.id === a.config.strategy)!;
  const last = a.stats.history.slice(-12);
  return (
    <div className="card card-hover flex flex-col p-5">
      <div className="flex items-start gap-3">
        <Avatar avatar={a.avatar} size={48} />
        <div className="min-w-0 flex-1">
          <Link to={`/agents/${a.id}`} className="block truncate text-base font-semibold hover:text-accent">{a.name}</Link>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.description || 'No description'}</p>
        </div>
        <span className="text-xs text-muted">v{a.version}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5"><Badge tone="accent">{per.label}</Badge><Badge>{spe.label}</Badge><Badge>{str.label}</Badge><EngineBadge kind={a.config.provider === 'demo' ? 'simulated' : 'live'} /></div>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-line bg-bg p-3 text-center">
        <div><div className="text-lg font-semibold tabular-nums">{a.stats.rounds}</div><div className="text-[10px] uppercase tracking-wider text-muted">Competitions</div></div>
        <div><div className="text-lg font-semibold tabular-nums">{a.stats.rounds ? `${Math.round(a.stats.winRate)}%` : '—'}</div><div className="text-[10px] uppercase tracking-wider text-muted">Win rate</div></div>
        <div><div className="text-lg font-semibold tabular-nums">{a.stats.rounds ? `${Math.round(a.stats.avgScorePct)}%` : '—'}</div><div className="text-[10px] uppercase tracking-wider text-muted">Avg score</div></div>
      </div>
      <div className="mt-3 flex h-8 items-end gap-1" aria-label="Recent scores">
        {last.length === 0 ? <span className="text-xs text-muted">No performance history yet</span> : last.map((h, i) => (
          <div key={i} title={`${h.competitionName} R${h.roundNumber}: ${h.score}/${h.maxScore}`} className="flex-1 rounded-sm bg-accent/70" style={{ height: `${Math.max(8, (h.score / h.maxScore) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-5 flex gap-2">
        <Button small to={`/agents/${a.id}/edit`} className="flex-1">Edit Agent</Button>
        <Button small variant="primary" to="/arena" className="flex-1">Enter Arena</Button>
      </div>
    </div>
  );
}
