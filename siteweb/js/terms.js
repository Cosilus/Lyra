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
      "Say it in plain words: send, swap, bridge, stake, ask.",
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
  stake: {
    title: "Stake",
    lead: "Deposit a token to earn a yield, withdraw when you want.",
    points: [
      "Aave V3 on Plasma, Ethereum and Base (V4 on Arc).",
      "Lyra reads the live supply rate and the risk first.",
      "Withdraw anytime, same one-hold confirmation.",
    ],
    note: "Not available on Polygon or Hyperliquid yet.",
  },
  bridge: {
    title: "Bridge",
    lead: "Move a token from one network to another.",
    points: [
      "Route requested live from LI.FI, the engine behind Jumper.",
      "On Arc: Circle's Bridge Kit (USDC and EURC).",
      "You see what you'll receive before you hold.",
    ],
    note: "Final once broadcast: check the amount and the network.",
  },
  web3: {
    title: "Questions about Web3",
    lead: "Ask first, act after. No ticket unless you want one.",
    points: [
      "Is this contract risky? What does this rate mean?",
      "Lyra checks the explorer and public scam lists.",
      "It answers about your wallet, Web3, crypto and blockchains.",
    ],
    note: "If it can't find a reliable answer, it says so.",
  },
  control: {
    title: "Control the wallet by chat",
    lead: "Anything you would click, you can ask for.",
    points: [
      "Switch network, open your history, change 2D / 3D.",
      "Send to a saved contact by name.",
      "Prepare swaps, bridges and staking as tickets.",
    ],
    note: "Anything that moves funds still needs your hold.",
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
};

export const tipHtml = (t) =>
  `<b class="tip-title">${esc(t.title)}</b><p class="tip-lead">${esc(t.lead)}</p><ul>${t.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` +
  (t.note ? `<p class="tip-note">${esc(t.note)}</p>` : "");
