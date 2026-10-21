import type { AnswerRecord, CompetitionInfo, Criterion } from '../../shared/types.ts';

export interface Task {
  id: string;
  label: string;
  tag: string;
  prompt: string;
}

export interface Grade {
  score: number;
  answers: AnswerRecord[];
  criteria: Criterion[];
  strengths: string[];
  mistakes: string[];
  report?: string;
}

export interface CompetitionDef {
  info: CompetitionInfo;
  /** Task-level instructions appended to the agent's own instructions. Identical for everyone. */
  preamble: string;
  /** Tasks for a given round. Identical for every agent within that round. */
  tasks(round: number): Task[];
  /** Deterministic grading of raw model responses, keyed by task id. */
  grade(round: number, responses: Record<string, string>, errors: Record<string, string>): Grade;
  /** Demo engine only: produces a *simulated* response set. Not produced by any AI model. */
  simulate(round: number, skill: number, rng: () => number): Record<string, string>;
}
