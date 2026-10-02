import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  LYRA_TREASURY, LYRA_FEE_BPS, feeOf, splitIncluded, splitOnTop, toRaw, isFeeExempt,
  assetInfo, feeIsWorthCharging, includedFeePreview, collectLyraFee, runWithLyraFee, MIN_FEE_USD, estimateAfterFee,
} from "../src/fees.js";

const TOKENS = { USDT0: { address: "0x1111111111111111111111111111111111111111", decimals: 6 } };
const ctx = (extra = {}) => ({ nativeSymbol: "XPL", tokens: TOKENS, xplPriceUSD: 1, erc20Abi: [], ...extra });
const ME = "0x2222222222222222222222222222222222222222";

describe("fee math", () => {
  it("treasury is the checksummed address you gave", () => {
    expect(LYRA_TREASURY).toBe("0x0E5599f418b4510ef0D00733895C6Ace14ed4964");
    expect(LYRA_FEE_BPS).toBe(25n);
  });
  it("0.25% of 100 USDT0 (6 decimals) is exactly 0.25", () => {
    expect(feeOf(100_000_000n)).toBe(250_000n);
    expect(splitIncluded(100_000_000n)).toEqual({ fee: 250_000n, net: 99_750_000n });
  });
  it("rounds the fee down and never exceeds 0.25%", () => {
    for (const a of [1n, 3n, 399n, 400n, 12345678901234567890n]) {
      const { fee, net } = splitIncluded(a);
      expect(fee + net).toBe(a);
      expect(fee * 10000n <= a * 25n).toBe(true);
    }
  });
  it("on top: amount + fee always fits the total, and the fee is 0.25% of the amount", () => {
    for (const total of [1_000_000n, 99_999_999n, 12345n, 10n ** 18n]) {
      const { amount, fee } = splitOnTop(total);
      expect(amount + fee <= total).toBe(true);
      expect(fee).toBe(feeOf(amount));
      // only a few base units are left behind
      expect(total - (amount + fee) <= 2n).toBe(true);
    }
  });
  it("parses decimals without throwing on extra digits", () => {
    expect(toRaw("9.9967971234", 6)).toBe(9_996_797n);
    expect(toRaw("10", 6)).toBe(10_000_000n);
    expect(toRaw("abc", 6)).toBeNull();
    expect(toRaw("", 6)).toBeNull();
  });
});

describe("who pays and when", () => {
  it("self and treasury transfers are exempt", () => {
    expect(isFeeExempt(ME, ME)).toBe(true);
    expect(isFeeExempt(ME, LYRA_TREASURY)).toBe(true);
    expect(isFeeExempt(ME, "0x3333333333333333333333333333333333333333")).toBe(false);
  });
  it("dust fees are skipped, normal ones are charged", () => {
    expect(feeIsWorthCharging(0n, 6, 1)).toBe(false);
    expect(feeIsWorthCharging(1_000n, 6, 1)).toBe(false); // $0.001
    expect(feeIsWorthCharging(250_000n, 6, 1)).toBe(true); // $0.25
    expect(feeIsWorthCharging(1n, 6, null)).toBe(true); // price unknown: charge
    expect(MIN_FEE_USD).toBe(0.02);
  });
  it("knows native vs token and refuses unknown assets", () => {
    expect(assetInfo("XPL", ctx())).toEqual({ isNative: true, decimals: 18, address: null });
    expect(assetInfo("USDT0", ctx()).decimals).toBe(6);
    expect(assetInfo("NOPE", ctx())).toBeNull();
  });
  it("preview matches what is charged", () => {
    const p = includedFeePreview({ asset: "USDT0", amount: "100" }, ctx());
    expect(p).toEqual({ fee: "0.25", net: "99.75", asset: "USDT0" });
    expect(includedFeePreview({ asset: "USDT0", amount: "0.5" }, ctx())).toBeNull(); // $0.00125, below the minimum
  });
});

function fakeSigner({ nativeBalance = 10n ** 20n, calls = [] } = {}) {
  return {
    calls,
    getAddress: async () => ME,
    provider: { getBalance: async () => nativeBalance },
    sendTransaction: async (req) => { calls.push(["native", req]); return { hash: "0xnative", wait: async () => ({}) }; },
  };
}
function fakeToken(balance, calls) {
  return { balanceOf: async () => balance, transfer: async (to, v) => { calls.push(["erc20", to, v]); return { hash: "0xerc20", wait: async () => ({}) }; } };
}

