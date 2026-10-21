import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildSystemPrompt } from '../shared/catalog.ts';
import type { ActivityEntry, Agent, AgentConfig, Db, Round } from '../shared/types.ts';
import { COMPETITIONS } from './competitions/index.ts';
import { config } from './config.ts';

// The whole app state lives in one JSON file behind this tiny repository layer.
// To move to PostgreSQL later, replace this class and keep the function signatures used by the routes.

export const newId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

const HOUSE_BOTS: { name: string; skill: number; icon: string; color: string; personality: AgentConfig['personality'] }[] = [
  { name: 'Orbit-45', skill: 0.45, icon: 'compass', color: '#ffb454', personality: 'creative' },
  { name: 'Vector-55', skill: 0.55, icon: 'cpu', color: '#5ad1ff', personality: 'balanced' },
  { name: 'Quark-65', skill: 0.65, icon: 'atom', color: '#a98bff', personality: 'analytical' },
  { name: 'Helix-75', skill: 0.75, icon: 'eye', color: '#ff7a90', personality: 'prudent' },
];

function houseBots(now: string): Agent[] {
  return HOUSE_BOTS.map((b) => {
    const cfg: AgentConfig = { personality: b.personality, specialty: 'general', strategy: 'balanced_performance', instructions: '', provider: 'demo' };
    return {
      id: `house_${b.name.toLowerCase()}`,
      name: b.name,
      description: `Simulated opponent. Solves each task with a published probability of ${Math.round(b.skill * 100)}%.`,
      avatar: { icon: b.icon, color: b.color },
      kind: 'house', creator: 'Arena Bots', skill: b.skill,
      createdAt: now, updatedAt: now, version: 1, config: cfg,
      versions: [{ version: 1, createdAt: now, note: 'Built-in simulated opponent', config: cfg }],
    };
  });
}

export function freshDb(): Db {
  const now = new Date().toISOString();
  return {
    schema: 1,
    user: { id: 'local-demo', name: 'Demo Player', points: config.startingPoints, createdAt: now },
    agents: houseBots(now),
    rounds: [],
    predictions: [],
    ledger: [{ id: newId('led'), at: now, delta: config.startingPoints, balanceAfter: config.startingPoints, reason: 'Starting virtual points' }],
    activity: [],
  };
}

export class Store {
  db: Db;
  constructor(private file: string | null) {
    this.db = file && fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Db) : freshDb();
    this.ensureOpenRounds();
    this.save();
  }

  /** Atomic write: temp file then rename, so a crash cannot leave a half-written database. */
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }

  reset() {
    this.db = freshDb();
    this.ensureOpenRounds();
    this.save();
  }

  agent(id: string) {
    return this.db.agents.find((a) => a.id === id);
  }

  openRound(competitionId: string): Round | undefined {
    return this.db.rounds.find((r) => r.competitionId === competitionId && r.status === 'open');
  }

  /** Every playable competition always has exactly one open round, pre-filled with the house bots. */
  ensureOpenRounds() {
    for (const c of COMPETITIONS) {
      if (this.openRound(c.info.id)) continue;
      const number = this.db.rounds.filter((r) => r.competitionId === c.info.id).length + 1;
      const now = new Date().toISOString();
      this.db.rounds.push({
        id: newId('round'), competitionId: c.info.id, number, status: 'open', createdAt: now, results: [],
        entrants: this.db.agents.filter((a) => a.kind === 'house').map((a) => ({ agentId: a.id, agentVersion: a.version, enteredAt: now })),
      });
    }
  }

  log(text: string, link?: string) {
    const e: ActivityEntry = { id: newId('act'), at: new Date().toISOString(), text, link };
    this.db.activity.unshift(e);
    this.db.activity.length = Math.min(this.db.activity.length, 60);
  }

  addPoints(delta: number, reason: string) {
    this.db.user.points += delta;
    this.db.ledger.unshift({ id: newId('led'), at: new Date().toISOString(), delta, balanceAfter: this.db.user.points, reason });
    this.db.ledger.length = Math.min(this.db.ledger.length, 200);
  }
}

export const promptFor = (agent: Agent, version = agent.version) =>
  buildSystemPrompt(agent.name, agent.versions.find((v) => v.version === version)?.config ?? agent.config);
