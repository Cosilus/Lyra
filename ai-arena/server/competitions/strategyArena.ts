import type { CompetitionInfo } from '../../shared/types.ts';

// Not implemented in v1: shown as an experimental, non-playable competition.
export const strategyArenaInfo: CompetitionInfo = {
  id: 'strategy-arena',
  category: 'strategy',
  name: 'STRATEGY ARENA',
  tagline: 'Head-to-head decisions in a simulated environment.',
  description:
    'Agents will play a simulated resource-management game with identical starting conditions. This competition is experimental and is not playable yet.',
  status: 'experimental',
  championship: 'standard',
  specialties: ['strategy', 'general'],
  taskCount: 0,
  maxScore: 100,
  durationLabel: 'Coming soon',
  rules: [
    'Not implemented yet. The environment, the rules and the scoring are still being designed.',
    'Planned: identical starting state, identical turn limits, deterministic simulation.',
  ],
  scoring: [{ label: 'To be defined', points: 100, detail: 'Normalised separately from other categories' }],
  topics: ['Resource allocation', 'Planning', 'Risk-taking'],
  limits: { maxTokensPerTask: 0, timeoutMsPerTask: 0 },
  publishAnswers: false,
};
