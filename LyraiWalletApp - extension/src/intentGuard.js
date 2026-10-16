// "Intention vs reality": before anything is signed, what the transaction
// REALLY does is compared with what the user validated (the plan's structured
// steps: kind, token, amount, recipient), with fixed rules, never the model.
// Two layers:
// - static, on every chain: each call of the batch (its target, an approval's
//   spender and amount, a transfer's recipient and amount, the coin it sends)
//   must match a step of the plan or a contract known from the wallet's own
//   config (never from a quote API's answer);
// - simulated, where the chain's node has eth_simulateV1 (Plasma, Ethereum,
//   Base, Polygon): the exact transaction is run on the current state and its
//   real effects (transfers out and in, approvals) are checked again.
// Any failed rule blocks the signature, with a plain sentence saying what
// differs. There is no "sign anyway".
import { ethers } from "ethers";

export const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"; // same on every chain
const CIRCLE_ADAPTER = ["0x7FB8c7260b63934d8da38aF902f87ae6e284a845", "0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b"];
const CCTP_TOKEN_MESSENGER = ["0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d", "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA"];
const NATIVE_LOG = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"; // eth_simulateV1's native transfers
const UNLIMITED = 2n ** 128n;
const TRANSFER = ethers.id("Transfer(address,address,uint256)");
const APPROVAL = ethers.id("Approval(address,address,uint256)");
const APPROVAL_FOR_ALL = ethers.id("ApprovalForAll(address,address,bool)");
const ERC20 = new ethers.Interface([
  "function transfer(address to, uint256 amount)",
  "function approve(address spender, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function increaseAllowance(address spender, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
]);
const lc = (a) => String(a || "").toLowerCase();
const topicAddr = (t) => "0x" + String(t).slice(26).toLowerCase();

// ------------------------------------------------------------ messages
const MSG = {
  fr: {
    unknownTarget: (a) => `La transaction appellerait un contrat qui ne fait pas partie de ton plan (${short(a)}).`,
    selfCall: () => "La transaction modifierait ton propre compte (délégation ou propriétaire), ce que tu n'as pas demandé.",
    delegation: (a) => `La transaction changerait la délégation de ton compte vers ${short(a)}, ce que tu n'as pas demandé.`,
    forbidden: (what) => `La transaction contient une opération dangereuse que tu n'as pas demandée (${what}).`,
    unlimited: (t, s) => `La transaction donnerait à ${short(s)} le droit de prendre tous tes ${t}.`,
    approvalSpender: (t, s) => `La transaction autoriserait ${short(s)}, qui n'est pas prévu par ton plan, à prendre tes ${t}.`,
    approvalAmount: (t, got, want) => `La transaction autoriserait ${got} ${t} au lieu des ${want} prévus.`,
    approvalLeft: (t, s) => `L'autorisation donnée à ${short(s)} sur tes ${t} resterait ouverte après la transaction.`,
    strangerOut: (amt, t, to) => `La transaction enverrait aussi ${amt} ${t} à une adresse inconnue (${short(to)}).`,
    tooMuchOut: (t, got, want) => `La transaction ferait sortir ${got} ${t}, plus que les ${want} prévus.`,
    tokenOut: (amt, t) => `La transaction ferait sortir ${amt} ${t}, un token que ton plan ne touche pas.`,
    minIn: (t, got, want) => `Tu recevrais ${got} ${t}, moins que le minimum garanti de ${want}.`,
    reverted: (why) => `La transaction échouerait (${why}). Rien n'a été envoyé.`,
  },
  en: {
    unknownTarget: (a) => `The transaction would call a contract that isn't part of your plan (${short(a)}).`,
    selfCall: () => "The transaction would change your own account (delegation or owner), which you didn't ask for.",
    delegation: (a) => `The transaction would delegate your account to ${short(a)}, which you didn't ask for.`,
    forbidden: (what) => `The transaction contains a dangerous operation you didn't ask for (${what}).`,
    unlimited: (t, s) => `The transaction would let ${short(s)} take all your ${t}.`,
    approvalSpender: (t, s) => `The transaction would let ${short(s)}, which your plan doesn't use, take your ${t}.`,
    approvalAmount: (t, got, want) => `The transaction would approve ${got} ${t} instead of the planned ${want}.`,
    approvalLeft: (t, s) => `The approval given to ${short(s)} on your ${t} would stay open after the transaction.`,
    strangerOut: (amt, t, to) => `The transaction would also send ${amt} ${t} to an unknown address (${short(to)}).`,
    tooMuchOut: (t, got, want) => `The transaction would take ${got} ${t} out, more than the planned ${want}.`,
    tokenOut: (amt, t) => `The transaction would take ${amt} ${t} out, a token your plan doesn't touch.`,
    minIn: (t, got, want) => `You would receive ${got} ${t}, below the guaranteed minimum of ${want}.`,
    reverted: (why) => `The transaction would fail (${why}). Nothing was sent.`,
  },
};
function short(a) { const s = String(a || ""); return /^0x[0-9a-fA-F]{40}$/.test(s) ? `${s.slice(0, 6)}…${s.slice(-4)}` : s; }

