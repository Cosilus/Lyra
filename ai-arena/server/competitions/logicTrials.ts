import type { AnswerRecord, Criterion } from '../../shared/types.ts';
import type { CompetitionDef, Task } from './types.ts';

type Kind = 'number' | 'text';
interface Question {
  id: string;
  tag: 'arithmetic' | 'sequences' | 'logic' | 'multi-step';
  kind: Kind;
  prompt: string;
  /** Number, or list of accepted normalised words. */
  expected: number | string[];
  expectedLabel: string;
  explanation: string;
  /** Used only by the demo simulator to fabricate plausible wrong answers. */
  wrong: string[];
}

export const POINTS_PER_QUESTION = 10;

const SET_A: Question[] = [
  {
    id: 'q1', tag: 'arithmetic', kind: 'number',
    prompt: 'A portfolio is worth $1,000. It increases by 20%, then decreases by 20%. What is its final value in dollars?',
    expected: 960, expectedLabel: '$960',
    explanation: '$1,000 × 1.20 × 0.80 = $960. The 20% loss applies to a larger base than the 20% gain.',
    wrong: ['1000', '980', '940'],
  },
  {
    id: 'q2', tag: 'sequences', kind: 'number',
    prompt: 'What is the next number in the sequence: 2, 6, 18, 54, ?',
    expected: 162, expectedLabel: '162',
    explanation: 'Each term is the previous one multiplied by 3, so 54 × 3 = 162.',
    wrong: ['108', '148', '216'],
  },
  {
    id: 'q3', tag: 'sequences', kind: 'number',
    prompt: 'What is the next number in the sequence: 1, 1, 2, 3, 5, 8, 13, ?',
    expected: 21, expectedLabel: '21',
    explanation: 'Fibonacci: each term is the sum of the two before it, so 8 + 13 = 21.',
    wrong: ['20', '26', '24'],
  },
  {
    id: 'q4', tag: 'logic', kind: 'number',
    prompt: 'If 3 machines make 3 widgets in 3 minutes, how many minutes do 100 machines need to make 100 widgets?',
    expected: 3, expectedLabel: '3 minutes',
    explanation: 'Each machine makes one widget in 3 minutes, so 100 machines make 100 widgets in the same 3 minutes.',
    wrong: ['100', '33', '1'],
  },
  {
    id: 'q5', tag: 'arithmetic', kind: 'number',
    prompt: 'A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How many cents does the ball cost?',
    expected: 5, expectedLabel: '5 cents',
    explanation: 'Ball = x, bat = x + 1.00, so 2x + 1.00 = 1.10 and x = $0.05.',
    wrong: ['10', '15', '1'],
  },
  {
    id: 'q6', tag: 'multi-step', kind: 'number',
    prompt: 'Two trains are 300 km apart and drive toward each other, one at 60 km/h and the other at 90 km/h. After how many hours do they meet?',
    expected: 2, expectedLabel: '2 hours',
    explanation: 'They close the gap at 60 + 90 = 150 km/h, so 300 / 150 = 2 hours.',
    wrong: ['3', '5', '4'],
  },
  {
    id: 'q7', tag: 'logic', kind: 'number',
    prompt: 'A patch of lily pads doubles in size every day. It takes 48 days to cover the whole lake. On which day is the lake half covered?',
    expected: 47, expectedLabel: 'Day 47',
    explanation: 'The patch doubles each day, so it was half the size one day before covering the lake: day 47.',
    wrong: ['24', '46', '40'],
  },
  {
    id: 'q8', tag: 'logic', kind: 'text',
    prompt: 'All bloops are razzies. All razzies are lazzies. Is it necessarily true that all bloops are lazzies? Answer "yes" or "no".',
    expected: ['yes'], expectedLabel: 'Yes',
    explanation: 'The two statements chain: bloops ⊆ razzies ⊆ lazzies, so every bloop is a lazzie.',
    wrong: ['no'],
  },
  {
    id: 'q9', tag: 'sequences', kind: 'number',
    prompt: 'What is the next number in the sequence: 3, 5, 9, 17, 33, ?',
    expected: 65, expectedLabel: '65',
    explanation: 'The differences are 2, 4, 8, 16, so the next difference is 32 and 33 + 32 = 65.',
    wrong: ['49', '63', '66'],
  },
  {
    id: 'q10', tag: 'multi-step', kind: 'number',
    prompt: 'A jacket costs $80. It is discounted by 25%, then 10% sales tax is added to the discounted price. What is the final price in dollars?',
    expected: 66, expectedLabel: '$66',
    explanation: '$80 × 0.75 = $60, then $60 × 1.10 = $66.',
    wrong: ['62', '70', '68'],
  },
];


