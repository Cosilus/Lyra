// The MULTI_ACTION steps the AI wrote, put in a coherent order by the intent
// planner (./intentPlanner.js) before they are researched and sent to the
// wallet. The app's interface doesn't change: same steps, same shape, only:
// - the order is computed by code (what produces a token runs before what
//   uses it, a bridge last), never left to the model;
// - a real ambiguity becomes one short question instead of a wrong plan
//   (two contacts with that name, the same funds used twice, an action on
//   the wrong chain, a step with no amount and nothing to take it from);
// - what needs bridged funds isn't run on the chain the funds left: the plan
//   stops at the bridge and says what to ask for once they arrive.
// Anything the planner can't model (a Polymarket bet, a USD amount, a swap
// whose output the model left out) keeps the AI's own order, as before.
import { planIntents } from "./intentPlanner.js";

const LIFI_TO_NETWORK = { pla: "plasma", eth: "ethereum", bas: "base", pol: "polygon", hyp: "hyperliquid", arc: "arc" };
const NAME = { plasma: "Plasma", ethereum: "Ethereum", base: "Base", polygon: "Polygon", hyperliquid: "Hyperliquid", arc: "Arc" };
// questions worth stopping for; the rest (balances, fees) the wallet checks
// for real before signing, with exact amounts the planner only estimates here
const ASK = new Set(["ambiguous-recipient", "unknown-recipient", "missing-recipient", "conflict", "incoherent", "cycle", "missing-amount", "missing-toChain", "same-chain-bridge", "ai"]);

const isAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || ""));

