import type { AnswerRecord, Criterion } from '../../shared/types.ts';
import { config } from '../config.ts';
import { makeRng } from '../rng.ts';
import { extractAnswer } from './logicTrials.ts';
import type { CompetitionDef } from './types.ts';

// A deterministic planning game: no luck, fully known data, solved exactly by dynamic programming.
export const DAYS = 8;
export const MAX_PRODUCE = 10;
export const STORAGE_CAP = 12;
export const HOLD_COST = 1;

export interface Scenario { demand: number[]; price: number[]; cost: number[] }

/** Each round has its own scenario, generated from the round number so every agent gets the same one. */
export function scenarioFor(round: number): Scenario {
  const rng = makeRng(`supply-plan:${round}`);
  const pick = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  return {
    demand: Array.from({ length: DAYS }, () => pick(2, 10)),
    price: Array.from({ length: DAYS }, () => pick(8, 14)),
    cost: Array.from({ length: DAYS }, () => pick(3, 8)),
  };
}

export interface Outcome { profit: number; discarded: number; log: string[] }

/** Applies a plan day by day. Stock above the storage cap is discarded. */
export function evaluate(s: Scenario, plan: number[]): Outcome {
  let stock = 0, profit = 0, discarded = 0;
  const log: string[] = [];
  for (let d = 0; d < DAYS; d++) {
    const avail = stock + plan[d];
    const sold = Math.min(s.demand[d], avail);
    const rem = avail - sold;
    const kept = Math.min(STORAGE_CAP, rem);
    discarded += rem - kept;
    const day = s.price[d] * sold - s.cost[d] * plan[d] - HOLD_COST * kept;
    profit += day;
    log.push(`Day ${d + 1}: produce ${plan[d]}, sell ${sold}/${s.demand[d]}, store ${kept}${rem > kept ? `, discard ${rem - kept}` : ''}, profit ${day}`);
    stock = kept;
  }
  return { profit, discarded, log };
}

/** Exact optimum by dynamic programming over (day, stock). */
export function optimal(s: Scenario): { profit: number; plan: number[] } {
  const f: number[][] = Array.from({ length: DAYS + 1 }, () => Array(STORAGE_CAP + 1).fill(0));
  const best: number[][] = Array.from({ length: DAYS }, () => Array(STORAGE_CAP + 1).fill(0));
  for (let d = DAYS - 1; d >= 0; d--) {
    for (let st = 0; st <= STORAGE_CAP; st++) {
      let bv = -Infinity;
      for (let p = 0; p <= MAX_PRODUCE; p++) {
        const avail = st + p, sold = Math.min(s.demand[d], avail);
        const kept = Math.min(STORAGE_CAP, avail - sold);
        const v = s.price[d] * sold - s.cost[d] * p - HOLD_COST * kept + f[d + 1][kept];
        if (v > bv) { bv = v; best[d][st] = p; }
      }
      f[d][st] = bv;
    }
  }
  const plan: number[] = [];
  let st = 0;
  for (let d = 0; d < DAYS; d++) {
    const p = best[d][st];
    plan.push(p);
    const avail = st + p;
    st = Math.min(STORAGE_CAP, avail - Math.min(s.demand[d], avail));
  }
  return { profit: f[0][0], plan };
}

/** Returns the plan, or null with a reason when the answer is not a valid plan. */
export function parsePlan(raw: string): { plan: number[] | null; reason?: string } {
  const a = extractAnswer(raw);
  if (a === null) return { plan: null, reason: 'No "ANSWER:" line found.' };
  if (/\d\.\d/.test(a)) return { plan: null, reason: 'Quantities must be whole numbers.' };
  const nums = (a.match(/-?\d+/g) ?? []).map(Number);
  if (nums.length !== DAYS) return { plan: null, reason: `Expected ${DAYS} quantities, found ${nums.length}.` };
  if (nums.some((n) => n < 0 || n > MAX_PRODUCE)) return { plan: null, reason: `Each quantity must be between 0 and ${MAX_PRODUCE}.` };
  return { plan: nums };
}

const promptFor = (s: Scenario) => `You run a small workshop for ${DAYS} days and must decide how many units to produce each day.

Rules:
- Produce between 0 and ${MAX_PRODUCE} units per day. Production is available the same day.
- Each day you sell min(demand, units available) at that day's price. Unsold units stay in storage.
- Storage holds at most ${STORAGE_CAP} units overnight; anything above that is discarded.
- Holding cost: ${HOLD_COST} per unit left in storage at the end of each day.
- You start with 0 units. Profit = sales revenue - production cost - holding cost. Leftover stock at the end is worth nothing.

Day | Demand | Price | Unit cost
${s.demand.map((d, i) => `${i + 1} | ${d} | ${s.price[i]} | ${s.cost[i]}`).join('\n')}

Choose the production plan that maximises total profit.
Reply with the plan only, on a single line, in exactly this format: ANSWER: [q1, q2, q3, q4, q5, q6, q7, q8]`;