// ------------------------------------------------------------ 1. what the plan allows
// steps: the plan the user validated ([{ kind, amount, asset, recipient,
//   tokenOutSymbol, destinationChainKey, amountIsEstimate, ticket }]).
// ctx: { from, nativeSymbol, tokens: { SYM: { address, decimals } },
//   defi: { aave: { pool }, aaveV4: { spoke }, lifi: { diamond } },
//   treasury, feeBps (25), slippage (0.005), delegator }
export function buildExpectations(steps, ctx) {
  const tok = (sym) => (sym === ctx.nativeSymbol ? { address: NATIVE_LOG, decimals: 18, symbol: sym, native: true } : ctx.tokens?.[sym] ? { ...ctx.tokens[sym], address: lc(ctx.tokens[sym].address), symbol: sym } : null);
  const raw = (t, v, extra = 1) => {
    const n = Number(v);
    if (!t || !(n > 0)) return 0n;
    return ethers.parseUnits((n * extra).toFixed(Math.min(t.decimals, 8)), t.decimals);
  };
  const exp = {
    from: lc(ctx.from),
    targets: new Set(),        // contracts the batch may call
    spenders: new Map(),       // token address -> Map(spender -> max approval)
    recipients: new Map(),     // token address -> Map(recipient -> max amount) (sends, fee)
    budgets: new Map(),        // token address -> max taken by protocols (swap, bridge, stake)
    minIn: new Map(),          // token address -> min received (same-chain swaps)
    symbols: new Map(),        // token address -> symbol, for the messages
    decimals: new Map(),
    burnsAllowed: false,       // unstake: receipt tokens burnt (sent to 0x0)
    delegator: lc(ctx.delegator),
  };
  const remember = (t) => { if (t) { exp.symbols.set(t.address, t.symbol); exp.decimals.set(t.address, t.decimals); } };
  const addMap = (m, key, sub, v) => { if (!m.has(key)) m.set(key, new Map()); m.get(key).set(sub, (m.get(key).get(sub) || 0n) + v); };
  const feeOn = (v) => (v * BigInt(ctx.feeBps ?? 25)) / 10000n + 1n;
  const treasury = lc(ctx.treasury);
  const slip = ctx.slippage ?? 0.005;

  for (const st of steps) {
    const t = tok(st.asset || ctx.nativeSymbol);
    remember(t);
    // a chained amount is an estimate: a little room above it
    const amount = raw(t, st.amount, st.amountIsEstimate ? 1.02 : 1);
    if (st.kind === "send") {
      const to = lc(st.recipient);
      addMap(exp.recipients, t?.address, to, amount);
      addMap(exp.recipients, t?.address, treasury, feeOn(amount));
      if (t && !t.native) exp.targets.add(t.address); else exp.targets.add(to);
      continue;
    }
    if (st.kind === "unstake") {
      exp.burnsAllowed = true;
      const pool = lc(ctx.defi?.aaveV4?.spoke || ctx.defi?.aave?.pool);
      if (pool) exp.targets.add(pool);
      continue;
    }
    // swap / bridge / stake: a protocol pulls the token (an exact approval)
    const spenders = st.kind === "swap" ? [lc(KYBER_ROUTER), ...CIRCLE_ADAPTER.map(lc)]
      : st.kind === "stake" ? [lc(ctx.defi?.aaveV4?.spoke), lc(ctx.defi?.aave?.pool)].filter(Boolean)
      : [lc(ctx.defi?.lifi?.diamond), ...CCTP_TOKEN_MESSENGER.map(lc)].filter(Boolean);
    spenders.forEach(s => exp.targets.add(s));
    if (t) {
      exp.budgets.set(t.address, (exp.budgets.get(t.address) || 0n) + amount);
      // Lyra's fee on it, to the treasury
      addMap(exp.recipients, t.address, treasury, feeOn(amount));
      if (!t.native) {
        exp.targets.add(t.address);
        for (const s of spenders) addMap(exp.spenders, t.address, s, amount);
      }
    }
    // a same-chain swap must bring at least the quote minus the slippage
    if (st.kind === "swap" && st.tokenOutSymbol) {
      const out = tok(st.tokenOutSymbol);
      remember(out);
      const quoted = Number(String(st.ticket?.estimatedReceive || "").replace(/[^\d.]/g, ""));
      if (out && quoted > 0) exp.minIn.set(out.address, (exp.minIn.get(out.address) || 0n) + raw(out, quoted, 1 - slip - 0.01));
    }
  }
  if (treasury) exp.targets.add(treasury);
  return exp;
}

