// The intent planner (spec "Lyra — Spécification du planificateur d'intents",
// 16 Oct 2026). The AI only understands: it returns a list of structured
// actions. This module, pure and deterministic, turns that list into a safe
// plan: one batch per chain (one confirmation each, an EIP-7702 batch), the
// bridge always last in its batch, and what needs bridged funds in a second
// stage on the arrival chain, confirmed again once the funds land. When a
// guess could send money to the wrong place it asks one short question
// instead. No AI, no network, no signing here: everything it needs comes in
// through `ctx`, so every case is a unit test (tests/intentPlanner.test.mjs).
//
// An action (from the AI, validated here):
//   { id, type: "swap"|"send"|"stake"|"unstake"|"bridge", chain?, userOrder,
//     amount: { kind: "exact", value } | { kind: "all" } | { kind: "fromPrevious" },
//     source: "wallet" | <id of the action whose output it uses>,
//     swap:    tokenIn, tokenOut, slippageBps?
//     send:    token, to (address or contact name)
//     stake / unstake: token, protocol
//     bridge:  token, toChain }
// or { needsClarification: "question" } when the AI couldn't fill a field.
//
// ctx:
//   chains        supported chain keys (default SUPPORTED_CHAINS)
//   defaultChain  "plasma"
//   tokens        { chain: { SYMBOL: { decimals, native? } } }
//   balances      { chain: { SYMBOL: "decimal" } }        what the wallet holds
//   positions     { chain: { protocol: { SYMBOL: "decimal" } } }  staked
//   contacts      [{ name, address }]
//   quote(chain, tokenIn, tokenOut, amount)        -> expected out ("decimal") | null
//   bridgeEstimate(fromChain, toChain, token, amount) -> received ("decimal") | null
//   gasless       true: fees paid in a stablecoin (gasToken), else in the native coin
//   gasToken(chain)  the stablecoin that pays when gasless ("USDC")
//   gasFee(chain, callCount) -> fee ("decimal", in that token) | null
//   allowance(chain, token, spender) -> "decimal" (missing: 0)
//   spender(action) -> the contract that pulls the token (router, pool, bridge)
//   ledger, delegated: { chain: true }  a Ledger's first batch on a chain needs
//                 one more signature (the 7702 delegation)

export const SUPPORTED_CHAINS = ["plasma", "arc", "base", "ethereum", "polygon"];
const TYPES = ["swap", "send", "stake", "unstake", "bridge"];
const CHAIN_NAMES = { plasma: "Plasma", arc: "Arc", base: "Base", ethereum: "Ethereum", polygon: "Polygon", hyperliquid: "Hyperliquid" };
const chainName = (c) => CHAIN_NAMES[c] || c;
// when the order is free: producers first, then consumers, the bridge always last
const RANK = { unstake: 0, swap: 0, send: 1, stake: 1, bridge: 2 };

// ---- decimal strings <-> integer units (no float anywhere) ----
export function toUnits(value, decimals) {
  const s = String(value ?? "").trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}
export function fromUnits(raw, decimals) {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + (frac ? "." + frac : "");
}

const question = (text, reason, extra = {}) => ({ kind: "question", question: text, reason, ...extra });
const refused = (message, ctx) => ({
  kind: "refused",
  message,
  supported: { chains: (ctx.chains || SUPPORTED_CHAINS).map(chainName), tokens: Object.fromEntries((ctx.chains || SUPPORTED_CHAINS).map(c => [chainName(c), Object.keys(ctx.tokens?.[c] || {})])) },
});
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const isAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || ""));

