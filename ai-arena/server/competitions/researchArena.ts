import type { Criterion, CriterionItem } from '../../shared/types.ts';
import type { CompetitionDef } from './types.ts';

// The dossier is entirely fictional. "NovaLend" does not exist.
export const DOSSIER = `DOSSIER: NovaLend (fictional project, written for this exercise)

[S1] Whitepaper excerpt
NovaLend is a lending protocol where users deposit the NVL-USD stablecoin and earn a headline yield of 18% APY. According to the whitepaper, 82% of that yield is paid in newly minted NVL governance tokens (emissions) and only 18% comes from interest paid by borrowers.

[S2] Audit summary (Brightline Security, a small two-person firm)
One audit was performed before launch. It found 2 high-severity issues. One was fixed. The other, "oracle price manipulation through a single price feed", is marked "acknowledged, not resolved".

[S3] Team and governance
The four founders are pseudonymous. Protocol upgrades are controlled by a 3-of-5 multisig, with no timelock. Two of the five signers are founders.

[S4] Financial snapshot
Total value locked (TVL) is $42M. The three largest wallets hold 61% of TVL. The treasury holds $1.1M and monthly operating costs are $240k.

[S5] Community announcement
"NovaLend is fully audited, risk-free and offers a guaranteed 18% return. Deposit now!"`;

const QUESTIONS = `Write a short report (maximum 350 words) using exactly these four markdown headings:
## Summary
## Risks
## Unsupported claims
## Recommendation

Rules:
- Summary: at most 3 sentences, including the key figures.
- Risks: list at least 4 risks. For each, give a severity (High, Medium or Low) and a one-line reason.
- Unsupported claims: list claims in the dossier that are unsupported or contradicted by other parts of it.
- Recommendation: one short paragraph with a concrete action.
- Cite the dossier as [S1] to [S5] after each statement. Only cite sources that exist in the dossier. Do not use outside knowledge.`;

const SOURCES = ['S1', 'S2', 'S3', 'S4', 'S5'];

interface Check { id: string; label: string; test: RegExp; snippet: string; }

const FACTS: Check[] = [
  { id: 'f-tvl', label: 'TVL of $42M', test: /\$?\s?42\s?(m\b|million)/i, snippet: 'NovaLend holds $42M in TVL [S4].' },
  { id: 'f-apy', label: 'Headline yield of 18% APY', test: /18\s?%\s*(apy|yield|return)?/i, snippet: 'It advertises an 18% APY on NVL-USD deposits [S1].' },
  { id: 'f-emis', label: '82% of yield from token emissions', test: /82\s?%/i, snippet: 'About 82% of that yield comes from NVL token emissions [S1].' },
  { id: 'f-run', label: 'Treasury of $1.1M vs $240k monthly costs', test: /(1\.1\s?m|1\.1 million|240\s?k|240,000)/i, snippet: 'The treasury holds $1.1M against $240k of monthly costs [S4].' },
  { id: 'f-msig', label: '3-of-5 multisig', test: /3[\s-]*(of|\/)[\s-]*5/i, snippet: 'Upgrades sit behind a 3-of-5 multisig [S3].' },
];

const RISKS: (Check & { severity: string })[] = [
  { id: 'r-emis', label: 'Yield depends on token emissions (unsustainable)', test: /(unsustainab|inflation|dilut|sell pressure|token price|mostly paid in)/i, severity: 'High', snippet: 'Yield is mostly paid in newly minted tokens, which is unsustainable if the token price falls [S1].' },
  { id: 'r-orac', label: 'Unresolved oracle manipulation issue', test: /(oracle|price feed|price manipulation)/i, severity: 'High', snippet: 'A high-severity oracle manipulation issue remains unresolved [S2].' },
  { id: 'r-gov', label: 'Upgrade control without timelock', test: /(timelock|time-lock|no delay|centrali[sz])/i, severity: 'High', snippet: 'The multisig has no timelock, so upgrades can be pushed instantly [S3].' },
  { id: 'r-conc', label: 'Depositor concentration (top 3 wallets = 61%)', test: /(concentrat|61\s?%|top (3|three)|largest wallets|whale)/i, severity: 'Medium', snippet: 'Depositor concentration is high: three wallets hold 61% of TVL [S4].' },
  { id: 'r-run', label: 'Short treasury runway', test: /(runway|run out|months of|burn|insolven)/i, severity: 'Medium', snippet: 'The treasury covers only about 4.6 months of costs [S4].' },
  { id: 'r-team', label: 'Pseudonymous team', test: /(pseudonym|anonymous|unknown team|doxx)/i, severity: 'Medium', snippet: 'The founders are pseudonymous, which limits accountability [S3].' },
  { id: 'r-mkt', label: 'Misleading "risk-free / guaranteed" marketing', test: /(misleading|deceptive|false claim|exaggerat)/i, severity: 'Low', snippet: 'The announcement is misleading given the open audit issue [S5][S2].' },
];

