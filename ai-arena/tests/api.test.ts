import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { Store } from '../server/db.ts';
import { settleRound } from '../server/predictions.ts';
import { runRound } from '../server/runner.ts';

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let store: Store;

const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as any };
};

const agentBody = (name: string, extra: any = {}) => ({
  name, description: 'test', avatar: { icon: 'bot', color: '#3df5a0' },
  config: { personality: 'calm', specialty: 'math_logic', strategy: 'step_by_step', instructions: '', provider: 'demo', ...extra },
});

beforeAll(async () => {
  store = new Store(null);
  server = createApp(store).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe('full user journey', () => {
  let agentId = '';
  let roundId = '';

  it('creates, validates and versions agents', async () => {
    expect((await call('POST', '/api/agents', agentBody('x'))).status).toBe(400);
    expect((await call('POST', '/api/agents', agentBody('Live', { provider: 'anthropic' }))).status).toBe(400); // no key configured
    const created = await call('POST', '/api/agents', agentBody('PlasmaWolf'));
    expect(created.status).toBe(201);
    agentId = created.json.id;
    expect(created.json.version).toBe(1);

    const edited = await call('PUT', `/api/agents/${agentId}`, { ...agentBody('PlasmaWolf', { personality: 'prudent' }), note: 'More careful' });
    expect(edited.json.version).toBe(2);
    expect(edited.json.versions).toHaveLength(2);
    const renamed = await call('PUT', `/api/agents/${agentId}`, agentBody('PlasmaWolf2', { personality: 'prudent' }));
    expect(renamed.json.version).toBe(2); // name change alone is not a new version
    await call('PUT', `/api/agents/${agentId}`, agentBody('PlasmaWolf', { personality: 'prudent' }));
  });

  it('refuses incompatible specialties and running without an agent', async () => {
    expect((await call('POST', '/api/competitions/logic-trials/run')).status).toBe(400);
    const other = await call('POST', '/api/agents', agentBody('Crypto', { specialty: 'crypto', strategy: 'risk_management' }));
    expect((await call('POST', '/api/competitions/logic-trials/entries', { agentId: other.json.id })).status).toBe(400);
    expect((await call('POST', '/api/competitions/strategy-arena/entries', { agentId })).status).toBe(404);
  });

  it('validates predictions', async () => {
    const comp = await call('GET', '/api/competitions/logic-trials');
    roundId = comp.json.currentRound.id;
    const ent = await call('POST', '/api/competitions/logic-trials/entries', { agentId });
    expect(ent.status).toBe(201);
    expect((await call('POST', '/api/competitions/logic-trials/entries', { agentId })).status).toBe(409);

    const target = 'house_helix-75';
    for (const stake of [-5, 0, 5, 1.5, '50', 5000]) {
      expect((await call('POST', '/api/predictions', { roundId, agentId: target, stake })).status).toBe(400);
    }
    expect((await call('GET', '/api/me')).json.points).toBe(1000);
    const ok = await call('POST', '/api/predictions', { roundId, agentId: target, stake: 100 });
    expect(ok.status).toBe(201);
    expect(ok.json.multiplier).toBe(5);
    expect((await call('GET', '/api/me')).json.points).toBe(900);
    expect((await call('POST', '/api/predictions', { roundId, agentId: target, stake: 100 })).status).toBe(409);
    expect((await call('DELETE', `/api/competitions/logic-trials/entries/${target}`)).status).toBe(404);
  });

  it('runs the round, ranks, and settles predictions exactly once', async () => {
    const run = await call('POST', '/api/competitions/logic-trials/run');
    expect(run.status).toBe(200);
    const detail = await call('GET', `/api/rounds/${roundId}`);
    expect(detail.json.results).toHaveLength(5);
    for (const r of detail.json.results) {
      expect(r.score).toBe(r.answers.reduce((s: number, a: any) => s + a.points, 0));
      expect(r.engine.kind).toBe('simulated');
    }
    const preds = (await call('GET', '/api/predictions')).json;
    const p = preds.predictions[0];
    expect(p.status).not.toBe('pending');
    const pointsAfter = preds.user.points;
    const expected = 900 + (p.status === 'won' ? 500 : p.status === 'refunded' ? 100 : 0);
    expect(pointsAfter).toBe(expected);

    // Settling again must not change anything.
    settleRound(store, store.db.rounds.find((r) => r.id === roundId)!);
    expect((await call('GET', '/api/me')).json.points).toBe(expected);
    // Closed round: no more predictions, and a new open round exists.
    expect((await call('POST', '/api/predictions', { roundId, agentId: 'house_helix-75', stake: 20 })).status).toBe(409);
    const next = await call('GET', '/api/competitions/logic-trials');
    expect(next.json.currentRound.number).toBe(2);
  });

  it('feeds leaderboard, stats and insights from recorded results', async () => {
    const lb = (await call('GET', '/api/leaderboard?category=brain')).json;
    expect(lb).toHaveLength(5);
    expect(lb[0].rank).toBe(1);
    expect((await call('GET', '/api/leaderboard?category=research')).json).toHaveLength(0);
    expect((await call('GET', '/api/leaderboard?category=brain&includeHouse=0')).json).toHaveLength(1);
    const agent = (await call('GET', `/api/agents/${agentId}`)).json;
    expect(agent.stats.rounds).toBe(1);
    expect(agent.stats.history[0].version).toBe(2);
    expect(agent.insights.length).toBeGreaterThan(0);
    expect(agent.systemPrompt).toMatch(/cautious/i);
  });

  it('runs Research Arena too', async () => {
    const a = (await call('POST', '/api/agents', agentBody('Scholar', { specialty: 'research', strategy: 'evidence_first' }))).json;
    expect((await call('POST', '/api/competitions/due-diligence/entries', { agentId: a.id })).status).toBe(201);
    const run = await call('POST', '/api/competitions/due-diligence/run');
    expect(run.status).toBe(200);
    const d = (await call('GET', `/api/rounds/${run.json.roundId}`)).json;
    expect(d.results[0].criteria).toHaveLength(5);
    expect(d.results[0].report).toContain('simulated');
  });

  it('runs Strategy Arena too', async () => {
    const a = (await call('POST', '/api/agents', agentBody('Planner', { specialty: 'strategy', strategy: 'risk_management' }))).json;
    expect((await call('POST', '/api/competitions/supply-plan/entries', { agentId: a.id })).status).toBe(201);
    const run = await call('POST', '/api/competitions/supply-plan/run');
    expect(run.status).toBe(200);
    const d = (await call('GET', `/api/rounds/${run.json.roundId}`)).json;
    expect(d.results[0].criteria).toHaveLength(3);
    expect((await call('GET', '/api/leaderboard?category=strategy')).json.length).toBe(5);
  });

  it('persists nothing sensitive and survives a reset', async () => {
    expect((await call('POST', '/api/reset', {})).status).toBe(400);
    expect((await call('POST', '/api/reset', { confirm: true })).status).toBe(200);
    expect((await call('GET', '/api/agents')).json).toHaveLength(0);
    expect((await call('GET', '/api/me')).json.points).toBe(1000);
  });
});

describe('time limits with a live provider (fake completer)', () => {
  const mkStore = () => {
    const st = new Store(null);
    const now = new Date().toISOString();
    const cfg = { personality: 'calm', specialty: 'math_logic', strategy: 'step_by_step', instructions: '', provider: 'anthropic' } as const;
    st.db.agents.push({ id: 'live1', name: 'Live', description: '', avatar: { icon: 'bot', color: '#3df5a0' }, kind: 'user', creator: 'x', createdAt: now, updatedAt: now, version: 1, config: cfg, versions: [{ version: 1, createdAt: now, note: '', config: cfg }] });
    st.openRound('logic-trials')!.entrants.push({ agentId: 'live1', agentVersion: 1, enteredAt: now });
    return st;
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('asks the 10 questions in parallel, so a round is fast', async () => {
    const st = mkStore();
    const t0 = Date.now();
    await runRound(st, 'logic-trials', { complete: async () => { await sleep(300); return 'ANSWER: 1'; } });
    expect(Date.now() - t0).toBeLessThan(1500); // sequential would take 3s+
  });

  it('cuts off slow models at the round deadline and scores the missing answers 0', async () => {
    const st = mkStore();
    const t0 = Date.now();
    const round = await runRound(st, 'logic-trials', {
      deadlineMs: 400,
      complete: async (req) => { if (req.timeoutMs < 5000) { await sleep(req.timeoutMs); throw new Error('The model did not answer before the time limit.'); } return 'ANSWER: 1'; },
    });
    expect(Date.now() - t0).toBeLessThan(2000);
    const live = round.results.find((r) => r.agentId === 'live1')!;
    expect(live.score).toBe(0);
    expect(live.errors.length).toBeGreaterThan(0);
  });
});