// what an action takes from the wallet, and what it adds (chain + token)
function consumes(a) {
  if (a.type === "swap") return { chain: a.chain, token: a.tokenIn };
  if (a.type === "unstake") return null; // it takes a staking position, not a wallet balance
  return { chain: a.chain, token: a.token };
}
function produces(a) {
  if (a.type === "swap") return { chain: a.chain, token: a.tokenOut };
  if (a.type === "unstake") return { chain: a.chain, token: a.token };
  if (a.type === "bridge") return { chain: a.toChain, token: a.token };
  return null;
}
function describe(a) {
  if (a.type === "swap") return `swap ${a.tokenIn} → ${a.tokenOut}`;
  if (a.type === "send") return `send of ${a.token} to ${a.toLabel || a.to}`;
  if (a.type === "stake") return `stake of ${a.token}`;
  if (a.type === "unstake") return `unstake of ${a.token}`;
  return `bridge of ${a.token} to ${chainName(a.toChain)}`;
}
const decimalsOf = (ctx, chain, token) => ctx.tokens?.[chain]?.[token]?.decimals;
const isNative = (ctx, chain, token) => !!ctx.tokens?.[chain]?.[token]?.native;
const balanceOf = (ctx, chain, token) => toUnits(ctx.balances?.[chain]?.[token] ?? "0", decimalsOf(ctx, chain, token) ?? 18) ?? 0n;

// ---------------------------------------------------------------- 1. validate
export function validateActions(input, ctx) {
  if (input && !Array.isArray(input) && input.needsClarification) return { error: question(String(input.needsClarification), "ai") };
  const list = Array.isArray(input) ? input : input?.actions;
  if (!Array.isArray(list) || list.length === 0) return { error: question("What would you like to do?", "empty") };
  const chains = ctx.chains || SUPPORTED_CHAINS;
  const ids = new Set();
  const actions = list.map((raw, i) => ({ ...raw, userOrder: raw.userOrder ?? i + 1, source: raw.source || "wallet" }));
  const known = (token) => chains.some(c => ctx.tokens?.[c]?.[token]);

  for (const a of actions) {
    if (!a.id || ids.has(a.id)) return { error: refused("The request couldn't be read: an action has no id, or the same id twice.", ctx) };
    ids.add(a.id);
    if (!TYPES.includes(a.type)) return { error: refused(`"${a.type}" isn't something Lyra can do here.`, ctx) };
    const need = { swap: ["tokenIn", "tokenOut"], send: ["token", "to"], stake: ["token", "protocol"], unstake: ["token", "protocol"], bridge: ["token", "toChain"] }[a.type];
    for (const field of need) {
      if (!a[field]) {
        if (field === "toChain") return { error: question(`To which chain should I bridge the ${a.token}?`, "missing-toChain", { action: a.id }) };
        if (field === "to") return { error: question(`Who should I send the ${a.token} to?`, "missing-recipient", { action: a.id }) };
        return { error: question(`Which ${field === "protocol" ? "protocol" : "token"} for the ${a.type}?`, `missing-${field}`, { action: a.id }) };
      }
    }
    for (const t of [a.token, a.tokenIn, a.tokenOut].filter(Boolean)) {
      if (!known(t)) return { error: refused(`${t} isn't supported.`, ctx) };
    }
    for (const c of [a.chain, a.toChain].filter(Boolean)) {
      if (!chains.includes(c)) return { error: refused(`${chainName(c)} isn't supported.`, ctx) };
    }
    if (a.type === "swap" && a.tokenIn === a.tokenOut) return { error: refused(`Can't swap ${a.tokenIn} for itself.`, ctx) };
    // the amount: never "all" by default
    const kind = a.amount?.kind;
    if (!["exact", "all", "fromPrevious"].includes(kind)) {
      return { error: question(`How much ${a.type === "swap" ? a.tokenIn : a.token} for the ${a.type}?`, "missing-amount", { action: a.id }) };
    }
    if (kind === "exact" && !(Number(a.amount.value) > 0)) {
      return { error: question(`How much ${a.type === "swap" ? a.tokenIn : a.token} for the ${a.type}?`, "missing-amount", { action: a.id }) };
    }
    if (a.source !== "wallet" && !list.some(x => x.id === a.source)) return { error: refused("The request couldn't be read: an action uses another one that isn't there.", ctx) };
  }

  // recipients: an address, or exactly one contact
  for (const a of actions.filter(x => x.type === "send")) {
    if (isAddress(a.to)) continue;
    const matches = (ctx.contacts || []).filter(c => c.name.trim().toLowerCase() === String(a.to).trim().toLowerCase());
    if (matches.length === 1) { a.toLabel = matches[0].name; a.to = matches[0].address; continue; }
    if (matches.length > 1) {
      return { error: question(`Which ${a.to}? ${matches.map(m => `${m.name} (${short(m.address)})`).join(" or ")}`, "ambiguous-recipient", { action: a.id, options: matches.map(m => m.address) }) };
    }
    return { error: question(`I don't know "${a.to}" yet. What's their address?`, "unknown-recipient", { action: a.id }) };
  }

  // chains left out: from the action whose output it uses, from another action
  // of the request that produces the token, from where the token is held
  const notes = [];
  for (let pass = 0; pass < actions.length; pass++) {
    for (const a of actions.filter(x => !x.chain)) {
      if (a.source !== "wallet") {
        const src = actions.find(x => x.id === a.source);
        const out = src.chain || src.toChain ? produces(src) : null;
        if (out?.chain) a.chain = out.chain;
        continue;
      }
      const token = a.type === "swap" ? a.tokenIn : a.token;
      const producedOn = [...new Set(actions.filter(x => x !== a && x.chain && produces(x)?.token === token).map(x => produces(x).chain))];
      if (producedOn.length === 1) { a.chain = producedOn[0]; continue; }
      if (pass < actions.length - 1 && actions.some(x => x !== a && !x.chain)) continue; // another one may settle it
      const held = chains.filter(c => a.type === "unstake"
        ? toUnits(ctx.positions?.[c]?.[a.protocol]?.[token] ?? "0", decimalsOf(ctx, c, token) ?? 18) > 0n
        : ctx.tokens?.[c]?.[token] && balanceOf(ctx, c, token) > 0n);
      if (held.length === 1) { a.chain = held[0]; notes.push(`${chainName(held[0])} is used for the ${describe(a)} (the only chain where you hold ${token}).`); }
      else if (held.length > 1) return { error: question(`From which chain? You hold ${token} on ${held.map(chainName).join(" and ")}.`, "ambiguous-chain", { action: a.id, options: held }) };
      else {
        const def = ctx.defaultChain || "plasma";
        if (ctx.tokens?.[def]?.[token]) { a.chain = def; notes.push(`${chainName(def)} is used for the ${describe(a)} (default chain).`); }
        else return { error: question(`From which chain should the ${describe(a)} go?`, "missing-chain", { action: a.id }) };
      }
    }
  }
  for (const a of actions) {
    if (!a.chain) return { error: question(`From which chain should the ${describe(a)} go?`, "missing-chain", { action: a.id }) };
    for (const t of [a.token, a.tokenIn, a.tokenOut].filter(Boolean)) {
      if (t === a.tokenOut || t === a.tokenIn || a.type !== "bridge" || t === a.token) {
        if (!ctx.tokens?.[a.chain]?.[t]) return { error: refused(`${t} isn't supported on ${chainName(a.chain)}.`, ctx) };
      }
    }
    if (a.type === "bridge") {
      if (a.toChain === a.chain) return { error: question(`The bridge goes from ${chainName(a.chain)} to ${chainName(a.toChain)}: to which other chain?`, "same-chain-bridge", { action: a.id }) };
      if (!ctx.tokens?.[a.toChain]?.[a.token]) return { error: refused(`${a.token} can't be bridged to ${chainName(a.toChain)}.`, ctx) };
    }
  }
  return { actions, notes };
}

