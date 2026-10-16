// Intention vs reality: a normal plan passes, every tampering is blocked
// (static check of the calls, then the simulated effects). No network.
import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { buildExpectations, checkCalls, extractEffects, checkEffects, KYBER_ROUTER } from "../src/intentGuard.js";

const ME = "0x40b1000000000000000000000000000000005c27";
const PAPA = "0x1111111111111111111111111111111111111111";
const THIEF = "0x9999999999999999999999999999999999999999";
const TREASURY = "0x0E5599f418b4510ef0D00733895C6Ace14ed4964";
const DELEGATOR = "0x4Cd241E8d1510e30b2076397afc7508Ae59C66c9";
const USDC = "0x2d661C89D812261039AF9764eceaAee884f5F67F";
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const ERC20 = new ethers.Interface(["function transfer(address,uint256)", "function approve(address,uint256)"]);
const u = (v) => ethers.parseUnits(String(v), 6);
const x = (v) => ethers.parseEther(String(v));

const ctx = {
  from: ME, nativeSymbol: "XPL", treasury: TREASURY, delegator: DELEGATOR, feeBps: 25, slippage: 0.005,
  tokens: { USDC: { address: USDC, decimals: 6 } },
  defi: { aave: { pool: "0x925a2A7214Ed92428B5b1B090F80b25700095e12" }, lifi: { diamond: "0x0a0758d937d1059c356D4714e57F5df0239bce1A" } },
};
// "swap 100 XPL to USDC, send 5 USDC to Papa", as validated on the plan card
const steps = [
  { kind: "swap", amount: "100", asset: "XPL", tokenOutSymbol: "USDC", ticket: { estimatedReceive: "8.24 USDC" } },
  { kind: "send", amount: "5", asset: "USDC", recipient: PAPA },
];
const exp = () => buildExpectations(steps, ctx);
// the batch Lyra builds for it (fee on the swap taken out, fee on the send on top)
const calls = () => [
  { to: KYBER_ROUTER, data: "0x12345678", value: x("99.75") },
  { to: TREASURY, data: "0x", value: x("0.25") },
  { to: USDC, data: ERC20.encodeFunctionData("transfer", [PAPA, u(5)]), value: 0n },
  { to: USDC, data: ERC20.encodeFunctionData("transfer", [TREASURY, u("0.0125")]), value: 0n },
];
// what its simulation shows
const log = (token, from, to, amount) => ({ address: token, topics: [ethers.id("Transfer(address,address,uint256)"), ethers.zeroPadValue(from, 32), ethers.zeroPadValue(to, 32)], data: ethers.toBeHex(amount, 32) });
const approvalLog = (token, spender, amount) => ({ address: token, topics: [ethers.id("Approval(address,address,uint256)"), ethers.zeroPadValue(ME, 32), ethers.zeroPadValue(spender, 32)], data: ethers.toBeHex(amount, 32) });
const logs = () => [
  log(NATIVE, ME, KYBER_ROUTER, x("99.75")),
  log(NATIVE, ME, TREASURY, x("0.25")),
  log(USDC, "0x7777777777777777777777777777777777777777", ME, u("8.21")),
  log(USDC, ME, PAPA, u(5)),
  log(USDC, ME, TREASURY, u("0.0125")),
];

test("a normal plan passes both checks", () => {
  assert.deepEqual(checkCalls(calls(), exp(), { authorization: DELEGATOR }), []);
  assert.deepEqual(checkEffects(extractEffects(logs(), ME), exp()), []);
});

test("changed recipient: blocked", () => {
  const c = calls(); c[2] = { to: USDC, data: ERC20.encodeFunctionData("transfer", [THIEF, u(5)]), value: 0n };
  const p = checkCalls(c, exp(), { lang: "fr" });
  assert.match(p[0], /enverrait aussi 5 USDC à une adresse inconnue \(0x9999…9999\)/);
  const l = logs(); l[3] = log(USDC, ME, THIEF, u(5));
  assert.match(checkEffects(extractEffects(l, ME), exp(), { lang: "fr" })[0], /adresse inconnue/);
});

test("unlimited approval: blocked", () => {
  const c = [{ to: USDC, data: ERC20.encodeFunctionData("approve", [KYBER_ROUTER, ethers.MaxUint256]), value: 0n }, ...calls()];
  assert.match(checkCalls(c, exp(), { lang: "fr" })[0], /le droit de prendre tous tes USDC/);
  const l = [...logs(), approvalLog(USDC, KYBER_ROUTER, ethers.MaxUint256)];
  assert.ok(checkEffects(extractEffects(l, ME), exp()).some(m => /take all your USDC/.test(m)));
});

test("more going out than asked: blocked", () => {
  const c = calls(); c[2] = { to: USDC, data: ERC20.encodeFunctionData("transfer", [PAPA, u(50)]), value: 0n };
  assert.match(checkCalls(c, exp(), { lang: "fr" })[0], /ferait sortir 50 USDC, plus que les 5 prévus/);
  const l = logs(); l[3] = log(USDC, ME, PAPA, u(50));
  assert.ok(checkEffects(extractEffects(l, ME), exp(), { lang: "fr" }).some(m => /plus que les 5 prévus/.test(m)));
});

test("less received than the guaranteed minimum: blocked", () => {
  const l = logs(); l[2] = log(USDC, "0x7777777777777777777777777777777777777777", ME, u("5.1"));
  assert.match(checkEffects(extractEffects(l, ME), exp(), { lang: "fr" })[0], /Tu recevrais 5\.1 USDC, moins que le minimum garanti/);
});

test("hidden delegation change: blocked", () => {
  assert.match(checkCalls(calls(), exp(), { authorization: THIEF, lang: "fr" })[0], /changerait la délégation de ton compte/);
  const c = [...calls(), { to: ME, data: "0xdeadbeef", value: 0n }];
  assert.match(checkCalls(c, exp(), { lang: "fr" })[0], /modifierait ton propre compte/);
});

test("an approval left open after the batch, an unknown contract: blocked", () => {
  const swapUsdc = [{ kind: "swap", amount: "10", asset: "USDC", tokenOutSymbol: "XPL" }];
  const e = buildExpectations(swapUsdc, ctx);
  const l = [approvalLog(USDC, KYBER_ROUTER, u("9.975")), log(USDC, ME, KYBER_ROUTER, u("9.975"))];
  assert.ok(checkEffects(extractEffects(l, ME), e).some(m => /would stay open/.test(m)));
  // with the reset at the end (disposable approval): passes
  assert.deepEqual(checkEffects(extractEffects([...l, approvalLog(USDC, KYBER_ROUTER, 0n), log(USDC, ME, TREASURY, u("0.025"))], ME), e), []);
  assert.match(checkCalls([{ to: THIEF, data: "0xabcdef01", value: 0n }], e, { lang: "fr" })[0], /contrat qui ne fait pas partie de ton plan/);
});
