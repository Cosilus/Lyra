import { Link } from 'react-router-dom';
import { ArrowRight, Plus, Swords } from 'lucide-react';
import type { DashboardData } from '../../shared/api.ts';
import CompetitionCard from '../components/CompetitionCard.tsx';
import { Button, Empty, ErrorBox, PageHeader, Spinner, Stat } from '../components/ui.tsx';
import { useApi } from '../lib/api.ts';
import { CATEGORY_LABEL, fmt, timeAgo } from '../lib/format.ts';

export default function Dashboard() {
  const { data: d, error, loading, reload } = useApi<DashboardData>('/api/dashboard');
  if (loading && !d) return <Spinner />;
  if (error || !d) return <ErrorBox message={error ?? 'Could not load the dashboard.'} onRetry={reload} />;
  return (
    <>
      <PageHeader
        title={`Welcome back, ${d.user.name}`}
        subtitle="Create your AI. Train your strategy. Enter the Arena."
        action={<>
          <Button to="/agents/new" variant="primary"><Plus size={16} />Create an Agent</Button>
          <Button to="/arena"><Swords size={16} />Explore Arena</Button>
        </>}
      />
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
        <Stat label="Agents" value={d.agentCount} />
        <Stat label="Active competitions" value={d.activeCompetitions} />
        <Stat label="Wins" value={d.wins} />
        <Stat label="Best rank" value={d.bestRank ? `#${d.bestRank.rank}` : '—'} hint={d.bestRank ? `${CATEGORY_LABEL[d.bestRank.category]} · ${d.bestRank.agentName}` : 'Play a round to get ranked'} />
        <Stat label="Virtual points" value={fmt(d.user.points)} hint={d.pendingPredictions ? `${d.pendingPredictions} prediction(s) pending` : undefined} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="label mb-3">Featured competition</div>
          <CompetitionCard c={d.featured} featured />
        </div>
        <div className="space-y-6">
          <section>
            <div className="label mb-3">Upcoming</div>
            <div className="card divide-y divide-line">
              {d.upcoming.map((u) => (
                <Link key={u.competitionId} to={`/arena/${u.competitionId}`} className="flex items-center justify-between gap-3 p-4 text-sm transition hover:bg-raised">
                  <div><div className="font-medium">{u.name}</div><div className="mt-0.5 text-xs text-muted">{CATEGORY_LABEL[u.category]} · Round {u.roundNumber} · {u.entrants} entered</div></div>
                  <ArrowRight size={15} className="text-muted" />
                </Link>
              ))}
            </div>
          </section>
          <section>
            <div className="label mb-3">Latest activity</div>
            {d.activity.length === 0 ? (
              <Empty title="Nothing yet" text="Create an agent and enter a competition. Your activity shows up here." />
            ) : (
              <div className="card divide-y divide-line">
                {d.activity.map((a) => (
                  <div key={a.id} className="p-4 text-sm">
                    {a.link ? <Link to={a.link} className="hover:text-accent">{a.text}</Link> : a.text}
                    <div className="mt-0.5 text-xs text-muted">{timeAgo(a.at)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
