// The AI's MULTI_ACTION steps, ordered by the planner (tools/planSteps.js).
import test from "node:test";
import assert from "node:assert/strict";
import { orderMultiSteps } from "../tools/planSteps.js";
import { NETWORKS, TOKENS_BY_NETWORK, getNetworkByKey } from "../../src/config.js";

const PAPA = "0x1111111111111111111111111111111111111111";
const base = (over = {}) => ({
  network: getNetworkByKey("plasma"),
  networks: NETWORKS,
  tokensByNetwork: TOKENS_BY_NETWORK,
  holdings: [{ symbol: "XPL", amount: "500" }, { symbol: "USDT0", amount: "0" }],
  contacts: [{ name: "Papa", address: PAPA }],
  nativePriceUSD: 0.2,
  ...over,
});
const step = (o) => ({ amount: null, asset: null, recipient: null, contactName: null, tokenOutSymbol: null, destinationChainKey: null, auto: false, reason: null, ...o });

test("a send said first but paid by the swap: the swap goes first, with the reason", () => {
  const out = orderMultiSteps([
    step({ kind: "send", amount: "15", asset: "USDT0", contactName: "Papa" }),
    step({ kind: "swap", amount: "100", asset: "XPL", tokenOutSymbol: "USDT0" }),
  ], base());
  assert.deepEqual(out.steps.map(s => s.kind), ["swap", "send"]);
  assert.ok(out.notes.some(n => /goes before/.test(n)));
});

test("already in order: unchanged", () => {
  const steps = [
    step({ kind: "swap", amount: "100", asset: "XPL", tokenOutSymbol: "USDT0" }),
    step({ kind: "send", asset: "USDT0", contactName: "Papa" }),
  ];
  const out = orderMultiSteps(steps, base());
  assert.deepEqual(out.steps, steps);
  assert.equal(out.reordered, false);
});

test("two contacts with the same name: a question, no plan", () => {
  const out = orderMultiSteps([
    step({ kind: "swap", amount: "100", asset: "XPL", tokenOutSymbol: "USDT0" }),
    step({ kind: "send", asset: "USDT0", contactName: "Marc" }),
  ], base({ contacts: [{ name: "Marc", address: PAPA }, { name: "Marc", address: "0x2222222222222222222222222222222222222222" }] }));
  assert.match(out.question, /Which Marc/);
});

test("the same funds used twice: a question", () => {
  const out = orderMultiSteps([
    step({ kind: "swap", amount: "100", asset: "USDT0", tokenOutSymbol: "XPL" }),
    step({ kind: "send", amount: "100", asset: "USDT0", recipient: PAPA }),
  ], base({ holdings: [{ symbol: "XPL", amount: "10" }, { symbol: "USDT0", amount: "100" }] }));
  assert.match(out.question, /both/);
});

test("a swap on the arrival chain after a bridge: the plan stops at the bridge and says what to ask", () => {
  const out = orderMultiSteps([
    step({ kind: "bridge", amount: "50", asset: "USDT0", destinationChainKey: "bas" }),
    step({ kind: "swap", asset: "USDT0", tokenOutSymbol: "ETH" }),
  ], base({ holdings: [{ symbol: "XPL", amount: "10" }, { symbol: "USDT0", amount: "60" }] }));
  assert.deepEqual(out.steps.map(s => s.kind), ["bridge"]);
  assert.match(out.after, /^Once the funds arrive on Base, ask me to swap them to ETH there.$/);
});

test("a Polymarket bet, a USD amount: the AI's order is kept", () => {
  const steps = [step({ kind: "bridge", amount: "5", asset: "USDT0", destinationChainKey: "pol" }), step({ kind: "predict", amountUSD: "5" })];
  assert.equal(orderMultiSteps(steps, base()).steps, steps);
});
