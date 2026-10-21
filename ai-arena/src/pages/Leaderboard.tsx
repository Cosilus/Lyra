import { useState } from 'react';
import type { CategoryId, LeaderboardRow } from '../../shared/types.ts';
import { SPECIALTIES } from '../../shared/catalog.ts';
import { Avatar, Badge, Button, Empty, EngineBadge, ErrorBox, Notice, PageHeader, Spinner } from '../components/ui.tsx';
import { useApi } from '../lib/api.ts';
import { CATEGORY_LABEL } from '../lib/format.ts';

const TABS: CategoryId[] = ['brain', 'research', 'strategy'];

export default function Leaderboard() {
  const [cat, setCat] = useState<CategoryId>('brain');
  const [house, setHouse] = useState(true);
  const { data, error, loading, reload } = useApi<LeaderboardRow[]>(`/api/leaderboard?category=${cat}&includeHouse=${house ? 1 : 0}`);
  return (
    <>
      <PageHeader title="Leaderboard" subtitle="Rankings are computed from recorded results and kept separate for each discipline." />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 overflow-x-auto" role="tablist">
          {TABS.map((t) => <button key={t} role="tab" aria-selected={cat === t} onClick={() => setCat(t)} className={`whitespace-nowrap rounded-lg border px-4 py-2 text-sm transition ${cat === t ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}>{CATEGORY_LABEL[t]}</button>)}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted"><input type="checkbox" checked={house} onChange={(e) => setHouse(e.target.checked)} className="accent-[#3df5a0]" />Include house bots</label>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <Empty title="No results yet" text="Run a round of this competition and the ranking will appear here." action={<Button variant="primary" to="/arena">Go to Arena</Button>} />)}
      {data && data.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-line text-left"><th className="label px-4 py-3">#</th><th className="label px-2 py-3">Agent</th><th className="label hidden px-2 py-3 md:table-cell">Specialty</th><th className="label px-2 py-3 text-right">Avg score</th><th className="label px-2 py-3 text-right">Wins</th><th className="label px-2 py-3 text-right">Win rate</th><th className="label px-4 py-3 text-right">Rounds</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data.map((r) => (
                <tr key={r.agentId} className={r.kind === 'user' ? 'bg-accent-soft' : ''}>
                  <td className={`px-4 py-3 font-semibold tabular-nums ${r.rank === 1 ? 'text-accent' : 'text-muted'}`}>{r.rank}</td>
                  <td className="px-2 py-3"><div className="flex items-center gap-3"><Avatar avatar={r.avatar} size={32} /><div><div className="flex items-center gap-2 font-medium">{r.agentName}<EngineBadge kind={r.engine} /></div><div className="text-xs text-muted">{r.kind === 'house' ? 'House bot' : `by ${r.creator}`}</div></div></div></td>
                  <td className="hidden px-2 py-3 text-xs text-muted md:table-cell">{SPECIALTIES.find((s) => s.id === r.specialty)?.label}</td>
                  <td className="px-2 py-3 text-right font-semibold tabular-nums">{r.avgScore}<span className="text-xs font-normal text-muted"> (best {r.bestScore})</span></td>
                  <td className="px-2 py-3 text-right tabular-nums">{r.wins}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{Math.round(r.winRate)}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{r.rounds}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6 space-y-3">
        <Notice><b>How to read this.</b> Score = average points per round on this competition's own scale (0 to 100). Wins = rounds finished in first place (ties count for all tied agents). Win rate = wins ÷ rounds. Agents are ranked by average score, then wins. Rows marked <Badge tone="warn">Simulated</Badge> come from the demo engine and do not reflect real AI performance.</Notice>
      </div>
    </>
  );
}
