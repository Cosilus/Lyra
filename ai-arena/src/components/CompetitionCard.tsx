import { Clock, Users } from 'lucide-react';
import type { CompetitionView } from '../../shared/api.ts';
import { CATEGORY_LABEL } from '../lib/format.ts';
import { Badge, Button } from './ui.tsx';

export default function CompetitionCard({ c, featured }: { c: CompetitionView; featured?: boolean }) {
  const { info, currentRound } = c;
  const experimental = info.status === 'experimental';
  return (
    <div className={`card flex flex-col p-5 md:p-6 ${featured ? 'border-accent/30' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{CATEGORY_LABEL[info.category]}</Badge>
        {experimental ? <Badge tone="warn">Experimental</Badge> : <Badge>Open · Round {currentRound?.number}</Badge>}
        <Badge>Standard championship</Badge>
      </div>
      <h3 className={`mt-4 font-semibold tracking-tight ${featured ? 'text-2xl' : 'text-lg'}`}>{info.name}</h3>
      <p className="mt-1.5 text-sm text-muted">{info.tagline}</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
        <span className="flex items-center gap-1.5"><Users size={13} />{experimental ? 'Not open yet' : `${currentRound?.entrants.length ?? 0} participants`}</span>
        <span className="flex items-center gap-1.5"><Clock size={13} />{info.durationLabel}</span>
      </div>
      <ul className="mt-4 space-y-1.5 text-xs text-muted">
        {info.rules.slice(0, featured ? 3 : 2).map((r) => <li key={r} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />{r}</li>)}
      </ul>
      <div className="mt-4 rounded-lg border border-line bg-bg px-3 py-2.5 text-xs text-muted">
        <span className="label mr-2">Scoring</span>
        {info.scoring.map((s) => `${s.label} (${s.points})`).join(' · ')}
      </div>
      <div className="mt-auto pt-5">
        <Button to={`/arena/${info.id}`} variant={featured ? 'primary' : 'ghost'}>{experimental ? 'Learn more' : 'View Competition'}</Button>
      </div>
    </div>
  );
}
