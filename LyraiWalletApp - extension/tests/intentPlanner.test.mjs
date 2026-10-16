// The 15 edge cases of the intent planner spec (16 Oct 2026): JSON actions in,
// expected plan out. No AI, no blockchain.
import test from "node:test";
import assert from "node:assert/strict";
import { planIntents, afterBridge, planLines } from "../src/intentPlanner.js";

const PAPA = "0x1111111111111111111111111111111111111111";
const MARC1 = "0x2222222222222222222222222222222222222222";
const MARC2 = "0x3333333333333333333333333333333333333333";

// prices for the quotes (1 unit of token in USD)
const USD = { XPL: 0.2, USDC: 1, USDT: 1, USDT0: 1, ETH: 2500, POL: 0.5 };

function makeCtx(over = {}) {
  return {
    defaultChain: "plasma",
    tokens: {
      plasma: { XPL: { decimals: 18, native: true }, USDC: { decimals: 6 }, USDT: { decimals: 6 } },
      arc: { USDC: { decimals: 6, native: true }, EURC: { decimals: 6 } },
      base: { ETH: { decimals: 18, native: true }, USDC: { decimals: 6 } },
      ethereum: { ETH: { decimals: 18, native: true }, USDC: { decimals: 6 } },
      polygon: { POL: { decimals: 18, native: true }, USDC: { decimals: 6 } },
    },
    balances: {
      plasma: { XPL: "500", USDC: "0", USDT: "50" },
      base: { ETH: "0.01", USDC: "0" },
      ethereum: { ETH: "1", USDC: "0" },
      arc: { USDC: "30", EURC: "0" },
    },
    positions: {},
    contacts: [{ name: "Papa", address: PAPA }],
    quote: (chain, a, b, amount) => String(Number(amount) * USD[a] / USD[b]),
    bridgeEstimate: (from, to, token, amount) => String(Number(amount) * 0.99),
    gasless: false,
    gasFee: () => "0.001",
    spender: (a) => `${a.type}-contract`,
    ...over,
  };
}
const kinds = (plan) => plan.stages.map(s => s.batches.map(b => `${s.index}:${b.chain}:${b.calls.filter(c => c.type !== "approve").map(c => c.type).join(",")}`)).flat();

test("1. two swaps then a bridge of the USDC, all on Plasma: one batch, one confirmation", () => {
  const plan = planIntents([
    { id: "a1", type: "swap", chain: "plasma", tokenIn: "XPL", tokenOut: "USDC", amount: { kind: "exact", value: "100" } },
    { id: "a2", type: "swap", chain: "plasma", tokenIn: "USDT", tokenOut: "USDC", amount: { kind: "exact", value: "50" } },
    { id: "a3", type: "bridge", chain: "plasma", token: "USDC", toChain: "base", amount: { kind: "all" } },
  ], makeCtx());
  assert.equal(plan.kind, "plan");
  assert.deepEqual(kinds(plan), ["1:plasma:swap,swap,bridge"]);
  assert.equal(plan.confirmations, 1);
  const bridge = plan.stages[0].batches[0].calls.find(c => c.type === "bridge");
  // 100 XPL ≈ 20 USDC and 50 USDT ≈ 50 USDC, each at least 99.5%: 69.65 USDC
  assert.equal(bridge.amount, "69.65");
  assert.equal(bridge.readAtExecution, true);
  // the ERC-20 swap and the bridge get their approval right before them
  const types = plan.stages[0].batches[0].calls.map(c => c.type);
  assert.deepEqual(types, ["swap", "approve", "swap", "approve", "bridge"]);
});