const HEADINGS = ['Summary', 'Risks', 'Unsupported claims', 'Recommendation'];

/** Returns the text under a "## Heading" until the next "## ", or "" if absent. */
function section(text: string, heading: string): string {
  const re = new RegExp(`^#{2,3}\\s*${heading}\\s*$`, 'im');
  const m = re.exec(text);
  if (!m) return '';
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(/^#{2,3}\s+\S/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export const researchArena: CompetitionDef = {
  info: {
    id: 'due-diligence',
    category: 'research',
    name: 'DUE DILIGENCE DRILL',
    tagline: 'Read a dossier, extract the facts, spot the risks.',
    description:
      'Every agent receives the same fictional project dossier and the same instructions, and must produce a short, sourced risk report. A fixed rubric is applied automatically.',
    status: 'live',
    championship: 'standard',
    specialties: ['research', 'crypto', 'general'],
    taskCount: 1,
    maxScore: 100,
    durationLabel: '1 report · about 30 s',
    rules: [
      'Standard championship: same dossier, same instructions and same limits for every agent.',
      'The dossier is fictional. Agents must not use outside knowledge and must only cite sources S1 to S5.',
      'Scoring uses a fixed rubric of keyword and structure checks. It is reproducible but imperfect: it detects whether an idea is present, not how well it is argued. No AI model is used as a judge.',
      'The rubric and the scored items are published with the results.',
    ],
    scoring: [
      { label: 'Accuracy of facts', points: 25, detail: '5 key facts, 5 points each' },
      { label: 'Risk identification', points: 35, detail: '7 planted risks, 5 points each' },
      { label: 'Evidence and citations', points: 15, detail: 'Valid citations (up to 10) and no invented sources (5)' },
      { label: 'Instruction compliance', points: 15, detail: '4 required headings (12) and 350 words or fewer (3)' },
      { label: 'Reasoning structure', points: 10, detail: 'Severity ratings (5) and a concrete recommendation (5), heuristic' },
    ],
    topics: ['Fact extraction', 'Risk identification', 'Source citation', 'Following instructions'],
    limits: { maxTokensPerTask: 1000, timeoutMsPerTask: 45000 },
    publishAnswers: true,
  },
  preamble: 'You are analysing a closed dossier. Use only the information it contains.',
  tasks: () => [{ id: 'report', label: 'Risk report', tag: 'report', prompt: `${DOSSIER}\n\n${QUESTIONS}` }],

  grade(_round, responses, errors) {
    const text = responses.report ?? '';
    const err = errors.report;
    const item = (label: string, earned: number, max: number, note?: string): CriterionItem => ({ label, earned, max, note });

    const facts = FACTS.map((f) => (f.test.test(text) ? item(f.label, 5, 5, 'Found') : item(f.label, 0, 5, 'Not found')));
    const risks = RISKS.map((r) => (r.test.test(text) ? item(r.label, 5, 5, 'Identified') : item(r.label, 0, 5, 'Not identified')));

    const cited = [...text.matchAll(/\[?S(\d+)\]?/g)].map((m) => `S${m[1]}`);
    const validCited = new Set(cited.filter((c) => SOURCES.includes(c)));
    const invalid = new Set(cited.filter((c) => !SOURCES.includes(c)));
    const evidence = [
      item(`Distinct valid sources cited (${validCited.size})`, Math.min(validCited.size, 4) * 2.5, 10, 'Up to 4 sources count'),
      item('No invented sources', validCited.size > 0 && invalid.size === 0 ? 5 : 0, 5, invalid.size ? `Invalid citation(s): ${[...invalid].join(', ')}` : validCited.size === 0 ? 'No citations at all' : 'All citations exist'),
    ];

    const present = HEADINGS.filter((h) => section(text, h));
    const words = wordCount(text);
    const compliance = [
      ...HEADINGS.map((h) => item(`Heading "${h}"`, present.includes(h) ? 3 : 0, 3, present.includes(h) ? 'Present and non-empty' : 'Missing or empty')),
      item(`350 words or fewer (${words})`, text && words <= 350 ? 3 : 0, 3),
    ];

    const riskText = section(text, 'Risks');
    const severities = (riskText.match(/\b(high|medium|low)\b/gi) ?? []).length;
    const rec = section(text, 'Recommendation');
    const reasoning = [
      item(`Severity ratings in Risks (${severities})`, severities >= 3 ? 5 : 0, 5, 'Needs at least 3 High/Medium/Low ratings'),
      item('Concrete recommendation', wordCount(rec) >= 12 && /(avoid|wait|reduce|limit|require|diversif|monitor|do not|don't|only|until|audit|timelock|verify)/i.test(rec) ? 5 : 0, 5, 'At least 12 words with an action'),
    ];

    const mk = (id: string, label: string, items: CriterionItem[]): Criterion => ({
      id, label, items, earned: items.reduce((s, i) => s + i.earned, 0), max: items.reduce((s, i) => s + i.max, 0),
    });
    const criteria = [
      mk('facts', 'Accuracy of facts', facts),
      mk('risks', 'Risk identification', risks),
      mk('evidence', 'Evidence and citations', evidence),
      mk('compliance', 'Instruction compliance', compliance),
      mk('reasoning', 'Reasoning structure (heuristic)', reasoning),
    ];
    const score = criteria.reduce((s, c) => s + c.earned, 0);
    const strengths = criteria.filter((c) => c.earned === c.max).map((c) => `${c.label}: full marks`);
    const mistakes = criteria.flatMap((c) => c.items.filter((i) => i.earned < i.max).map((i) => `${c.label}: ${i.label}${i.note ? ` (${i.note})` : ''}`));
    if (err) mistakes.unshift(`Model call failed: ${err}`);
    return {
      score,
      report: text,
      answers: [{ taskId: 'report', label: 'Risk report', tag: 'report', raw: text, parsed: null, correct: null, points: score, max: 100, note: err ? `Model call failed: ${err}` : undefined }],
      criteria, strengths, mistakes,
    };
  },

  /** Builds a *simulated* report from canned sentences. Nothing here is written by an AI model. */
  simulate(_round, skill, rng) {
    const pick = <T>(arr: T[], p: number) => arr.filter(() => rng() < p);
    const facts = pick(FACTS, skill);
    const risks = pick(RISKS, skill);
    const headingOk = (h: string) => rng() < 0.6 + 0.4 * skill || h === 'Risks';
    const parts: string[] = ['[simulated report - generated by the demo engine, not by an AI model]'];
    if (headingOk('Summary')) parts.push(`## Summary\n${facts.map((f) => f.snippet).join(' ') || 'NovaLend is a lending protocol.'}`);
    parts.push(`## Risks\n${risks.map((r, i) => `${i + 1}. **${r.severity}**: ${r.snippet}`).join('\n') || '1. Some risks may exist.'}`);
    if (headingOk('Unsupported claims')) parts.push('## Unsupported claims\nThe claim that the protocol is "risk-free" is contradicted by the unresolved audit finding [S2][S5].');
    if (headingOk('Recommendation')) parts.push('## Recommendation\nAvoid depositing until the oracle issue is resolved, a timelock is added and the yield is shown to be sustainable.');
    if (rng() < (1 - skill) * 0.5) parts.push('Additional context is available in [S7].');
    return { report: parts.join('\n\n') };
  },
};
