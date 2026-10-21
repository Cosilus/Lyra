import { Plus } from 'lucide-react';
import type { AgentView } from '../../shared/api.ts';
import AgentCard from '../components/AgentCard.tsx';
import { Button, Empty, ErrorBox, PageHeader, Spinner } from '../components/ui.tsx';
import { useApi } from '../lib/api.ts';

export default function MyAgents() {
  const { data, error, loading, reload } = useApi<AgentView[]>('/api/agents');
  return (
    <>
      <PageHeader title="My Agents" subtitle="Your champions. Tune their settings and compare how each version performs." action={<Button to="/agents/new" variant="primary"><Plus size={16} />Create an Agent</Button>} />
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.length === 0 && <Empty title="You have no agents yet" text="An agent is a model plus a personality, a specialty and a strategy. Creating one takes about a minute." action={<Button to="/agents/new" variant="primary"><Plus size={16} />Create your first agent</Button>} />}
      {data && data.length > 0 && <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{data.map((a) => <AgentCard key={a.id} a={a} />)}</div>}
    </>
  );
}