export function orderMultiSteps(steps, { network, networks, tokensByNetwork, holdings = [], contacts = [], nativePriceUSD = null }) {
  const untouched = { steps };
  if (!Array.isArray(steps) || steps.length < 2) return untouched;
  if (steps.some(s => !["send", "swap", "bridge", "stake", "unstake"].includes(s.kind))) return untouched;
  if (steps.some(s => s.amountUSD && !s.amount)) return untouched; // a USD amount: the ticket research converts it
  if (steps.some(s => s.kind === "swap" && !s.tokenOutSymbol)) return untouched;
  if (steps.some(s => s.kind === "bridge" && s.tokenOutSymbol && s.tokenOutSymbol !== s.asset)) return untouched; // swap+bridge in one route

  const chain = network.key;
  const native = network.nativeSymbol;

  // the AI's steps as planner actions
  const actions = [];
  const outputOf = []; // what each step produces: { chain, token }
  for (const [i, s] of steps.entries()) {
    const id = `s${i}`;
    const token = s.asset || native;
    const a = { id, type: s.kind, userOrder: i + 1, source: "wallet" };
    if (s.kind === "swap") Object.assign(a, { tokenIn: token, tokenOut: s.tokenOutSymbol });
    else if (s.kind === "bridge") {
      const to = LIFI_TO_NETWORK[String(s.destinationChainKey || "").toLowerCase()] || null;
      Object.assign(a, { token, toChain: to });
    } else if (s.kind === "send") Object.assign(a, { token, to: isAddress(s.recipient) ? s.recipient : (s.contactName || s.recipient || null), ...(isAddress(s.recipient) && s.contactName ? { toLabel: s.contactName } : {}) });
    else Object.assign(a, { token, protocol: "aave" });

    // amount: a number, "all", or (left out) the output of an earlier step
    const raw = String(s.amount ?? "").trim().toLowerCase();
    if (/^(all|max|everything|tout)$/.test(raw)) a.amount = { kind: "all" };
    else if (raw && Number(raw.replace(/,/g, "")) > 0) a.amount = { kind: "exact", value: raw.replace(/,/g, "") };
    else {
      // the nearest earlier step that produces this token
      let src = -1;
      for (let j = i - 1; j >= 0; j--) if (outputOf[j]?.token === token) { src = j; break; }
      if (src >= 0) { a.amount = { kind: "fromPrevious" }; a.source = `s${src}`; }
      // nothing to take it from: the planner asks how much
    }
    // where it runs: on the active network, or where a bridge it uses lands
    a.chain = a.source !== "wallet" && steps[Number(a.source.slice(1))].kind === "bridge"
      ? outputOf[Number(a.source.slice(1))].chain
      : chain;
    actions.push(a);
    outputOf.push(s.kind === "swap" ? { chain: a.chain, token: s.tokenOutSymbol }
      : s.kind === "unstake" ? { chain: a.chain, token }
      : s.kind === "bridge" ? { chain: a.toChain, token }
      : null);
  }

  // what the planner may assume
  const tokens = {};
  for (const n of networks) {
    tokens[n.key] = { [n.nativeSymbol]: { decimals: 18, native: true } };
    for (const [sym, t] of Object.entries(tokensByNetwork[n.key] || {})) tokens[n.key][sym] = { decimals: t.decimals ?? 18 };
  }
  // a bridge lands what LiFi delivers there (USDT0 can arrive as USDT): the
  // bridged token counts as known on the arrival chain, for the order
  for (const a of actions.filter(x => x.type === "bridge" && x.toChain && tokens[x.toChain] && !tokens[x.toChain][x.token])) {
    tokens[a.toChain][a.token] = { decimals: tokens[chain]?.[a.token]?.decimals ?? 18 };
  }
  const balances = { [chain]: {} };
  const positions = { [chain]: { aave: {} } };
  for (const h of holdings || []) {
    if (!h?.symbol) continue;
    balances[chain][h.symbol] = String(h.amount ?? "0");
    if (h.staked) positions[chain].aave[h.symbol] = String(h.staked);
  }
  const usd = (sym) => (/USD|EURC|DAI/i.test(sym) ? 1 : sym === native && nativePriceUSD ? Number(nativePriceUSD) : null);
  const ctx = {
    chains: networks.map(n => n.key),
    defaultChain: chain,
    tokens,
    balances,
    positions,
    contacts: (contacts || []).filter(c => c?.name && isAddress(c.address)),
    // for the order and the questions only: the real quotes come from each
    // step's own research right after
    quote: (c, a, b, amount) => {
      const pa = usd(a), pb = usd(b);
      return pa && pb ? String(Number(amount) * pa / pb) : String(amount);
    },
    bridgeEstimate: (from, to, token, amount) => String(amount),
  };

  const plan = planIntents(actions, ctx);
  if (plan.kind === "question") return ASK.has(plan.reason) ? { question: plan.question } : untouched;
  if (plan.kind === "refused") return { question: plan.message };
  if (plan.kind !== "plan") return untouched;

  // the planner's order, stage 1 (what runs on this network now)
  const index = (id) => Number(id.slice(1));
  const first = plan.stages[0];
  const order = first.batches.flatMap(b => b.calls.filter(c => c.type !== "approve").map(c => index(c.id)));
  if (order.length !== new Set(order).size) return untouched;
  const later = plan.stages.slice(1).flatMap(st => st.batches.flatMap(b => b.calls.filter(c => c.type !== "approve").map(c => ({ i: index(c.id), chain: b.chain }))));
  // steps on another network in stage 1 (no bridge between): the wallet runs
  // one network at a time, keep the AI's plan as it was
  if (first.batches.length > 1) return untouched;

  const ordered = order.map(i => steps[i]);
  const notes = plan.notes.filter(n => /goes before|goes last/.test(n));
  let after = "";
  if (later.length) {
    const where = NAME[later[0].chain] || later[0].chain;
    const what = later.map(({ i }) => {
      const s = steps[i];
      return s.kind === "swap" ? `swap them to ${s.tokenOutSymbol}` : s.kind === "send" ? `send them to ${s.contactName || s.recipient}` : s.kind === "stake" ? "stake them" : s.kind;
    }).join(", then ");
    after = `Once the funds arrive on ${where}, ask me to ${what} there.`;
  }
  return { steps: ordered, notes, after, reordered: order.some((v, k) => v !== k) };
}
