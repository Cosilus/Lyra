import { ethers } from "ethers";

// Lyra's own fee: 0.25% on swaps, bridges, staking deposits and sends, paid
// to the treasury address below. Done in the wallet itself (a plain transfer),
// no third-party fee program involved.
//
// How it is charged:
//  - swap / bridge / stake: INCLUDED. The user says "swap 100", 99.75 is swapped
//    and 0.25 goes to the treasury, so the total debit is what they asked for.
//  - send: ON TOP. The recipient always gets the exact amount, the 0.25% is
//    added to what the sender pays.
//  The fee is only sent AFTER the main transaction has confirmed, so a failed
//  swap never costs a fee. If the fee transfer itself fails, the main action is
//  already done and stays done: the miss is reported, never thrown.
export const LYRA_FEE_BPS = 25n;
const DENOM = 10000n;
export const LYRA_FEE_PERCENT_LABEL = "0.25%";
export const LYRA_TREASURY = ethers.getAddress("0x0E5599f418b4510ef0D00733895C6Ace14ed4964");

// A fee smaller than this is not worth the network fee of the transfer.
export const MIN_FEE_USD = 0.02;

export const STABLE_SYMBOLS = ["USDC", "USDC.e", "USDT", "USDT0", "EURC", "DAI"];

export function feeOf(amountRaw) {
  return (amountRaw * LYRA_FEE_BPS) / DENOM;
}

// "Included": amount = what the user typed, fee comes out of it.
export function splitIncluded(amountRaw) {
  const fee = feeOf(amountRaw);
  return { fee, net: amountRaw - fee };
}

// "On top": the biggest amount such that amount + fee still fits in totalRaw.
export function splitOnTop(totalRaw) {
  const amount = (totalRaw * DENOM) / (DENOM + LYRA_FEE_BPS);
  return { amount, fee: feeOf(amount) };
}

// Parses a decimal string, cutting extra digits instead of throwing.
export function toRaw(amountStr, decimals) {
  const s = String(amountStr ?? "").trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole, frac = ""] = s.split(".");
  return ethers.parseUnits(`${whole || "0"}.${frac.slice(0, decimals) || "0"}`, decimals);
}

export function isFeeExempt(signerAddress, recipient) {
  const me = String(signerAddress || "").toLowerCase();
  const to = String(recipient || "").toLowerCase();
  const treasury = LYRA_TREASURY.toLowerCase();
  // Moving funds to yourself or to the treasury is not a charge-worthy action.
  return !!to && (to === me || to === treasury);
}

// Which asset the fee is paid in, and how: native coin or ERC-20.
export function assetInfo(asset, { nativeSymbol, tokens }) {
  if (asset === nativeSymbol) return { isNative: true, decimals: 18, address: null };
  const t = tokens?.[asset];
  if (t?.address && t.address !== ethers.ZeroAddress && Number.isInteger(t.decimals)) {
    return { isNative: false, decimals: t.decimals, address: t.address };
  }
  return null;
}

export function usdPerUnit(asset, { nativeSymbol, xplPriceUSD }) {
  if (STABLE_SYMBOLS.includes(asset)) return 1;
  if (asset === nativeSymbol && Number(xplPriceUSD) > 0) return Number(xplPriceUSD);
  return null; // unknown: charge, we can't judge
}

export function feeIsWorthCharging(feeRaw, decimals, unitUsd) {
  if (feeRaw <= 0n) return false;
  if (unitUsd == null) return true;
  return Number(ethers.formatUnits(feeRaw, decimals)) * unitUsd >= MIN_FEE_USD;
}

// The quote on a swap ticket is for the full typed amount; with the fee taken
// out of it the user receives that much less. "998.07 XPL" -> "995.58 XPL".
export function estimateAfterFee(text) {
  const m = String(text ?? "").match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/s);
  if (!m) return text;
  const value = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(value)) return text;
  const decimals = (m[2].split(".")[1] || "").length;
  const scaled = (value * (10000 - Number(LYRA_FEE_BPS))) / 10000;
  return `${m[1]}${scaled.toFixed(Math.min(Math.max(decimals, 2), 8))}${m[3]}`;
}

// What the ticket shows for a fee included in a swap / bridge / stake amount.
export function includedFeePreview(ticket, ctx) {
  const info = assetInfo(ticket.asset, ctx);
  const raw = info ? toRaw(ticket.amount, info.decimals) : null;
  if (!info || !raw || raw <= 0n) return null;
  const { fee, net } = splitIncluded(raw);
  if (!feeIsWorthCharging(fee, info.decimals, usdPerUnit(ticket.asset, ctx))) return null;
  return {
    fee: ethers.formatUnits(fee, info.decimals),
    net: ethers.formatUnits(net, info.decimals),
    asset: ticket.asset,
  };
}

// Sends the fee to the treasury. NEVER throws: returns what happened.
export async function collectLyraFee({ signer, asset, feeRaw, ctx, to = LYRA_TREASURY }) {
  try {
    if (!feeRaw || feeRaw <= 0n) return { collected: false, reason: "no fee" };
    const me = await signer.getAddress();
    if (to.toLowerCase() === me.toLowerCase()) return { collected: false, reason: "same wallet" };
    const info = assetInfo(asset, ctx);
    if (!info) return { collected: false, reason: `${asset} is not a known asset here` };

    let tx;
    if (info.isNative) {
      const balance = await signer.provider.getBalance(me);
      if (balance <= feeRaw) return { collected: false, reason: "not enough balance left for the fee" };
      tx = await signer.sendTransaction({ to, value: feeRaw });
    } else {
      const token = (ctx.makeToken || ((a, abi, r) => new ethers.Contract(a, abi, r)))(info.address, ctx.erc20Abi, signer);
      const balance = await token.balanceOf(me);
      if (balance < feeRaw) return { collected: false, reason: "not enough balance left for the fee" };
      tx = await token.transfer(to, feeRaw);
    }
    await tx.wait();
    return { collected: true, hash: tx.hash, amount: ethers.formatUnits(feeRaw, info.decimals), asset };
  } catch (e) {
    return { collected: false, reason: e?.shortMessage || e?.message || "unknown error" };
  }
}

// Runs a swap / bridge / stake with the fee taken out of its amount.
// `core(signer, ticket)` is the original executor; it only ever sees the net amount.
export async function runWithLyraFee({ signer, ticket, core, ctx }) {
  const info = assetInfo(ticket.asset, ctx);
  const raw = info ? toRaw(ticket.amount, info.decimals) : null;
  if (!info || !raw || raw <= 0n) return core(signer, ticket);

  const { fee, net } = splitIncluded(raw);
  if (net <= 0n || !feeIsWorthCharging(fee, info.decimals, usdPerUnit(ticket.asset, ctx))) {
    return core(signer, ticket);
  }

  const netTicket = { ...ticket, amount: ethers.formatUnits(net, info.decimals) };
  const tx = await core(signer, netTicket);

  // The main action is done. Collecting the fee must never undo that.
  const result = await collectLyraFee({ signer, asset: ticket.asset, feeRaw: fee, ctx });
  ctx.onFee?.(result, { asset: ticket.asset, feeRaw: fee, decimals: info.decimals });
  return tx;
}
