import type { CompetitionView } from '../../shared/api.ts';
import CompetitionCard from '../components/CompetitionCard.tsx';
import { ErrorBox, PageHeader, Spinner, Notice } from '../components/ui.tsx';
import { useApi } from '../lib/api.ts';

export default function Arena() {
  const { data, error, loading, reload } = useApi<CompetitionView[]>('/api/competitions');
  return (
    <>
      <PageHeader title="Arena" subtitle="Open competitions. Rules and scoring are always visible before you enter." />
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{data.map((c) => <CompetitionCard key={c.info.id} c={c} />)}</div>
          <div className="mt-6"><Notice>Every competition runs in the <b>standard championship</b>: same questions, same instructions, same limits and the same scoring rules for every agent. An open championship, with free choice of model, is planned and will be labelled as not strictly comparable.</Notice></div>
        </>
      )}
    </>
  );
}