describe("collecting the fee never throws", () => {
  it("sends native fees to the treasury", async () => {
    const s = fakeSigner();
    const r = await collectLyraFee({ signer: s, asset: "XPL", feeRaw: 5n, ctx: ctx() });
    expect(r.collected).toBe(true);
    expect(s.calls[0]).toEqual(["native", { to: LYRA_TREASURY, value: 5n }]);
  });
  it("sends token fees to the treasury", async () => {
    const calls = [];
    const r = await collectLyraFee({ signer: fakeSigner(), asset: "USDT0", feeRaw: 250_000n, ctx: ctx({ makeToken: () => fakeToken(10n ** 9n, calls) }) });
    expect(r).toMatchObject({ collected: true, amount: "0.25", asset: "USDT0" });
    expect(calls).toEqual([["erc20", LYRA_TREASURY, 250_000n]]);
  });
  it("reports instead of throwing when the balance is too low or the network fails", async () => {
    const low = await collectLyraFee({ signer: fakeSigner({ nativeBalance: 3n }), asset: "XPL", feeRaw: 5n, ctx: ctx() });
    expect(low.collected).toBe(false);
    const boom = await collectLyraFee({ signer: { getAddress: async () => { throw new Error("rpc down"); } }, asset: "XPL", feeRaw: 5n, ctx: ctx() });
    expect(boom).toEqual({ collected: false, reason: "rpc down" });
    const unknown = await collectLyraFee({ signer: fakeSigner(), asset: "NOPE", feeRaw: 5n, ctx: ctx() });
    expect(unknown.collected).toBe(false);
  });
});

describe("swap / bridge / stake wrapper", () => {
  it("runs the action on the NET amount, then collects the fee", async () => {
    const order = [];
    const calls = [];
    const signer = fakeSigner();
    const core = async (_s, t) => { order.push(["core", t.amount]); return { hash: "0xmain" }; };
    const tx = await runWithLyraFee({
      signer, ticket: { asset: "USDT0", amount: "100" }, core,
      ctx: ctx({ makeToken: () => fakeToken(10n ** 9n, calls), onFee: (r) => order.push(["fee", r.collected]) }),
    });
    expect(tx.hash).toBe("0xmain");
    expect(order).toEqual([["core", "99.75"], ["fee", true]]);
    expect(calls).toEqual([["erc20", LYRA_TREASURY, 250_000n]]);
  });
  it("a failed main action never charges anything", async () => {
    const calls = [];
    const core = async () => { throw new Error("swap reverted"); };
    await expect(runWithLyraFee({ signer: fakeSigner(), ticket: { asset: "USDT0", amount: "100" }, core, ctx: ctx({ makeToken: () => fakeToken(10n ** 9n, calls) }) })).rejects.toThrow("swap reverted");
    expect(calls).toEqual([]);
  });
  it("a failed fee transfer does not fail the action", async () => {
    const core = async () => ({ hash: "0xmain" });
    const brokenToken = { balanceOf: async () => { throw new Error("rpc down"); } };
    const seen = [];
    const tx = await runWithLyraFee({ signer: fakeSigner(), ticket: { asset: "USDT0", amount: "100" }, core, ctx: ctx({ makeToken: () => brokenToken, onFee: (r) => seen.push(r.collected) }) });
    expect(tx.hash).toBe("0xmain");
    expect(seen).toEqual([false]);
  });
  it("leaves tiny or unknown-asset tickets untouched", async () => {
    const seen = [];
    const core = async (_s, t) => { seen.push(t.amount); return { hash: "0x" }; };
    await runWithLyraFee({ signer: fakeSigner(), ticket: { asset: "USDT0", amount: "0.5" }, core, ctx: ctx() });
    await runWithLyraFee({ signer: fakeSigner(), ticket: { asset: "WEIRD", amount: "100" }, core, ctx: ctx() });
    await runWithLyraFee({ signer: fakeSigner(), ticket: { asset: "USDT0", amount: "0" }, core, ctx: ctx() });
    expect(seen).toEqual(["0.5", "100", "0"]);
  });
  it("native asset swaps pay the fee in the native coin", async () => {
    const signer = fakeSigner();
    const core = async () => ({ hash: "0xmain" });
    await runWithLyraFee({ signer, ticket: { asset: "XPL", amount: "10" }, core, ctx: ctx() });
    expect(signer.calls[0][1]).toEqual({ to: LYRA_TREASURY, value: ethers.parseEther("0.025") });
  });
});

describe("swap estimate after the fee", () => {
  it("lowers the quoted amount by 0.25%, keeping the unit", () => {
    expect(estimateAfterFee("998.075992 XPL")).toBe("995.580802 XPL");
    expect(estimateAfterFee("1,000 USDC")).toBe("997.50 USDC");
    expect(estimateAfterFee("~ 50.5 ETH")).toBe("~ 50.37 ETH");
  });
  it("leaves text without a number alone", () => {
    expect(estimateAfterFee("—")).toBe("—");
    expect(estimateAfterFee("")).toBe("");
  });
});
