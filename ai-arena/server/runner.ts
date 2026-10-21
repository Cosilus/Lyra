import { buildSystemPrompt } from '../shared/catalog.ts';
import type { Agent, EngineInfo, Round, RunResult } from '../shared/types.ts';
import { getCompetition } from './competitions/index.ts';
import type { CompetitionDef } from './competitions/types.ts';
import { config } from './config.ts';
import type { Store } from './db.ts';
import { HttpError } from './errors.ts';
import { settleRound } from './predictions.ts';
import { anthropicAvailable, anthropicComplete, type CompleteRequest } from './providers/anthropic.ts';
import { makeRng } from './rng.ts';

const running = new Set<string>();

function engineFor(agent: Agent, version: number): EngineInfo {
  const cfg = agent.versions.find((v) => v.version === version)?.config ?? agent.config;
  if (agent.kind === 'house' || cfg.provider === 'demo') return { kind: 'simulated', provider: 'demo', model: 'Demo engine (simulated, no AI model)' };
  return { kind: 'live', provider: 'anthropic', model: config.anthropicModel };
}

/** Runs one agent through one competition. Tasks run sequentially with identical limits. */
type Completer = (req: CompleteRequest) => Promise<string>;

async function runAgent(def: CompetitionDef, agent: Agent, version: number, round: Round, complete: Completer, deadline: number): Promise<RunResult> {
  const cfg = agent.versions.find((v) => v.version === version)?.config ?? agent.config;
  const systemPrompt = buildSystemPrompt(agent.name, cfg);
  const engine = engineFor(agent, version);
  const started = Date.now();
  const responses: Record<string, string> = {};
  const errors: Record<string, string> = {};

  if (engine.kind === 'simulated') {
    const rng = makeRng(`${agent.id}:${version}:${def.info.id}:${round.number}`);
    Object.assign(responses, def.simulate(round.number, agent.kind === 'house' ? agent.skill ?? 0.5 : config.demoSkill, rng));
  } else {
    // Tasks run in parallel and share the round deadline, so a round stays short and every agent faces the same limits.
    await Promise.all(def.tasks(round.number).map(async (task) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        errors[task.id] = 'Round time limit reached before the call started.';
        responses[task.id] = '';
        return;
      }
      try {
        responses[task.id] = await complete({
          system: `${systemPrompt}\n\n${def.preamble}`,
          user: task.prompt,
          maxTokens: def.info.limits.maxTokensPerTask,
          timeoutMs: Math.min(def.info.limits.timeoutMsPerTask, remaining),
        });
      } catch (e: any) {
        errors[task.id] = e?.message ?? 'Unknown error';
        responses[task.id] = '';
      }
    }));
  }

  const grade = def.grade(round.number, responses, errors);
  return {
    agentId: agent.id, agentName: agent.name, creator: agent.creator, kind: agent.kind, avatar: agent.avatar, specialty: cfg.specialty,
    agentVersion: version, engine, score: grade.score, maxScore: def.info.maxScore, rank: 0,
    answers: grade.answers, criteria: grade.criteria, report: grade.report, strengths: grade.strengths, mistakes: grade.mistakes,
    durationMs: Date.now() - started, errors: Object.values(errors), systemPrompt,
  };
}

/** Competition ranking: equal scores share a rank (1, 1, 3, ...). */
export function rankResults(results: RunResult[]): RunResult[] {
  const sorted = [...results].sort((a, b) => b.score - a.score || a.agentName.localeCompare(b.agentName));
  sorted.forEach((r, i) => {
    r.rank = i > 0 && sorted[i - 1].score === r.score ? sorted[i - 1].rank : i + 1;
  });
  return sorted;
}

export async function runRound(store: Store, competitionId: string, opts: { complete?: Completer; deadlineMs?: number } = {}): Promise<Round> {
  const def = getCompetition(competitionId);
  if (!def) throw new HttpError(404, 'Competition not found or not playable yet.');
  const round = store.openRound(competitionId);
  if (!round) throw new HttpError(409, 'No open round for this competition.');
  if (running.has(round.id)) throw new HttpError(409, 'This round is already running.');
  if (round.entrants.filter((e) => store.agent(e.agentId)?.kind === 'user').length === 0) {
    throw new HttpError(400, 'Enter at least one of your agents before starting the round.');
  }
  const entrants = round.entrants.map((e) => ({ e, agent: store.agent(e.agentId)! }));
  const needsKey = entrants.find(({ e, agent }) => engineFor(agent, e.agentVersion).kind === 'live');
  if (needsKey && !opts.complete && !anthropicAvailable()) {
    throw new HttpError(400, `${needsKey.agent.name} uses a live model but ANTHROPIC_API_KEY is not set on the server.`);
  }

  running.add(round.id);
  try {
    const deadline = Date.now() + (opts.deadlineMs ?? def.info.limits.roundDeadlineMs);
    const complete = opts.complete ?? anthropicComplete;
    const results = await Promise.all(entrants.map(({ e, agent }) => runAgent(def, agent, e.agentVersion, round, complete, deadline)));
    round.results = rankResults(results);
    round.status = 'completed';
    round.completedAt = new Date().toISOString();
    settleRound(store, round);
    const mine = round.results.filter((r) => r.kind === 'user');
    for (const r of mine) store.log(`${r.agentName} finished #${r.rank} in ${def.info.name} (${r.score}/${r.maxScore}).`, `/rounds/${round.id}`);
    store.ensureOpenRounds();
    store.save();
    return round;
  } finally {
    running.delete(round.id);
  }
}
