import { DEFI_CONTRACTS_BY_NETWORK } from "../config.js";

// Contracts that legitimately ask for permission to move your tokens or NFTs.
//
// Approving one of these is a normal, required step of using the app (OpenSea
// can't deliver a sold NFT, Uniswap can't swap your USDC, without it), so
// Lyra explains WHY instead of showing the same alarm as for an unknown
// contract. A permission to anything NOT listed here keeps the full warning:
// that's how drainers work, they ask you to approve their own contract.
//
// `shared`: infrastructure many websites build on (Permit2, Seaport, swap
// aggregators), so any site may legitimately ask for it. Otherwise the
// contract belongs to one app, and the request is expected from that app's
// own domains only.

const KIND_TEXT = {
  dex: (p) => `${p} needs permission to move the tokens you swap. Giving it once means your next swaps go through without a new approval (and a new network fee).`,
  aggregator: (p) => `${p} finds the best price across exchanges and needs permission to move the tokens you swap. Many wallets and apps use it.`,
  nft: (p) => `${p} needs this to hand your item (or tokens) to the buyer when an order YOU signed is filled, even if you're offline. It can't take anything without an order signed by you. Every ${p} seller gives this permission.`,
  lending: (p) => `${p} needs permission to move the tokens you deposit into its lending pool. That's how supplying or repaying works.`,
  bridge: (p) => `${p} needs permission to move the tokens you send to another network.`,
  prediction: (p) => `${p} needs permission to use your USDC for the bets you place, and to pay out your winnings.`,
  permit2: () => `Permit2 is a shared contract made by Uniswap and used by many apps. Approving it is a one-time setup step: each app then still needs a separate signature from you, with an amount and an expiry, before it can spend anything.`,
};

const STATIC = [
  { address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", protocol: "Permit2 (Uniswap)", kind: "permit2", shared: true },
  { address: "0x1E0049783F008A0085193E00003D00cd54003c71", protocol: "OpenSea", kind: "nft", shared: true, domains: ["opensea.io"] },
  { address: "0x0000000000000068F116a894984e2DB1123eB395", protocol: "OpenSea (Seaport 1.6)", kind: "nft", shared: true, domains: ["opensea.io"] },
  { address: "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC", protocol: "OpenSea (Seaport 1.5)", kind: "nft", shared: true, domains: ["opensea.io"] },
  { address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", protocol: "Uniswap", kind: "dex", domains: ["uniswap.org"] },
  { address: "0x111111125421cA6dc452d289314280a0f8842A65", protocol: "1inch", kind: "aggregator", shared: true, domains: ["1inch.io", "1inch.com"] },
  { address: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", protocol: "0x / Matcha", kind: "aggregator", shared: true, domains: ["matcha.xyz", "0x.org"] },
  { address: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", protocol: "KyberSwap", kind: "aggregator", shared: true, domains: ["kyberswap.com"] },
  { address: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110", protocol: "CoW Swap", kind: "aggregator", shared: true, domains: ["cow.fi", "swap.cow.fi"] },
  { address: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", protocol: "LI.FI", kind: "bridge", shared: true, domains: ["li.fi", "jumper.exchange"] },
  { address: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", protocol: "Aave", kind: "lending", domains: ["aave.com"] },
];

// Lyra's own integrations (config.js) are known by construction.
function fromLyraConfig() {
  const out = [];
  for (const contracts of Object.values(DEFI_CONTRACTS_BY_NETWORK)) {
    if (contracts.uniswapV3?.router) out.push({ address: contracts.uniswapV3.router, protocol: "Uniswap", kind: "dex", domains: ["uniswap.org"] });
    if (contracts.aave?.pool) out.push({ address: contracts.aave.pool, protocol: "Aave", kind: "lending", domains: ["aave.com"] });
    if (contracts.lifi?.diamond) out.push({ address: contracts.lifi.diamond, protocol: "LI.FI", kind: "bridge", shared: true, domains: ["li.fi", "jumper.exchange"] });
    for (const key of ["ctfExchange", "negRiskExchange"]) {
      if (contracts.polymarket?.[key]) out.push({ address: contracts.polymarket[key], protocol: "Polymarket", kind: "prediction", domains: ["polymarket.com"] });
    }
  }
  return out;
}

const REGISTRY = new Map([...STATIC, ...fromLyraConfig()].map(e => [e.address.toLowerCase(), e]));

const onDomain = (host, domains = []) => domains.some(d => host === d || host.endsWith("." + d));

// What Lyra can say about a contract asking for a permission.
//   null                       -> unknown contract: keep the full warning
//   { expected: true, ... }    -> a normal step for this site
//   { expected: false, ... }   -> a real app's contract, but requested from another site
export function lookupSpender(address, origin) {
  const entry = REGISTRY.get(String(address).toLowerCase());
  if (!entry) return null;
  const host = new URL(origin).host;
  const official = onDomain(host, entry.domains);
  return {
    protocol: entry.protocol,
    why: KIND_TEXT[entry.kind](entry.protocol),
    expected: official || !!entry.shared,
    official,
  };
}