// ------------------------------------------------------------ 2. static: the calls themselves
// calls: [{ to, data, value }] (the batch about to be signed); tx: { authorization }
export function checkCalls(calls, exp, { authorization, lang = "en" } = {}) {
  const m = MSG[lang] || MSG.en;
  const out = [];
  if (authorization && lc(authorization) !== exp.delegator) out.push(m.delegation(authorization));
  for (const c of calls) {
    const to = lc(c.to);
    if (to === exp.from) { out.push(m.selfCall()); continue; }
    const data = c.data || "0x";
    const value = BigInt(c.value || 0);
    let parsed = null;
    if (data.length >= 10) { try { parsed = ERC20.parseTransaction({ data }); } catch { /* not an ERC-20 call */ } }
    if (parsed?.name === "setApprovalForAll" && parsed.args[1]) out.push(m.forbidden("setApprovalForAll"));
    else if (parsed?.name === "permit" || parsed?.name === "increaseAllowance") out.push(m.forbidden(parsed.name));
    else if (parsed?.name === "transferFrom") out.push(m.forbidden("transferFrom"));
    else if (parsed?.name === "approve") {
      const spender = lc(parsed.args[0]); const amt = parsed.args[1];
      const sym = exp.symbols.get(to) || short(to);
      const allowed = exp.spenders.get(to)?.get(spender);
      if (amt >= UNLIMITED) out.push(m.unlimited(sym, spender));
      else if (amt > 0n && allowed === undefined) out.push(m.approvalSpender(sym, spender));
      else if (amt > 0n && amt > allowed) out.push(m.approvalAmount(sym, fmt(amt, exp.decimals.get(to)), fmt(allowed, exp.decimals.get(to))));
    } else if (parsed?.name === "transfer") {
      const dest = lc(parsed.args[0]); const amt = parsed.args[1];
      const sym = exp.symbols.get(to) || short(to);
      const allowed = exp.recipients.get(to)?.get(dest);
      if (allowed === undefined) out.push(m.strangerOut(fmt(amt, exp.decimals.get(to)), sym, dest));
      else if (amt > allowed) out.push(m.tooMuchOut(sym, fmt(amt, exp.decimals.get(to)), fmt(allowed, exp.decimals.get(to))));
    } else if (!exp.targets.has(to)) {
      out.push(m.unknownTarget(to));
    }
    // the native coin only goes where the plan sends it
    if (value > 0n && !(exp.recipients.get(NATIVE_LOG)?.has(to)) && !(exp.budgets.get(NATIVE_LOG) > 0n && exp.targets.has(to))) {
      out.push(m.strangerOut(fmt(value, 18), "native", to));
    }
  }
  return [...new Set(out)];
}

// ------------------------------------------------------------ 3. simulated: the real effects
// logs: the simulation's logs (eth_simulateV1 with traceTransfers: native
// transfers appear as Transfer logs from 0xeeee…eeee)
export function extractEffects(logs, from) {
  const me = lc(from);
  const fx = { out: [], in: [], approvals: [], approvalsForAll: [] };
  for (const l of logs || []) {
    const t0 = l.topics?.[0];
    const token = lc(l.address);
    if (t0 === TRANSFER && l.topics.length === 3) {
      const f = topicAddr(l.topics[1]), t = topicAddr(l.topics[2]);
      const amount = BigInt(l.data);
      if (f === me && t !== me) fx.out.push({ token, to: t, amount });
      if (t === me && f !== me) fx.in.push({ token, from: f, amount });
    } else if (t0 === APPROVAL && l.topics.length === 3 && topicAddr(l.topics[1]) === me) {
      fx.approvals.push({ token, spender: topicAddr(l.topics[2]), amount: BigInt(l.data) });
    } else if (t0 === APPROVAL_FOR_ALL && topicAddr(l.topics[1]) === me && BigInt(l.data) !== 0n) {
      fx.approvalsForAll.push({ token, operator: topicAddr(l.topics[2]) });
    }
  }
  return fx;
}