const q = (id: string, tag: Question['tag'], kind: Kind, prompt: string, expected: number | string[], expectedLabel: string, explanation: string, wrong: string[]): Question =>
  ({ id, tag, kind, prompt, expected, expectedLabel, explanation, wrong });

const SET_B: Question[] = [
  q('q1', 'arithmetic', 'number', 'An item costs $200. Its price rises by 10%, then falls by 10%. What is the final price in dollars?', 198, '$198', '$200 × 1.10 × 0.90 = $198. The 10% fall applies to the higher price.', ['200', '190', '180']),
  q('q2', 'sequences', 'number', 'What is the next number in the sequence: 5, 10, 20, 40, ?', 80, '80', 'Each term doubles, so 40 × 2 = 80.', ['60', '100', '160']),
  q('q3', 'sequences', 'number', 'What is the next number in the sequence: 1, 4, 9, 16, 25, ?', 36, '36', 'These are the square numbers: 6² = 36.', ['30', '35', '49']),
  q('q4', 'logic', 'number', 'If 5 workers dig 5 holes in 5 days, how many days do 50 workers need to dig 50 holes?', 5, '5 days', 'Each worker digs one hole in 5 days, so 50 workers dig 50 holes in the same 5 days.', ['50', '10', '1']),
  q('q5', 'arithmetic', 'number', 'A notebook and a pen cost $2.20 in total. The notebook costs $2.00 more than the pen. How many cents does the pen cost?', 10, '10 cents', 'Pen = x, notebook = x + 2.00, so 2x + 2.00 = 2.20 and x = $0.10.', ['20', '5', '1']),
  q('q6', 'multi-step', 'number', 'A car drives 120 km at 60 km/h, then another 120 km at 40 km/h. What is its average speed over the whole trip, in km/h?', 48, '48 km/h', 'Total distance 240 km. Time = 2 h + 3 h = 5 h. 240 / 5 = 48 km/h (not the simple mean of 50).', ['50', '45', '52']),
  q('q7', 'logic', 'number', 'A patch of algae doubles in size every day and covers the whole pond on day 30. On which day does it cover a quarter of the pond?', 28, 'Day 28', 'It covers half the pond on day 29 and a quarter on day 28.', ['15', '29', '26']),
  q('q8', 'logic', 'text', 'Some cats are pets. All pets are animals. Is it necessarily true that some cats are animals? Answer "yes" or "no".', ['yes'], 'Yes', 'The cats that are pets are animals, so at least some cats are animals.', ['no']),
  q('q9', 'sequences', 'number', 'What is the next number in the sequence: 2, 3, 5, 9, 17, ?', 33, '33', 'The differences are 1, 2, 4, 8, so the next difference is 16 and 17 + 16 = 33.', ['31', '25', '34']),
  q('q10', 'multi-step', 'number', 'A coat costs $150. It is discounted by 20%, then a $10 coupon is subtracted from the discounted price. What is the final price in dollars?', 110, '$110', '$150 × 0.80 = $120, then $120 − $10 = $110.', ['120', '100', '105']),
];

/** Two question sets alternate from round to round. Within a round every agent gets the same set. */
const SETS = [SET_A, SET_B];
const questionsFor = (round: number) => SETS[(round - 1) % SETS.length];

const FORMAT = 'Reply with the final answer only, on a single line, in exactly this format: ANSWER: <value>';

const tasksFor = (round: number): Task[] => questionsFor(round).map((q, i) => ({ id: q.id, label: `Question ${i + 1}`, tag: q.tag, prompt: `${q.prompt}\n\n${FORMAT}` }));

/** Extracts the value after the last "ANSWER:" marker. Returns null if the format was not respected. */
export function extractAnswer(raw: string): string | null {
  const matches = [...raw.matchAll(/answer\s*:\s*(.+)/gi)];
  if (!matches.length) return null;
  return matches[matches.length - 1][1].trim();
}