test("2. send funded by a swap said after it: the swap goes first, explained", () => {
  const plan = planIntents([
    { id: "s", type: "send", token: "USDC", to: "Papa", amount: { kind: "exact", value: "15" }, chain: "plasma" },
    { id: "w", type: "swap", chain: "plasma", tokenIn: "XPL", tokenOut: "USDC", amount: { kind: "exact", value: "100" } },
  ], makeCtx());
  assert.equal(plan.kind, "plan");
  assert.deepEqual(kinds(plan), ["1:plasma:swap,send"]);
  assert.ok(plan.notes.some(n => /swap XPL → USDC goes before the send/.test(n)), plan.notes.join(" | "));
  assert.equal(plan.stages[0].batches[0].calls.find(c => c.type === "send").to, PAPA);
});

test("3. bridge then swap on the arrival chain: stage 2 on Base", () => {
  const plan = planIntents([
    { id: "b", type: "bridge", chain: "plasma", token: "USDC", toChain: "base", amount: { kind: "exact", value: "50" } },
    { id: "w", type: "swap", tokenIn: "USDC", tokenOut: "ETH", amount: { kind: "fromPrevious" }, source: "b" },
  ], makeCtx({ balances: { plasma: { XPL: "10", USDC: "60" }, base: { ETH: "0.01", USDC: "0" } } }));
  assert.equal(plan.kind, "plan");
  assert.deepEqual(kinds(plan), ["1:plasma:bridge", "2:base:swap"]);
  assert.equal(plan.stages[1].trigger, "bridgeDelivered");
  assert.deepEqual(plan.stages[1].waitsFor, ["b"]);
  assert.equal(plan.stages[1].batches[0].calls.find(c => c.type === "swap").amount, "49.5"); // the estimate, recalculated on arrival
  assert.equal(plan.confirmations, 2);
});

test("4. bridge to Base then stake on Plasma with the same funds: a question", () => {
  const out = planIntents([
    { id: "b", type: "bridge", chain: "plasma", token: "USDC", toChain: "base", amount: { kind: "exact", value: "50" } },
    { id: "k", type: "stake", chain: "plasma", token: "USDC", protocol: "aave", amount: { kind: "fromPrevious" }, source: "b" },
  ], makeCtx({ balances: { plasma: { XPL: "10", USDC: "60" } } }));
  assert.equal(out.kind, "question");
  assert.equal(out.reason, "incoherent");
});

test("5. unstake then swap all of it: unstake first, the swap's amount read when it runs", () => {
  const plan = planIntents([
    { id: "u", type: "unstake", chain: "plasma", token: "USDT", protocol: "aave", amount: { kind: "all" } },
    { id: "w", type: "swap", chain: "plasma", tokenIn: "USDT", tokenOut: "USDC", amount: { kind: "all" } },
  ], makeCtx({ positions: { plasma: { aave: { USDT: "120" } } } }));
  assert.equal(plan.kind, "plan");
  assert.deepEqual(kinds(plan), ["1:plasma:unstake,swap"]);
  const swap = plan.stages[0].batches[0].calls.find(c => c.type === "swap");
  assert.equal(swap.amount, "170"); // 50 in the wallet + 120 unstaked
  assert.equal(swap.readAtExecution, true);
  assert.equal(swap.floor, "170");
});

test("6. the same 100 USDC swapped and sent: a conflict question", () => {
  const out = planIntents([
    { id: "w", type: "swap", chain: "plasma", tokenIn: "USDC", tokenOut: "XPL", amount: { kind: "exact", value: "100" } },
    { id: "s", type: "send", chain: "plasma", token: "USDC", to: PAPA, amount: { kind: "exact", value: "100" } },
  ], makeCtx({ balances: { plasma: { XPL: "10", USDC: "100" } } }));
  assert.equal(out.kind, "question");
  assert.equal(out.reason, "conflict");
  assert.deepEqual(out.actions, ["w", "s"]);
});

test("7. send 10 USDC held on Base and Plasma: which chain?", () => {
  const out = planIntents([
    { id: "s", type: "send", token: "USDC", to: PAPA, amount: { kind: "exact", value: "10" } },
  ], makeCtx({ balances: { plasma: { XPL: "10", USDC: "40" }, base: { ETH: "0.01", USDC: "25" } } }));
  assert.equal(out.kind, "question");
  assert.equal(out.reason, "ambiguous-chain");
  assert.deepEqual(out.options.sort(), ["base", "plasma"]);
});

