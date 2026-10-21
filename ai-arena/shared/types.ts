// Types shared by the browser app and the Express server.

export type PersonalityId = 'calm' | 'aggressive' | 'prudent' | 'creative' | 'analytical' | 'balanced';
export type SpecialtyId = 'math_logic' | 'research' | 'crypto' | 'strategy' | 'general';
export type StrategyId =
  | 'accuracy_first'
  | 'speed_first'
  | 'risk_management'
  | 'deep_analysis'
  | 'balanced_performance'
  | 'step_by_step'
  | 'evidence_first';
export type ProviderId = 'demo' | 'anthropic';
export type CategoryId = 'brain' | 'research' | 'strategy';

export interface AgentConfig {
  personality: PersonalityId;
  specialty: SpecialtyId;
  strategy: StrategyId;
  /** Free-text extra instructions written by the user. */
  instructions: string;
  provider: ProviderId;
}

export interface AvatarSpec {
  icon: string;
  color: string;
}

export interface AgentVersion {
  version: number;
  createdAt: string;
  note: string;
  config: AgentConfig;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  avatar: AvatarSpec;
  kind: 'user' | 'house';
  creator: string;
  /** House bots only: published probability of solving a task in the simulator. */
  skill?: number;
  createdAt: string;
  updatedAt: string;
  version: number;
  config: AgentConfig;
  versions: AgentVersion[];
}

export interface EngineInfo {
  kind: 'simulated' | 'live';
  provider: ProviderId;
  model: string;
}

export interface AnswerRecord {
  taskId: string;
  label: string;
  tag: string;
  raw: string;
  parsed: string | null;
  correct: boolean | null;
  points: number;
  max: number;
  expected?: string;
  explanation?: string;
  note?: string;
}

export interface CriterionItem {
  label: string;
  earned: number;
  max: number;
  note?: string;
}

export interface Criterion {
  id: string;
  label: string;
  earned: number;
  max: number;
  items: CriterionItem[];
}

export interface RunResult {
  agentId: string;
  agentName: string;
  creator: string;
  kind: 'user' | 'house';
  avatar: AvatarSpec;
  specialty: SpecialtyId;
  agentVersion: number;
  engine: EngineInfo;
  score: number;
  maxScore: number;
  rank: number;
  answers: AnswerRecord[];
  criteria: Criterion[];
  /** Raw free-text report (Research Arena). */
  report?: string;
  strengths: string[];
  mistakes: string[];
  durationMs: number;
  errors: string[];
  /** The exact instructions the agent ran with. */
  systemPrompt: string;
}

export interface Entrant {
  agentId: string;
  agentVersion: number;
  enteredAt: string;
}

export interface Round {
  id: string;
  competitionId: string;
  number: number;
  status: 'open' | 'completed';
  createdAt: string;
  completedAt?: string;
  entrants: Entrant[];
  results: RunResult[];
}

export interface Prediction {
  id: string;
  roundId: string;
  competitionId: string;
  agentId: string;
  agentName: string;
  stake: number;
  /** Payout multiplier locked at placement time (= number of entrants). */
  multiplier: number;
  status: 'pending' | 'won' | 'lost' | 'refunded';
  payout: number;
  createdAt: string;
  settledAt?: string;
}

export interface LedgerEntry {
  id: string;
  at: string;
  delta: number;
  balanceAfter: number;
  reason: string;
}

export interface ActivityEntry {
  id: string;
  at: string;
  text: string;
  link?: string;
}

export interface User {
  id: string;
  name: string;
  points: number;
  createdAt: string;
}

export interface Db {
  schema: 1;
  user: User;
  agents: Agent[];
  rounds: Round[];
  predictions: Prediction[];
  ledger: LedgerEntry[];
  activity: ActivityEntry[];
}

/** What the browser is allowed to know about a competition (never the expected answers). */
export interface CompetitionInfo {
  id: string;
  category: CategoryId;
  name: string;
  tagline: string;
  description: string;
  status: 'live' | 'experimental';
  championship: 'standard';
  specialties: SpecialtyId[];
  taskCount: number;
  maxScore: number;
  durationLabel: string;
  rules: string[];
  scoring: { label: string; points: number; detail: string }[];
  topics: string[];
  limits: { maxTokensPerTask: number; timeoutMsPerTask: number; roundDeadlineMs: number };
  publishAnswers: boolean;
}

export interface AppConfig {
  mode: 'local-demo';
  providers: { id: ProviderId; label: string; available: boolean; model: string; note: string }[];
  startingPoints: number;
  minStake: number;
}

export interface LeaderboardRow {
  rank: number;
  agentId: string;
  agentName: string;
  avatar: AvatarSpec;
  creator: string;
  kind: 'user' | 'house';
  specialty: SpecialtyId;
  avgScore: number;
  bestScore: number;
  wins: number;
  rounds: number;
  winRate: number;
  engine: 'simulated' | 'live' | 'mixed';
}

export interface Insight {
  tone: 'good' | 'warn' | 'info';
  text: string;
}
