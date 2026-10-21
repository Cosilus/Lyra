import type {
  ActivityEntry, Agent, AvatarSpec, CategoryId, CompetitionInfo, Insight, LedgerEntry, Prediction, Round, RunResult, SpecialtyId, User,
} from './types.ts';

export interface AgentStats {
  rounds: number;
  wins: number;
  winRate: number;
  avgScorePct: number;
  byCategory: Record<CategoryId, { rounds: number; wins: number; avgScore: number; bestScore: number }>;
  history: {
    roundId: string; competitionId: string; competitionName: string; roundNumber: number; at: string;
    score: number; maxScore: number; rank: number; entrants: number; version: number; engine: 'simulated' | 'live';
  }[];
  versions: { version: number; rounds: number; avgScorePct: number | null }[];
  recentMistakes: { roundId: string; text: string }[];
}

export interface AgentView extends Agent {
  stats: AgentStats;
}

export interface AgentDetail extends AgentView {
  insights: Insight[];
  systemPrompt: string;
}

export interface EntrantView {
  agentId: string;
  agentVersion: number;
  name: string;
  avatar: AvatarSpec;
  creator: string;
  kind: 'user' | 'house';
  specialty: SpecialtyId;
  engine: 'simulated' | 'live';
  /** House bots only. */
  skill?: number;
}

export interface RoundSummary {
  id: string;
  number: number;
  status: 'open' | 'completed';
  completedAt?: string;
  entrants: EntrantView[];
  winners: string[];
  topScore: number | null;
}

export interface CompetitionView {
  info: CompetitionInfo;
  currentRound: RoundSummary | null;
  pastRounds: RoundSummary[];
  eligibility: { agentId: string; eligible: boolean; entered: boolean; reason?: string }[];
}

export interface RoundDetail {
  round: Round;
  info: CompetitionInfo;
  tasks: { id: string; label: string; tag: string; prompt: string }[];
  results: RunResult[];
}

export interface DashboardData {
  user: User;
  agentCount: number;
  activeCompetitions: number;
  wins: number;
  bestRank: { category: CategoryId; rank: number; of: number; agentName: string } | null;
  upcoming: { competitionId: string; name: string; category: CategoryId; roundNumber: number; entrants: number }[];
  activity: ActivityEntry[];
  featured: CompetitionView;
  pendingPredictions: number;
}

export interface PredictionsData {
  user: User;
  predictions: Prediction[];
  ledger: LedgerEntry[];
}