// ---------------------------------------------------------------- 2-9. plan
export function planIntents(input, ctx) {
  const v = validateActions(input, ctx);
  if (v.error) return v.error;
  const { actions } = v;
  const notes = [...v.notes];
  const byId = new Map(actions.map(a => [a.id, a]));

  // 2. the dependency graph: explicit (source) and implicit (a consumer that
  //    needs a token only other actions of the request produce on that chain)
  const preds = new Map(actions.map(a => [a.id, new Set()]));
  for (const b of actions) {
    if (b.source !== "wallet") { preds.get(b.id).add(b.source); continue; }
    const need = consumes(b);
    if (!need) continue;
    const exact = b.amount.kind === "exact" ? toUnits(b.amount.value, decimalsOf(ctx, need.chain, need.token)) : null;
    const lacking = b.amount.kind !== "exact" || balanceOf(ctx, need.chain, need.token) < exact;
    if (!lacking) continue;
    for (const a of actions) {
      if (a === b) continue;
      const out = produces(a);
      if (out && out.chain === need.chain && out.token === need.token) preds.get(b.id).add(a.id);
    }
  }
  // funds must stay on their chain unless a bridge moves them
  for (const b of actions) {
    for (const pid of preds.get(b.id)) {
      const a = byId.get(pid);
      const out = produces(a);
      if (!out) return question(`The ${describe(b)} uses the result of the ${describe(a)}, which produces nothing to use. Can you rephrase?`, "no-output");
      if (out.chain !== b.chain) {
        return question(a.type === "bridge"
          ? `The ${describe(a)} moves the funds to ${chainName(a.toChain)}, but the ${describe(b)} is on ${chainName(b.chain)}. Which should it be?`
          : `The ${describe(b)} is on ${chainName(b.chain)}, but the ${a.tokenOut || a.token} it uses comes out on ${chainName(out.chain)}. Should I bridge it first?`, "incoherent");
      }
    }
  }

  // 3. cycles: an incoherent request
  const order = [];
  {
    const indeg = new Map(actions.map(a => [a.id, preds.get(a.id).size]));
    const queue = actions.filter(a => indeg.get(a.id) === 0).map(a => a.id);
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const b of actions) if (preds.get(b.id).has(id)) { indeg.set(b.id, indeg.get(b.id) - 1); if (indeg.get(b.id) === 0) queue.push(b.id); }
    }
    if (order.length !== actions.length) return question("These actions depend on each other in a circle. In which order should they happen?", "cycle");
  }

  // 4. stages: an action after a bridge goes one stage later, on the arrival chain
  const stageOf = new Map();
  for (const id of order) {
    let s = 1;
    for (const pid of preds.get(id)) s = Math.max(s, stageOf.get(pid) + (byId.get(pid).type === "bridge" ? 1 : 0));
    stageOf.set(id, s);
  }

  // 5-6. one batch per chain in each stage, ordered by dependencies then priority
  const stageNumbers = [...new Set(actions.map(a => stageOf.get(a.id)))].sort((x, y) => x - y);
  const stages = stageNumbers.map(n => {
    const inStage = actions.filter(a => stageOf.get(a.id) === n);
    const chains = [...new Set(inStage.sort((x, y) => x.userOrder - y.userOrder).map(a => a.chain))];
    return {
      index: n,
      trigger: n === 1 ? "now" : "bridgeDelivered",
      waitsFor: n === 1 ? [] : [...new Set(inStage.flatMap(a => [...preds.get(a.id)].filter(p => byId.get(p).type === "bridge" && stageOf.get(p) === n - 1)))],
      batches: chains.map(chain => ({ chain, actions: topoBatch(inStage.filter(a => a.chain === chain), preds) })),
    };
  });

  // why an action moved before one the user said first
  for (const st of stages) for (const b of st.batches) {
    b.actions.forEach((a, i) => {
      for (const later of b.actions.slice(i + 1)) {
        if (later.userOrder >= a.userOrder) continue;
        if (preds.get(later.id).has(a.id) || [...preds.get(later.id)].some(p => p === a.id)) {
          notes.push(`The ${describe(a)} goes before the ${describe(later)}, because the ${later.type} uses the ${produces(a).token} it produces.`);
        } else if (later.type === "bridge") {
          // the bridge closes the batch: nothing to say, it is the rule
        }
      }
      if (a.type === "bridge" && b.actions.slice(i + 1).length === 0 && b.actions.some(x => x !== a && x.userOrder > a.userOrder)) {
        notes.push(`The ${describe(a)} goes last: it closes the ${chainName(b.chain)} batch.`);
      }
    });
  }

  // 7-8. balances, batch by batch; amounts; approvals; fees
  const sim = JSON.parse(JSON.stringify(ctx.balances || {})); // decimal strings per chain
  const positions = JSON.parse(JSON.stringify(ctx.positions || {}));
  const units = {}; // chain -> token -> bigint
  const getBal = (chain, token) => (units[chain]?.[token] ?? (toUnits(sim[chain]?.[token] ?? "0", decimalsOf(ctx, chain, token) ?? 18) ?? 0n));
  const setBal = (chain, token, v) => { (units[chain] ||= {})[token] = v; };
  const outputOf = new Map(); // action id -> { chain, token, raw } (the minimum it guarantees)
  const usedBy = new Map();   // "chain:token" -> [action] that took wallet funds

  for (const st of stages) {
    for (const batch of st.batches) {
      const calls = [];
      for (const a of batch.actions) {
        const need = consumes(a);
        const dec = need ? decimalsOf(ctx, a.chain, need.token) : decimalsOf(ctx, a.chain, a.token);
        let raw;
        let readAtExecution = false;
        if (a.type === "unstake") {
          const pos = toUnits(positions[a.chain]?.[a.protocol]?.[a.token] ?? "0", dec) ?? 0n;
          raw = a.amount.kind === "exact" ? toUnits(a.amount.value, dec) : pos;
          readAtExecution = a.amount.kind !== "exact";
          if (raw > pos) return question(`You have ${fromUnits(pos, dec)} ${a.token} staked on ${a.protocol}, not ${fromUnits(raw, dec)}. Withdraw ${fromUnits(pos, dec)}?`, "insufficient-position");
          if (raw === 0n) return question(`You have no ${a.token} staked on ${a.protocol} (${chainName(a.chain)}).`, "no-position");
        } else if (a.amount.kind === "exact") {
          raw = toUnits(a.amount.value, dec);
        } else if (a.amount.kind === "fromPrevious") {
          const srcs = a.source !== "wallet" ? [a.source] : [...preds.get(a.id)];
          if (!srcs.length) return question(`How much ${need.token} for the ${a.type}?`, "missing-amount", { action: a.id });
          raw = srcs.reduce((sum, id) => sum + (outputOf.get(id)?.raw ?? 0n), 0n);
          readAtExecution = true;
        } else { // all
          raw = getBal(a.chain, need.token);
          readAtExecution = true;
        }

        // the native coin pays the fees: "all of it" keeps what they need
        if (need && !ctx.gasless && isNative(ctx, a.chain, need.token) && a.amount.kind !== "exact") {
          // the batch's calls: its actions plus the approvals the ERC-20 ones will need
          const callCount = batch.actions.length + batch.actions.filter(x => ["swap", "stake", "bridge"].includes(x.type) && !isNative(ctx, x.chain, consumes(x).token)).length;
          const fee = feeFor(ctx, batch.chain, callCount) ?? 0n;
          if (fee > 0n && raw > fee) {
            raw -= fee;
            notes.push(`${fromUnits(fee, dec)} ${need.token} is kept for the network fees, so the ${describe(a)} uses ${fromUnits(raw, dec)} ${need.token}.`);
          }
        }
        if (raw === null || raw <= 0n) return question(`There is no ${need?.token || a.token} to use for the ${describe(a)}.`, "nothing-to-use", { action: a.id });

        // take it from the balance
        if (need) {
          const key = `${a.chain}:${need.token}`;
          const left = getBal(a.chain, need.token) - raw;
          if (left < 0n) {
            const users = (usedBy.get(key) || []).filter(x => x.source === "wallet");
            const start = balanceOf(ctx, a.chain, need.token);
            if (users.length && a.source === "wallet" && raw <= start) {
              return question(`You have ${fromUnits(start, dec)} ${need.token} on ${chainName(a.chain)}, and both the ${users.map(describe).join(" and the ")} and the ${describe(a)} use it. Which one should get it, or how should it be split?`, "conflict", { actions: [...users.map(u => u.id), a.id] });
            }
            const have = getBal(a.chain, need.token);
            return question(`Not enough ${need.token} on ${chainName(a.chain)}: the ${describe(a)} needs ${fromUnits(raw, dec)}, there will be ${fromUnits(have, dec)} (missing ${fromUnits(raw - have, dec)}). Reduce the amount?`, "insufficient", { missing: fromUnits(raw - have, dec), token: need.token, chain: a.chain });
          }
          setBal(a.chain, need.token, left);
          usedBy.set(key, [...(usedBy.get(key) || []), a]);
        }

        // what comes out (the minimum the quote guarantees)
        const call = { ...a, amount: fromUnits(raw, dec), amountRaw: raw.toString(), readAtExecution };
        if (readAtExecution) call.floor = call.amount; // read again when it runs, never below this
        if (a.type === "swap") {
          const decOut = decimalsOf(ctx, a.chain, a.tokenOut);
          const quoted = ctx.quote?.(a.chain, a.tokenIn, a.tokenOut, fromUnits(raw, dec));
          if (quoted == null) return refused(`No ${a.tokenIn} → ${a.tokenOut} route on ${chainName(a.chain)} right now.`, ctx);
          const slip = BigInt(a.slippageBps ?? 50);
          const minOut = (toUnits(quoted, decOut) * (10000n - slip)) / 10000n;
          call.expectedOut = quoted;
          call.minOut = fromUnits(minOut, decOut);
          setBal(a.chain, a.tokenOut, getBal(a.chain, a.tokenOut) + minOut);
          outputOf.set(a.id, { chain: a.chain, token: a.tokenOut, raw: minOut });
        } else if (a.type === "unstake") {
          setBal(a.chain, a.token, getBal(a.chain, a.token) + raw);
          outputOf.set(a.id, { chain: a.chain, token: a.token, raw });
        } else if (a.type === "bridge") {
          const decTo = decimalsOf(ctx, a.toChain, a.token);
          const est = ctx.bridgeEstimate?.(a.chain, a.toChain, a.token, fromUnits(raw, dec)) ?? fromUnits(raw, dec);
          const arrive = toUnits(est, decTo);
          call.estimatedReceive = fromUnits(arrive, decTo);
          setBal(a.toChain, a.token, getBal(a.toChain, a.token) + arrive);
          outputOf.set(a.id, { chain: a.toChain, token: a.token, raw: arrive });
        }

        // the approval it needs, right before it, in the same batch
        if (["swap", "stake", "bridge"].includes(a.type) && !isNative(ctx, a.chain, need.token)) {
          const spender = ctx.spender?.(a) ?? "router";
          const allowed = toUnits(ctx.allowance?.(a.chain, need.token, spender) ?? "0", dec) ?? 0n;
          if (allowed < raw) calls.push({ type: "approve", chain: a.chain, token: need.token, spender, amount: call.amount, for: a.id });
        }
        calls.push(call);
      }

      // the batch's fee: in the stablecoin when gasless, else in the native coin
      const feeToken = ctx.gasless ? (ctx.gasToken?.(batch.chain) || "USDC") : nativeOf(ctx, batch.chain);
      const fee = feeFor(ctx, batch.chain, calls.length);
      if (fee != null && fee > 0n && feeToken) {
        const dec = decimalsOf(ctx, batch.chain, feeToken) ?? 18;
        const left = getBal(batch.chain, feeToken) - fee;
        if (left < 0n) {
          return question(ctx.gasless
            ? `The fees (${fromUnits(fee, dec)} ${feeToken}) can't be covered on ${chainName(batch.chain)} after this plan. Reduce an amount?`
            : `Not enough ${feeToken} on ${chainName(batch.chain)} for the network fees (${fromUnits(fee, dec)} ${feeToken}).`, "fees");
        }
        setBal(batch.chain, feeToken, left);
        batch.fee = { token: feeToken, amount: fromUnits(fee, dec) };
      }
      batch.calls = calls;
      batch.confirmations = 1;
      batch.delegationSignature = !!ctx.ledger && !ctx.delegated?.[batch.chain];
      if (batch.delegationSignature) notes.push(`First Ledger plan on ${chainName(batch.chain)}: one more signature (the one-time 7702 delegation), then one for the batch.`);
      delete batch.actions;
    }
  }

  return {
    kind: "plan",
    stages,
    notes: [...new Set(notes)],
    confirmations: stages.reduce((n, s) => n + s.batches.length, 0),
    actions, // the validated actions (contacts resolved, chains filled), to plan stage 2 again
  };
}