export const supplyPlan: CompetitionDef = {
  info: {
    id: 'supply-plan',
    category: 'strategy',
    name: 'THE SUPPLY PLAN',
    tagline: 'Plan production against known demand, prices and costs.',
    description:
      'A deterministic planning game. Every agent gets the same 8-day scenario and submits a production plan. The plan is simulated and compared to the mathematically optimal plan. There is no luck involved.',
    status: 'live',
    championship: 'standard',
    specialties: ['strategy', 'general', 'math_logic'],
    taskCount: 1,
    maxScore: 100,
    durationLabel: '1 plan · under 1 min',
    rules: [
      'Standard championship: same scenario, same instructions and same limits for every agent. A new scenario is generated for every round.',
      'The answer must be 8 whole numbers between 0 and 10 on a line starting with "ANSWER:". Anything else is an invalid plan.',
      'Scoring is a fixed simulation, not a model judgement. The optimal plan is computed exactly and published with the results.',
      'A round never lasts more than 60 seconds. A plan not delivered by the deadline scores 0.',
    ],
    scoring: [
      { label: 'Profit versus the optimum', points: 80, detail: '80 × (your profit ÷ optimal profit), never below 0' },
      { label: 'Valid plan', points: 10, detail: 'Correct format and quantities in range' },
      { label: 'No waste', points: 10, detail: 'No unit discarded for exceeding storage' },
    ],
    topics: ['Planning', 'Resource allocation', 'Trade-offs under constraints'],
    limits: { maxTokensPerTask: 500, timeoutMsPerTask: 30000, roundDeadlineMs: config.roundDeadlineMs },
    publishAnswers: true,
  },
  preamble: 'You are solving a closed planning problem. Work it out carefully; no tools are available.',
  tasks: (round) => [{ id: 'plan', label: 'Production plan', tag: 'plan', prompt: promptFor(scenarioFor(round)) }],

  grade(round, responses, errors) {
    const raw = responses.plan ?? '';
    const sc = scenarioFor(round);
    const opt = optimal(sc);
    const parsed = parsePlan(raw);
    const out = parsed.plan ? evaluate(sc, parsed.plan) : null;
    const ratio = out ? Math.max(0, out.profit) / opt.profit : 0;
    const profitPts = Math.round(80 * ratio);
    const validPts = parsed.plan ? 10 : 0;
    const wastePts = parsed.plan && out!.discarded === 0 ? 10 : 0;
    const criteria: Criterion[] = [
      { id: 'profit', label: 'Profit versus the optimum', earned: profitPts, max: 80, items: [{ label: out ? `Profit ${out.profit} of ${opt.profit} possible (${Math.round(ratio * 100)}%)` : 'No valid plan to simulate', earned: profitPts, max: 80 }] },
      { id: 'valid', label: 'Valid plan', earned: validPts, max: 10, items: [{ label: 'Format and ranges', earned: validPts, max: 10, note: parsed.reason ?? 'Valid' }] },
      { id: 'waste', label: 'No waste', earned: wastePts, max: 10, items: [{ label: out ? `${out.discarded} unit(s) discarded` : 'Not evaluated', earned: wastePts, max: 10 }] },
    ];
    const score = profitPts + validPts + wastePts;
    const err = errors.plan;
    const log = [
      `Agent plan:   ${parsed.plan ? `[${parsed.plan.join(', ')}]` : 'invalid'}`,
      `Optimal plan: [${opt.plan.join(', ')}] (profit ${opt.profit})`,
      '',
      ...(out ? out.log : ['No simulation: the plan was invalid.']),
    ].join('\n');
    const note = err ? `Model call failed: ${err}` : parsed.reason;
    const answers: AnswerRecord[] = [{ taskId: 'plan', label: 'Production plan', tag: 'plan', raw, parsed: parsed.plan ? `[${parsed.plan.join(', ')}]` : null, correct: null, points: score, max: 100, expected: `[${opt.plan.join(', ')}]`, note }];
    const strengths = criteria.filter((c) => c.earned === c.max).map((c) => `${c.label}: full marks`);
    const mistakes: string[] = [];
    if (err) mistakes.push(`Model call failed: ${err}`);
    else if (parsed.reason) mistakes.push(`Invalid plan: ${parsed.reason}`);
    else {
      if (ratio < 1) mistakes.push(`Profit ${out!.profit} versus ${opt.profit} possible`);
      if (out!.discarded) mistakes.push(`${out!.discarded} unit(s) discarded because storage was full`);
    }
    return { score, answers, criteria, strengths, mistakes, report: log };
  },

  /** Demo engine: follows the optimal plan day by day with probability `skill`, otherwise picks a random quantity. */
  simulate(round, skill, rng) {
    const opt = optimal(scenarioFor(round)).plan;
    const plan = opt.map((p) => (rng() < skill ? p : Math.floor(rng() * (MAX_PRODUCE + 1))));
    return { plan: `[simulated] ANSWER: [${plan.join(', ')}]` };
  },
};
