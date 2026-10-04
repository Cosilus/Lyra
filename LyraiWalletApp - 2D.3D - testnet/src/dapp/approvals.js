import { ethers } from "ethers";
import { TOKENS_BY_NETWORK } from "../config.js";
import { loadAuditLog } from "../auditLog.js";
import { KNOWN_SPENDER_ADDRESSES, spenderName } from "./knownSpenders.js";

// "Which apps can spend my tokens?" for the chat (MANAGE_APPROVALS), and the
// transaction that takes a permission back.
//
// Lyra checks, on the active network, every pair it has a reason to suspect:
//   - each token Lyra lists for this network x each known app contract
//   - every permission given through Lyra's extension (kept in the audit
//     trail, see DappRequests.jsx), tokens and NFT collections alike
// in one Multicall3 call. A permission given elsewhere to a contract Lyra
// doesn't know about can't be found this way (that needs an indexer).

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const multicall = new ethers.Interface([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])",
]);
const tokenIface = new ethers.Interface([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function approve(address spender, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

// Permissions given through the extension, from the audit trail.
function recordedApprovals(networkKey) {
  return loadAuditLog()
    .filter(e => e.category === "dapp" && e.networkKey === networkKey && e.meta?.approval)
    .map(e => e.meta.approval);
}

export async function scanApprovals({ rpcUrl, chainId, owner, networkKey }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
  const tokens = Object.entries(TOKENS_BY_NETWORK[networkKey] || {})
    .filter(([, t]) => t.address)
    .map(([symbol, t]) => ({ address: t.address.toLowerCase(), symbol, decimals: t.decimals }));

  const pairs = new Map(); // "token:spender:kind" -> pair
  const add = (token, spender, kind) => pairs.set(`${token}:${spender}:${kind}`.toLowerCase(), { token: token.toLowerCase(), spender: spender.toLowerCase(), kind });
  for (const t of tokens) for (const s of KNOWN_SPENDER_ADDRESSES) add(t.address, s, "erc20");
  for (const a of recordedApprovals(networkKey)) add(a.token, a.spender, a.all ? "nft" : "erc20");
  const list = [...pairs.values()];
  if (!list.length) return [];

  const calls = list.map(p => ({
    target: p.token,
    allowFailure: true,
    callData: p.kind === "nft"
      ? tokenIface.encodeFunctionData("isApprovedForAll", [owner, p.spender])
      : tokenIface.encodeFunctionData("allowance", [owner, p.spender]),
  }));
  const raw = await provider.call({ to: MULTICALL3, data: multicall.encodeFunctionData("aggregate3", [calls]) });
  const [results] = multicall.decodeFunctionResult("aggregate3", raw);

  const active = [];
  for (let i = 0; i < list.length; i++) {
    const { success, returnData } = results[i];
    if (!success || returnData === "0x") continue;
    const p = list[i];
    if (p.kind === "nft") {
      if (tokenIface.decodeFunctionResult("isApprovedForAll", returnData)[0]) active.push({ ...p, unlimited: true });
    } else {
      const amount = tokenIface.decodeFunctionResult("allowance", returnData)[0];
      if (amount > 0n) active.push({ ...p, amount });
    }
  }

  // Names and readable amounts.
  for (const a of active) {
    const known = tokens.find(t => t.address === a.token);
    let symbol = known?.symbol, decimals = known?.decimals;
    if (!symbol) {
      try { symbol = await new ethers.Contract(a.token, tokenIface, provider).symbol(); } catch { symbol = null; }
    }
    if (a.kind === "erc20" && decimals == null) {
      try { decimals = Number(await new ethers.Contract(a.token, tokenIface, provider).decimals()); } catch { decimals = null; }
    }
    a.symbol = symbol || `${a.token.slice(0, 6)}…${a.token.slice(-4)}`;
    a.spenderName = spenderName(a.spender) || `${a.spender.slice(0, 6)}…${a.spender.slice(-4)}`;
    if (a.kind === "erc20") {
      a.unlimited = a.amount >= ethers.MaxUint256 / 2n;
      a.amountText = a.unlimited ? "unlimited" : decimals == null ? a.amount.toString() : ethers.formatUnits(a.amount, decimals);
      a.amount = a.amount.toString();
    } else {
      a.amountText = "all items";
    }
  }
  return active;
}

export const describeApproval = (a) => `${a.symbol} → ${a.spenderName}: ${a.amountText}`;

// The transaction that takes the permission back.
export function revokeTx(a) {
  return {
    to: a.token,
    data: a.kind === "nft"
      ? tokenIface.encodeFunctionData("setApprovalForAll", [a.spender, false])
      : tokenIface.encodeFunctionData("approve", [a.spender, 0n]),
  };
}