test("8. send to Marc, two contacts called Marc: which one?", () => {
  const out = planIntents([
    { id: "s", type: "send", chain: "plasma", token: "USDT", to: "Marc", amount: { kind: "exact", value: "10" } },
  ], makeCtx({ contacts: [{ name: "Marc", address: MARC1 }, { name: "marc", address: MARC2 }] }));
  assert.equal(out.kind, "question");
  assert.equal(out.reason, "ambiguous-recipient");
  assert.deepEqual(out.options, [MARC1, MARC2]);
});

test("9. swap all my ETH on Ethereum, no gasless: keeps the gas, says so", () => {
  const plan = planIntents([
    { id: "w", type: "swap", chain: "ethereum", tokenIn: "ETH", tokenOut: "USDC", amount: { kind: "all" } },
  ], makeCtx());
  assert.equal(plan.kind, "plan");
  const swap = plan.stages[0].batches[0].calls[0];
  assert.equal(swap.amount, "0.999");
  assert.ok(plan.notes.some(n => /kept for the network fees/.test(n)));
  assert.deepEqual(plan.stages[0].batches[0].fee, { token: "ETH", amount: "0.001" });
});

test("10. Plasma and Arc in one request, no bridge: two batches, two confirmations", () => {
  const plan = planIntents([
    { id: "s1", type: "send", chain: "plasma", token: "USDT", to: PAPA, amount: { kind: "exact", value: "5" } },
    { id: "s2", type: "send", chain: "arc", token: "USDC", to: PAPA, amount: { kind: "exact", value: "5" } },
  ], makeCtx());
  assert.equal(plan.kind, "plan");
  assert.deepEqual(kinds(plan), ["1:plasma:send", "1:arc:send"]);
  assert.equal(plan.confirmations, 2);
});

test("11. the bridge delivers less than estimated: stage 2 recalculated on the real amount", () => {
  const ctx = makeCtx({ balances: { plasma: { XPL: "10", USDC: "60" }, base: { ETH: "0.01", USDC: "0" } } });
  const plan = planIntents([
    { id: "b", type: "bridge", chain: "plasma", token: "USDC", toChain: "base", amount: { kind: "exact", value: "50" } },
    { id: "w", type: "swap", tokenIn: "USDC", tokenOut: "ETH", amount: { kind: "fromPrevious" }, source: "b" },
  ], ctx);
  const arrived = { ...ctx, balances: { plasma: { XPL: "10", USDC: "10" }, base: { ETH: "0.01", USDC: "48.5" } } };
  const step2 = afterBridge(plan, { bridgeId: "b", status: "done", received: "48.5" }, arrived);
  assert.equal(step2.kind, "plan");
  assert.deepEqual(kinds(step2), ["1:base:swap"]);
  assert.equal(step2.stages[0].batches[0].calls.find(c => c.type === "swap").amount, "48.5");
  assert.deepEqual(step2.recalculated, { bridgeId: "b", received: "48.5", estimated: "49.5" });
});

test("12. the bridge failed: stage 2 not proposed, tracking shown", () => {
  const ctx = makeCtx({ balances: { plasma: { XPL: "10", USDC: "60" } } });
  const plan = planIntents([
    { id: "b", type: "bridge", chain: "plasma", token: "USDC", toChain: "base", amount: { kind: "exact", value: "50" } },
    { id: "w", type: "swap", tokenIn: "USDC", tokenOut: "ETH", amount: { kind: "fromPrevious" }, source: "b" },
  ], ctx);
  const out = afterBridge(plan, { bridgeId: "b", status: "failed", trackingUrl: "https://scan.li.fi/tx/0xabc" }, ctx);
  assert.equal(out.kind, "blocked");
  assert.equal(out.trackingUrl, "https://scan.li.fi/tx/0xabc");
  assert.equal(afterBridge(plan, { bridgeId: "b", status: "pending" }, ctx).kind, "waiting");
});