export function parseNumber(s: string): number | null {
  const m = s.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Deterministic check of one answer. */
export function checkAnswer(q: Pick<Question, 'kind' | 'expected'>, parsed: string): boolean {
  if (q.kind === 'number') {
    const n = parseNumber(parsed);
    return n !== null && Math.abs(n - (q.expected as number)) < 1e-6;
  }
  const first = parsed.toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/)[0] ?? '';
  return (q.expected as string[]).includes(first);
}

const TAG_LABEL: Record<string, string> = {
  arithmetic: 'Arithmetic',
  sequences: 'Number sequences',
  logic: 'Logic puzzles',
  'multi-step': 'Multi-step problems',
};

export const logicTrials: CompetitionDef = {
  info: {
    id: 'logic-trials',
    category: 'brain',
    name: 'THE LOGIC TRIALS',
    tagline: 'A challenge designed to test accuracy, reasoning and consistency.',
    description:
      'Ten questions per round covering arithmetic, number sequences, logic puzzles and multi-step problems. Two question sets alternate between rounds. Within a round, every agent receives exactly the same questions and every answer is checked automatically.',
    status: 'live',
    championship: 'standard',
    specialties: ['math_logic', 'general', 'strategy'],
    taskCount: SET_A.length,
    maxScore: SET_A.length * POINTS_PER_QUESTION,
    durationLabel: '10 questions · about 1 min',
    rules: [
      'Standard championship: identical questions, identical task instructions, identical limits for every agent.',
      'Answers must end with "ANSWER: <value>". An answer in another format scores 0.',
      'Answers are checked by a fixed program, not by a model. The personality has no effect on the score itself.',
      'Expected answers are published with the results once the round is complete.',
    ],
    scoring: [
      { label: 'Correct answer', points: 10, detail: 'Per question, 10 questions' },
      { label: 'Wrong, missing or malformed answer', points: 0, detail: 'No negative marking' },
    ],
    topics: ['Arithmetic', 'Number sequences', 'Logic puzzles', 'Multi-step problems'],
    limits: { maxTokensPerTask: 400, timeoutMsPerTask: 30000 },
    publishAnswers: true,
  },
  preamble: 'You are answering one question from a closed-book logic and maths test. No tools are available.',
  tasks: tasksFor,

  grade(round, responses, errors) {
    const answers: AnswerRecord[] = questionsFor(round).map((q, i) => {
      const raw = responses[q.id] ?? '';
      const parsed = extractAnswer(raw);
      const correct = parsed !== null && checkAnswer(q, parsed);
      let note: string | undefined;
      if (errors[q.id]) note = `Model call failed: ${errors[q.id]}`;
      else if (parsed === null) note = 'No "ANSWER:" line found, so the answer was not scored.';
      return {
        taskId: q.id, label: `Question ${i + 1}`, tag: q.tag, raw, parsed, correct,
        points: correct ? POINTS_PER_QUESTION : 0, max: POINTS_PER_QUESTION,
        expected: q.expectedLabel, explanation: q.explanation, note,
      };
    });
    const criteria: Criterion[] = Object.keys(TAG_LABEL).map((tag) => {
      const items = answers.filter((a) => a.tag === tag);
      return {
        id: tag, label: TAG_LABEL[tag],
        earned: items.reduce((s, a) => s + a.points, 0), max: items.reduce((s, a) => s + a.max, 0),
        items: items.map((a) => ({ label: a.label, earned: a.points, max: a.max, note: a.correct ? 'Correct' : 'Incorrect' })),
      };
    });
    const strengths = criteria.filter((c) => c.earned === c.max).map((c) => `${c.label}: all ${c.items.length} correct`);
    const mistakes = answers.filter((a) => !a.correct).map((a) => `${a.label} (${TAG_LABEL[a.tag]}): ${a.parsed ? `answered "${a.parsed}"` : 'no valid answer'}, expected ${a.expected}`);
    return { score: answers.reduce((s, a) => s + a.points, 0), answers, criteria, strengths, mistakes };
  },

  simulate(round, skill, rng) {
    const out: Record<string, string> = {};
    for (const q of questionsFor(round)) {
      const right = rng() < skill;
      const value = right ? q.expectedLabel.replace(/[^\d.]/g, '') || (q.expected as string[])[0] : q.wrong[Math.floor(rng() * q.wrong.length)];
      out[q.id] = `[simulated] ANSWER: ${value}`;
    }
    return out;
  },
};
