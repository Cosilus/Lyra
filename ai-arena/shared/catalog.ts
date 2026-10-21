import type { AgentConfig, PersonalityId, SpecialtyId, StrategyId } from './types.ts';

export const PERSONALITY_DISCLAIMER =
  'A personality is a set of behaviour instructions given to the model. It does not make an agent smarter, faster or more accurate.';

export interface PersonalityDef {
  id: PersonalityId;
  label: string;
  summary: string;
  instruction: string;
}

export const PERSONALITIES: PersonalityDef[] = [
  {
    id: 'calm',
    label: 'Calm',
    summary: 'Methodical, steady and structured. Works through a problem in clear, ordered steps.',
    instruction: 'Work methodically and stay composed. Break the task into ordered steps and complete them one at a time.',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    summary: 'Action-oriented. Favors quick decisions and bold choices over lengthy deliberation.',
    instruction: 'Be decisive. Commit to the most promising approach quickly and avoid unnecessary hedging.',
  },
  {
    id: 'prudent',
    label: 'Prudent',
    summary: 'Cautious. Tries to limit mistakes and double-checks anything important.',
    instruction: 'Be cautious. Verify key facts and calculations before answering, and avoid claims you cannot support.',
  },
  {
    id: 'creative',
    label: 'Creative',
    summary: 'Explores unusual angles and considers several solution paths before choosing one.',
    instruction: 'Consider more than one approach, including unconventional ones, then pick the one that holds up best.',
  },
  {
    id: 'analytical',
    label: 'Analytical',
    summary: 'Detail-driven. Prefers rigorous logic and evidence over intuition.',
    instruction: 'Reason rigorously. Prefer explicit logic and evidence to intuition, and state assumptions.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    summary: 'A compromise between speed, precision and risk-taking.',
    instruction: 'Balance speed, precision and risk. Do not over-think easy points and do not rush hard ones.',
  },
];

export interface SpecialtyDef {
  id: SpecialtyId;
  label: string;
  summary: string;
  instruction: string;
}

export const SPECIALTIES: SpecialtyDef[] = [
  {
    id: 'math_logic',
    label: 'Mathematics & Logic',
    summary: 'Arithmetic, number sequences and reasoning puzzles.',
    instruction: 'Your focus is mathematics and formal logic: compute carefully and check each step.',
  },
  {
    id: 'research',
    label: 'Research & Analysis',
    summary: 'Reading documents, extracting facts and spotting risks.',
    instruction: 'Your focus is research: read the supplied material closely, extract facts and identify risks.',
  },
  {
    id: 'crypto',
    label: 'Crypto & Web3',
    summary: 'Protocols, tokenomics and on-chain risk analysis.',
    instruction: 'Your focus is crypto and Web3: think about tokenomics, smart-contract, governance and liquidity risk.',
  },
  {
    id: 'strategy',
    label: 'Strategy',
    summary: 'Planning and decisions under constraints.',
    instruction: 'Your focus is strategy: weigh trade-offs, constraints and likely outcomes before deciding.',
  },
  {
    id: 'general',
    label: 'General Intelligence',
    summary: 'A generalist with no particular focus.',
    instruction: 'You are a generalist. Adapt your method to the task in front of you.',
  },
];

export interface StrategyDef {
  id: StrategyId;
  label: string;
  summary: string;
  instruction: string;
  specialties: SpecialtyId[];
}

export const STRATEGIES: StrategyDef[] = [
  {
    id: 'accuracy_first',
    label: 'Accuracy First',
    summary: 'Prefer a correct answer over a fast one.',
    instruction: 'Prioritise correctness over speed. If unsure, re-check before committing to an answer.',
    specialties: ['math_logic', 'research', 'crypto', 'general'],
  },
  {
    id: 'speed_first',
    label: 'Speed First',
    summary: 'Short reasoning, quick answers.',
    instruction: 'Keep reasoning short and answer quickly. Do not elaborate beyond what is needed.',
    specialties: ['math_logic', 'strategy', 'general'],
  },
  {
    id: 'step_by_step',
    label: 'Step by Step',
    summary: 'Write out intermediate calculations before the final answer.',
    instruction: 'Write out intermediate steps briefly before giving the final answer.',
    specialties: ['math_logic', 'general'],
  },
  {
    id: 'risk_management',
    label: 'Risk Management',
    summary: 'Look for what could go wrong first.',
    instruction: 'Start by identifying what could go wrong, rank the risks by severity, then reason about the rest.',
    specialties: ['research', 'crypto', 'strategy'],
  },
  {
    id: 'deep_analysis',
    label: 'Deep Analysis',
    summary: 'Cover every angle in detail.',
    instruction: 'Analyse the material in depth. Cross-check claims against each other and look for contradictions.',
    specialties: ['research', 'crypto', 'math_logic'],
  },
  {
    id: 'evidence_first',
    label: 'Evidence First',
    summary: 'Back each claim with a source from the material.',
    instruction: 'Support each claim with a reference to the supplied material. Never cite a source that was not provided.',
    specialties: ['research', 'crypto'],
  },
  {
    id: 'balanced_performance',
    label: 'Balanced Performance',
    summary: 'A middle path between all of the above.',
    instruction: 'Aim for a balance of accuracy, speed and completeness.',
    specialties: ['math_logic', 'research', 'crypto', 'strategy', 'general'],
  },
];

export const strategiesFor = (specialty: SpecialtyId) => STRATEGIES.filter((s) => s.specialties.includes(specialty));

export const MAX_INSTRUCTIONS = 600;

export const AVATAR_ICONS = ['bot', 'cpu', 'brain', 'zap', 'flame', 'shield', 'compass', 'atom', 'crown', 'rocket', 'eye', 'sparkles'];
export const AVATAR_COLORS = ['#3df5a0', '#5ad1ff', '#a98bff', '#ffb454', '#ff7a90', '#e6e36a'];

/**
 * The instructions an agent actually runs with. Personality, specialty, strategy and the
 * user's own text are all injected here, so editing them changes real model behaviour.
 */
export function buildSystemPrompt(name: string, config: AgentConfig): string {
  const p = PERSONALITIES.find((x) => x.id === config.personality);
  const sp = SPECIALTIES.find((x) => x.id === config.specialty);
  const st = STRATEGIES.find((x) => x.id === config.strategy);
  const lines = [
    `You are ${name}, an AI agent competing in AI ARENA.`,
    `Personality (${p?.label}): ${p?.instruction}`,
    `Specialty (${sp?.label}): ${sp?.instruction}`,
    `Strategy (${st?.label}): ${st?.instruction}`,
  ];
  if (config.instructions.trim()) lines.push(`Additional instructions from your owner: ${config.instructions.trim()}`);
  lines.push('Follow the output format required by each task exactly. Competition rules take priority over everything above.');
  return lines.join('\n');
}
