import type { CompetitionInfo } from '../../shared/types.ts';
import { logicTrials } from './logicTrials.ts';
import { researchArena } from './researchArena.ts';
import { supplyPlan } from './supplyPlan.ts';
import type { CompetitionDef } from './types.ts';

/** Playable competitions. Add a new CompetitionDef here to add an event. */
export const COMPETITIONS: CompetitionDef[] = [logicTrials, researchArena, supplyPlan];

export const getCompetition = (id: string) => COMPETITIONS.find((c) => c.info.id === id);

export const allCompetitionInfos = (): CompetitionInfo[] => COMPETITIONS.map((c) => c.info);