function nativeOf(ctx, chain) {
  return Object.keys(ctx.tokens?.[chain] || {}).find(t => ctx.tokens[chain][t].native) || null;
}
function feeFor(ctx, chain, calls) {
  const v = ctx.gasFee?.(chain, calls);
  if (v == null) return null;
  const token = ctx.gasless ? (ctx.gasToken?.(chain) || "USDC") : nativeOf(ctx, chain);
  return toUnits(v, decimalsOf(ctx, chain, token) ?? 18);
}

// topological order inside a batch; among the ready ones: producers, then
// consumers, the bridge last; ties in the user's order
function topoBatch(list, preds) {
  const ids = new Set(list.map(a => a.id));
  const indeg = new Map(list.map(a => [a.id, [...preds.get(a.id)].filter(p => ids.has(p)).length]));
  const out = [];
  let ready = list.filter(a => indeg.get(a.id) === 0);
  while (ready.length) {
    ready.sort((x, y) => RANK[x.type] - RANK[y.type] || x.userOrder - y.userOrder);
    const a = ready.shift();
    out.push(a);
    for (const b of list) {
      if (preds.get(b.id).has(a.id)) {
        indeg.set(b.id, indeg.get(b.id) - 1);
        if (indeg.get(b.id) === 0) ready.push(b);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- after a bridge
// The bridge of stage 1 reported back (LiFi status). Delivered: stage 2 is
// planned again on what really arrived, and must be confirmed again. Failed or
// stuck: stage 2 is not proposed. Pending: nothing to do yet.
export function afterBridge(plan, { bridgeId, status, received, trackingUrl }, ctx) {
  if (status === "pending") return { kind: "waiting", message: "Bridge in progress.", trackingUrl };
  if (status !== "done") return { kind: "blocked", message: "The bridge didn't go through, so the next step isn't proposed.", trackingUrl };
  const bridge = plan.actions.find(a => a.id === bridgeId);
  if (!bridge) return refused("This bridge isn't part of the plan.", ctx);
  const next = plan.actions.filter(a => a.id !== bridgeId && dependsOn(plan, a.id, bridgeId));
  if (!next.length) return { kind: "done" };
  // what arrived is in the wallet now: the actions that used the bridge's
  // output take it from there, sized on the real amount
  const arrived = String(received);
  const redo = next.map(a => (a.source === bridgeId
    ? { ...a, source: "wallet", amount: a.amount.kind === "fromPrevious" ? { kind: "exact", value: arrived } : a.amount }
    : { ...a }));
  const freshCtx = { ...ctx, balances: ctx.balances }; // read again by the caller after the arrival
  const replanned = planIntents(redo, freshCtx);
  if (replanned.kind === "plan") replanned.recalculated = { bridgeId, received: arrived, estimated: bridgeEstimateOf(plan, bridgeId) };
  return replanned;
}
function dependsOn(plan, id, on) {
  const a = plan.actions.find(x => x.id === id);
  if (!a) return false;
  if (a.source === on) return true;
  const stageOfId = (x) => plan.stages.find(s => s.batches.some(b => b.calls.some(c => c.id === x)))?.index;
  return a.source !== "wallet" ? dependsOn(plan, a.source, on) : stageOfId(id) > stageOfId(on);
}
function bridgeEstimateOf(plan, bridgeId) {
  for (const s of plan.stages) for (const b of s.batches) for (const c of b.calls) if (c.id === bridgeId) return c.estimatedReceive;
  return null;
}

// "Étape 1 — Plasma (1 confirmation)…": the plan as lines, for the plan card
export function planLines(plan) {
  const lines = [];
  let n = 0;
  for (const st of plan.stages) {
    for (const b of st.batches) {
      lines.push(`Step ${st.index} — ${chainName(b.chain)} (${b.delegationSignature ? "2 signatures" : "1 confirmation"}${st.trigger === "bridgeDelivered" ? ", proposed when the funds arrive" : ""})`);
      for (const c of b.calls.filter(x => x.type !== "approve")) {
        n += 1;
        if (c.type === "swap") lines.push(`${n}. Swap ${c.readAtExecution ? "" : c.amount + " "}${c.tokenIn} → at least ${c.minOut} ${c.tokenOut}`);
        else if (c.type === "send") lines.push(`${n}. Send ${c.amount} ${c.token} to ${c.toLabel || short(c.to)}`);
        else if (c.type === "stake") lines.push(`${n}. Stake ${c.amount} ${c.token} on ${c.protocol}`);
        else if (c.type === "unstake") lines.push(`${n}. Unstake ${c.amount} ${c.token} from ${c.protocol}`);
        else lines.push(`${n}. Bridge ${c.readAtExecution ? `the remaining ${c.token}` : `${c.amount} ${c.token}`} to ${chainName(c.toChain)}`);
      }
      if (b.fee) lines.push(`Fees: ${b.fee.amount} ${b.fee.token}`);
    }
  }
  return lines;
}