test("13. unsupported token or chain: refused, nothing planned", () => {
  const t = planIntents([{ id: "w", type: "swap", chain: "plasma", tokenIn: "DOGE", tokenOut: "USDC", amount: { kind: "exact", value: "1" } }], makeCtx());
  assert.equal(t.kind, "refused");
  assert.ok(t.supported.chains.includes("Plasma"));
  const c = planIntents([{ id: "s", type: "send", chain: "solana", token: "USDC", to: PAPA, amount: { kind: "exact", value: "1" } }], makeCtx());
  assert.equal(c.kind, "refused");
});

test("14. first Ledger batch on a chain: the 7702 delegation signature is announced", () => {
  const plan = planIntents([
    { id: "s", type: "send", chain: "plasma", token: "USDT", to: PAPA, amount: { kind: "exact", value: "5" } },
  ], makeCtx({ ledger: true, delegated: {} }));
  assert.equal(plan.stages[0].batches[0].delegationSignature, true);
  assert.ok(plan.notes.some(n => /one-time 7702 delegation/.test(n)));
  const again = planIntents([
    { id: "s", type: "send", chain: "plasma", token: "USDT", to: PAPA, amount: { kind: "exact", value: "5" } },
  ], makeCtx({ ledger: true, delegated: { plasma: true } }));
  assert.equal(again.stages[0].batches[0].delegationSignature, false);
});

test("15. a refused plan runs nothing; the rephrased request gets a whole new plan", () => {
  const ctx = makeCtx();
  const before = JSON.stringify(ctx.balances);
  const first = planIntents([{ id: "s", type: "send", chain: "plasma", token: "USDT", to: PAPA, amount: { kind: "exact", value: "5" } }], ctx);
  // the user refuses it: the planner touched nothing
  assert.equal(JSON.stringify(ctx.balances), before);
  const second = planIntents([{ id: "s2", type: "send", chain: "plasma", token: "USDT", to: PAPA, amount: { kind: "exact", value: "8" } }], ctx);
  assert.notEqual(first, second);
  assert.equal(second.stages[0].batches[0].calls[0].amount, "8");
});

test("missing amount is a question, never 'all'; the AI's own question passes through", () => {
  const out = planIntents([{ id: "s", type: "send", chain: "plasma", token: "USDT", to: PAPA }], makeCtx());
  assert.equal(out.reason, "missing-amount");
  assert.equal(planIntents({ needsClarification: "Send how much?" }, makeCtx()).question, "Send how much?");
});

test("the plan reads like the spec's example", () => {
  const plan = planIntents([
    { id: "a1", type: "swap", chain: "plasma", tokenIn: "XPL", tokenOut: "USDC", amount: { kind: "exact", value: "100" } },
    { id: "a2", type: "send", chain: "plasma", token: "USDC", to: "Papa", amount: { kind: "exact", value: "5" } },
    { id: "a3", type: "bridge", chain: "plasma", token: "USDC", toChain: "base", amount: { kind: "all" } },
    { id: "a4", type: "swap", tokenIn: "USDC", tokenOut: "ETH", amount: { kind: "fromPrevious" }, source: "a3" },
  ], makeCtx());
  const lines = planLines(plan);
  assert.equal(lines[0], "Step 1 — Plasma (1 confirmation)");
  assert.match(lines[1], /^1\. Swap 100 XPL → at least 19\.9 USDC$/);
  assert.equal(lines[2], "2. Send 5 USDC to Papa");
  assert.equal(lines[3], "3. Bridge the remaining USDC to Base");
  assert.ok(lines.includes("Step 2 — Base (1 confirmation, proposed when the funds arrive)"));
});