export function checkEffects(fx, exp, { lang = "en" } = {}) {
  const m = MSG[lang] || MSG.en;
  const out = [];
  const symOf = (a) => exp.symbols.get(a) || short(a);
  const dec = (a) => exp.decimals.get(a) ?? 18;
  // what goes out, token by token: to a planned recipient (within its amount),
  // else to the protocols within the step's budget, else it's a stranger
  const spentTo = new Map();
  const spentProtocol = new Map();
  for (const o of fx.out) {
    if (o.to === "0x0000000000000000000000000000000000000000" && exp.burnsAllowed) continue; // unstake burns the receipt
    const allowedHere = exp.recipients.get(o.token)?.get(o.to);
    const key = `${o.token}:${o.to}`;
    if (allowedHere !== undefined && (spentTo.get(key) || 0n) + o.amount <= allowedHere) {
      spentTo.set(key, (spentTo.get(key) || 0n) + o.amount);
      continue;
    }
    const budget = exp.budgets.get(o.token);
    if (budget === undefined && allowedHere !== undefined) {
      out.push(m.tooMuchOut(symOf(o.token), fmt((spentTo.get(key) || 0n) + o.amount, dec(o.token)), fmt(allowedHere, dec(o.token))));
      continue;
    }
    if (budget === undefined) {
      out.push(exp.symbols.has(o.token) ? m.strangerOut(fmt(o.amount, dec(o.token)), symOf(o.token), o.to) : m.tokenOut(fmt(o.amount, dec(o.token)), symOf(o.token)));
      continue;
    }
    spentProtocol.set(o.token, (spentProtocol.get(o.token) || 0n) + o.amount);
  }
  for (const [token, spent] of spentProtocol) {
    const budget = exp.budgets.get(token);
    if (spent > budget) out.push(m.tooMuchOut(symOf(token), fmt(spent, dec(token)), fmt(budget, dec(token))));
  }
  // approvals: never unlimited, only planned spenders, exact amounts, closed at the end
  const last = new Map();
  for (const a of fx.approvals) {
    const allowed = exp.spenders.get(a.token)?.get(a.spender);
    if (a.amount >= UNLIMITED) out.push(m.unlimited(symOf(a.token), a.spender));
    else if (a.amount > 0n && allowed === undefined) out.push(m.approvalSpender(symOf(a.token), a.spender));
    else if (a.amount > 0n && a.amount > allowed) out.push(m.approvalAmount(symOf(a.token), fmt(a.amount, dec(a.token)), fmt(allowed, dec(a.token))));
    last.set(`${a.token}:${a.spender}`, a);
  }
  for (const a of last.values()) if (a.amount > 0n && exp.spenders.get(a.token)?.has(a.spender)) out.push(m.approvalLeft(symOf(a.token), a.spender));
  for (const a of fx.approvalsForAll) out.push(m.forbidden(`setApprovalForAll → ${short(a.operator)}`));
  // what comes in: at least the guaranteed minimum of each swap
  for (const [token, min] of exp.minIn) {
    const got = fx.in.filter(i => i.token === token).reduce((s, i) => s + i.amount, 0n);
    if (got < min) out.push(m.minIn(symOf(token), fmt(got, dec(token)), fmt(min, dec(token))));
  }
  return [...new Set(out)];
}

function fmt(v, decimals = 18) {
  return Number(ethers.formatUnits(v ?? 0n, decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

// ------------------------------------------------------------ 4. run it
// The exact batch transaction (from = to = the wallet, data = executeBatch(...))
// on the current state. The account's code is set to the delegate's for the
// simulation (as after the delegation), so a first-time batch is simulated
// the same way. { available, reverted, reason, logs }
export async function simulateBatch(provider, { from, data, delegator }) {
  try {
    const code = await provider.getCode(delegator);
    const res = await provider.send("eth_simulateV1", [{
      blockStateCalls: [{ stateOverrides: { [from]: { code } }, calls: [{ from, to: from, data, value: "0x0" }] }],
      traceTransfers: true,
      validation: false,
    }, "latest"]);
    const r = res?.[0]?.calls?.[0];
    if (!r) return { available: false, reason: "no result" };
    if (r.status !== "0x1") {
      let why = r.error?.message || "reverted";
      const d = r.error?.data || r.returnData;
      if (typeof d === "string" && d.startsWith("0x08c379a0")) { try { why = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + d.slice(10))[0]; } catch { /* generic */ } }
      return { available: true, reverted: true, reason: why, logs: [] };
    }
    return { available: true, reverted: false, logs: r.logs || [] };
  } catch (e) {
    const msg = e?.error?.message || e?.shortMessage || e?.message || "";
    // the node has no eth_simulateV1 (Arc, Hyperliquid): the static check stands alone
    return { available: false, reason: msg };
  }
}

// The whole check. { ok, problems: [sentences], simulated }
export async function verifyBatch({ provider, steps, calls, data, ctx, authorization, lang }) {
  const exp = buildExpectations(steps, ctx);
  const problems = checkCalls(calls, exp, { authorization, lang });
  if (problems.length) return { ok: false, problems, simulated: false };
  const sim = await simulateBatch(provider, { from: ctx.from, data, delegator: ctx.delegator });
  if (!sim.available) return { ok: true, problems: [], simulated: false };
  if (sim.reverted) return { ok: false, problems: [(MSG[lang] || MSG.en).reverted(sim.reason)], simulated: true };
  const fx = extractEffects(sim.logs, ctx.from);
  const after = checkEffects(fx, exp, { lang });
  return { ok: after.length === 0, problems: after, simulated: true, effects: fx };
}
