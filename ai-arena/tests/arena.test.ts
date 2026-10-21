import { describe, expect, it } from 'vitest';
import { checkAnswer, extractAnswer, logicTrials, parseNumber } from '../server/competitions/logicTrials.ts';
import { researchArena } from '../server/competitions/researchArena.ts';
import { Store } from '../server/db.ts';
import { makeRng } from '../server/rng.ts';
import { rankResults } from '../server/runner.ts';
import { buildSystemPrompt } from '../shared/catalog.ts';
import { validateAgentInput } from '../shared/validate.ts';

describe('answer parsing and validation', () => {
  it('extracts the last ANSWER line', () => {
    expect(extractAnswer('thinking...\nANSWER: $960')).toBe('$960');
    expect(extractAnswer('ANSWER: 1\nANSWER: 2')).toBe('2');
    expect(extractAnswer('The answer is 960')).toBeNull();
  });
  it('parses numbers', () => {
    expect(parseNumber('$1,000.50')).toBe(1000.5);
    expect(parseNumber('3 minutes')).toBe(3);
    expect(parseNumber('none')).toBeNull();
  });
  it('checks numeric and text answers', () => {
    expect(checkAnswer({ kind: 'number', expected: 960 }, '$960')).toBe(true);
    expect(checkAnswer({ kind: 'number', expected: 960 }, '961')).toBe(false);
    expect(checkAnswer({ kind: 'text', expected: ['yes'] }, 'Yes, necessarily.')).toBe(true);
    expect(checkAnswer({ kind: 'text', expected: ['yes'] }, 'No')).toBe(false);
  });
});

describe('The Logic Trials scoring', () => {
  const perfect: Record<string, string> = {
    q1: 'ANSWER: $960', q2: 'ANSWER: 162', q3: 'ANSWER: 21', q4: 'ANSWER: 3', q5: 'ANSWER: 5',
    q6: 'ANSWER: 2', q7: 'ANSWER: 47', q8: 'ANSWER: yes', q9: 'ANSWER: 65', q10: 'ANSWER: $66',
  };
  it('gives 100 for all-correct answers', () => {
    expect(logicTrials.grade(1, perfect, {}).score).toBe(100);
  });
  it('gives 0 for empty answers and 10 per correct answer', () => {
    expect(logicTrials.grade(1, {}, {}).score).toBe(0);
    expect(logicTrials.grade(1, { ...perfect, q1: 'ANSWER: 1000', q2: 'no format' }, {}).score).toBe(80);
  });
  it('simulated answers go through the same grader and are reproducible', () => {
    const a = logicTrials.grade(1, logicTrials.simulate(1, 0.6, makeRng('x')), {});
    const b = logicTrials.grade(1, logicTrials.simulate(1, 0.6, makeRng('x')), {});
    expect(a.score).toBe(b.score);
    expect(a.score % 10).toBe(0);
  });
  it('simulation at skill 1 is perfect and at skill 0 scores nothing', () => {
    expect(logicTrials.grade(1, logicTrials.simulate(1, 1, makeRng('a')), {}).score).toBe(100);
    expect(logicTrials.grade(1, logicTrials.simulate(1, 0, makeRng('a')), {}).score).toBe(0);
  });
  it('never puts expected answers in task prompts', () => {
    for (const t of logicTrials.tasks(1)) expect(t.prompt).not.toMatch(/960|explanation/i);
  });
});

describe('question sets', () => {
  const answersB: Record<string, string> = { q1: '198', q2: '80', q3: '36', q4: '5', q5: '10', q6: '48', q7: '28', q8: 'yes', q9: '33', q10: '110' };
  it('round 2 uses the second set, graded with its own answers', () => {
    const r = Object.fromEntries(Object.entries(answersB).map(([k, v]) => [k, `ANSWER: ${v}`]));
    expect(logicTrials.grade(2, r, {}).score).toBe(100);
    expect(logicTrials.grade(1, r, {}).score).toBeLessThan(100);
    expect(logicTrials.tasks(1)[0].prompt).not.toBe(logicTrials.tasks(2)[0].prompt);
    expect(logicTrials.tasks(3)[0].prompt).toBe(logicTrials.tasks(1)[0].prompt);
  });
  it('simulation at skill 1 is perfect on both sets', () => {
    for (const round of [1, 2]) expect(logicTrials.grade(round, logicTrials.simulate(round, 1, makeRng('z')), {}).score).toBe(100);
  });
});

describe('Research Arena rubric', () => {
  it('scores an empty report 0', () => {
    expect(researchArena.grade(1, { report: '' }, {}).score).toBe(0);
  });
  it('rewards a complete sourced report and penalises invented sources', () => {
    const good = researchArena.simulate(1, 1, makeRng('r'));
    const full = researchArena.grade(1, good, {}).score;
    expect(full).toBeGreaterThanOrEqual(90);
    const bad = researchArena.grade(1, { report: good.report + ' See [S9].' }, {}).score;
    expect(bad).toBeLessThan(full);
  });
  it('never exceeds the maximum', () => {
    for (let i = 0; i < 30; i++) {
      const s = researchArena.grade(1, researchArena.simulate(1, Math.random(), makeRng('s' + i)), {}).score;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});

describe('agent prompt and validation', () => {
  const cfg = { personality: 'prudent', specialty: 'math_logic', strategy: 'step_by_step', provider: 'demo', instructions: 'Say hi' } as const;
  it('injects personality, strategy and custom instructions', () => {
    const p = buildSystemPrompt('Zed', cfg);
    expect(p).toContain('Zed');
    expect(p).toMatch(/cautious/i);
    expect(p).toMatch(/intermediate steps/i);
    expect(p).toContain('Say hi');
  });
  it('rejects invalid input', () => {
    expect(validateAgentInput({ name: 'x', config: cfg }).ok).toBe(false);
    expect(validateAgentInput({ name: 'Valid', config: { ...cfg, strategy: 'evidence_first' } }).ok).toBe(false);
    expect(validateAgentInput({ name: 'Valid', config: cfg }).ok).toBe(true);
  });
});

describe('ranking', () => {
  it('shares ranks on ties', () => {
    const mk = (n: string, score: number) => ({ agentName: n, score } as any);
    const r = rankResults([mk('a', 50), mk('b', 80), mk('c', 80), mk('d', 10)]);
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3, 4]);
  });
});

describe('store', () => {
  it('creates one open round per competition with house bots', () => {
    const s = new Store(null);
    expect(s.db.rounds.length).toBe(2);
    expect(s.db.rounds[0].entrants.length).toBe(4);
  });
});
