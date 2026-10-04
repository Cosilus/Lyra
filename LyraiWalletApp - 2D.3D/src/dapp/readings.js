import { ethers } from "ethers";
import { TOKENS_BY_NETWORK } from "../config.js";
import { lookupSpender } from "./knownSpenders.js";

// Shared helpers for reading website requests in plain language
// (transactions in DappRequests.jsx, typed-data signatures in typedData.js).

export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function tokenAt(networkKey, address) {
  const list = TOKENS_BY_NETWORK[networkKey] || {};
  const hit = Object.entries(list).find(([, t]) => t.address?.toLowerCase() === String(address).toLowerCase());
  return hit ? { symbol: hit[0], decimals: hit[1].decimals } : null;
}

// "12.5 USDC", or raw units for a token Lyra doesn't know.
export function tokenAmount(networkKey, tokenAddress, raw) {
  const token = tokenAt(networkKey, tokenAddress);
  return token ? `${ethers.formatUnits(raw, token.decimals)} ${token.symbol}` : `${BigInt(raw).toString()} units of ${short(tokenAddress)}`;
}

export const tokenLabel = (networkKey, tokenAddress) => tokenAt(networkKey, tokenAddress)?.symbol || `the token at ${short(tokenAddress)}`;

// A permission (approve, setApprovalForAll, Permit, Permit2) for a known app
// contract is a normal step of using that app: say so, and say why. For an
// unknown one the full warning stays.
export function readPermission({ spender, origin, title, unknownRisk, unknownLines, knownLine, extraLines = [] }) {
  const known = lookupSpender(spender, origin);
  const host = new URL(origin).host;
  if (known?.expected) {
    return {
      risk: "expected",
      title,
      lines: [knownLine, ...extraLines],
      why: {
        heading: known.official ? `Normal step for ${known.protocol}` : `Normal step: ${host} uses ${known.protocol}`,
        text: known.why,
        footer: "You can remove this permission at any time later (for example on revoke.cash).",
      },
      spender,
    };
  }
  if (known) {
    return {
      risk: "warn",
      title,
      lines: [knownLine, ...extraLines, `This is ${known.protocol}'s official contract, but you're on ${host}, not ${known.protocol}'s website. Fine if this site is built on ${known.protocol}, otherwise stop here.`],
      spender,
    };
  }
  return { risk: unknownRisk, title, lines: [...unknownLines, ...extraLines], spender, unknownSpender: true };
}
