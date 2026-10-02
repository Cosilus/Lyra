/*
 * Key terms in the conversation: marked in story.js as [[visible text|key]], drawn with a shimmering
 * highlight, and explained in a small bubble on hover (or tap on touch screens).
 * Pure helpers + the explanations. No DOM here except escaping.
 */
import { esc } from "./util.js";

/* Split "An [[ICW|icw]] wallet" into plain text + spans over the plain text. */
export function parseRich(marked) {
  const spans = [];
  let text = "";
  const re = /\[\[([^|\]]+)\|([a-z0-9]+)\]\]/g;
  let last = 0, m;
  while ((m = re.exec(marked))) {
    text += marked.slice(last, m.index);
    spans.push({ from: text.length, to: text.length + m[1].length, key: m[2] });
    text += m[1];
    last = m.index + m[0].length;
  }
  text += marked.slice(last);
  return { text, spans };
}

/* HTML of the first n characters of `text`, with the spans wrapped. */
export function richHtml(text, spans = [], n = text.length) {
  n = Math.min(n, text.length);
  let html = "", pos = 0;
  for (const s of spans) {
    if (s.from >= n) break;
    html += esc(text.slice(pos, s.from));
    html += `<span class="term" data-term="${s.key}" tabindex="0">${esc(text.slice(s.from, Math.min(s.to, n)))}</span>`;
    pos = Math.min(s.to, n);
  }
  return html + esc(text.slice(pos, n));
}

/* What each term explains: title, lead line, bullet list, optional footnote. */
export const TERMS = {
  icw: {
    title: "Intelligent Conversational Wallet",
    lead: "A non-custodial wallet you talk to, not click through.",
    points: [
      "Say it in plain words: send, swap, bridge, stake, bet, pay.",
      "Lyra checks the live rate, route and risk first.",
      "You read a ticket, then hold one button to confirm.",
      "Your key stays encrypted on your device.",
      "Plasma, Ethereum, Base, Polygon, Arc, Hyperliquid.",
    ],
  },
  swap: {
    title: "Swap",
    lead: "Trade one token for another at the best live route.",
    points: [
      "Best route across DEX pools (KyberSwap), rate read live.",
      "On Arc: USDC and EURC through Circle's Swap Kit.",
      "Also: bridge between networks, and bring funds back.",
    ],
    note: "Final once broadcast: check amount and network.",
  },
  defi: {
    title: "DeFi interactions",
    lead: "Real on-chain actions, prepared as tickets you confirm.",
    points: [
      "Swap: best route (KyberSwap).",
      "Bridge: LI.FI, Circle Bridge Kit on Arc.",
      "Stake: Aave V3 (V4 on Arc), withdraw anytime.",
      "Bring funds back: consolidate chains.",
      "Ask first: check a contract or a rate.",
      "Multi-step (\"swap then stake\"): one ticket per step, you review each one.",
    ],
  },
  predict: {
    title: "Bets on prediction markets",
    lead: "Bet on real-world outcomes through Polymarket.",
    points: [
      "Finds the real, open market, or says there is none.",
      "Live price from the order book, with the payout.",
      "One ticket on Polygon, funds brought in if needed.",
      "Cash out early or cancel an open order.",
    ],
    note: "You can lose your whole stake.",
  },
  x402: {
    title: "Payments over x402",
    lead: "Pay for web services: no card, no account.",
    points: [
      "A service answers \"402\" with a price; you see a ticket.",
      "Hold to confirm: Lyra signs a USDC payment.",
      "Finds paid services in Circle's directory.",
      "Nanopayments: gas-free after one deposit.",
      "Your spending limit blocks anything above it.",
    ],
  },
  a2a: {
    title: "Hire an agent (A2A)",
    lead: "Hand a task to another agent (Agent2Agent protocol).",
    points: [
      "Lyra reads the agent's public card and sends the task.",
      "The answer comes back into the chat. No money moves.",
    ],
    note: "Alpha: the built-in agent is a demo.",
  },
  book: {
    title: "Book and pay in the chat",
    lead: "Checkout inside the conversation, paid over x402 (ACP).",
    points: [
      "Lyra builds a checkout with items and a total.",
      "One hold pays it, under your spending limit.",
      "Payments are final: the price is shown first.",
    ],
    note: "Alpha: the restaurant is a demo, nothing is booked.",
  },
};

export const tipHtml = (t) =>
  `<b class="tip-title">${esc(t.title)}</b><p class="tip-lead">${esc(t.lead)}</p><ul>${t.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` +
  (t.note ? `<p class="tip-note">${esc(t.note)}</p>` : "");
