// Network fees without the native coin: when a plan needs a little ETH / POL /
// XPL and the wallet has none, Lyra buys just enough with the user's own
// stablecoins through CoW Protocol, without any fee to advance:
// - the user only SIGNS (an order, and a permit for the stablecoin): no
//   transaction from the wallet, so no gas needed for it;
// - CoW's solvers settle the order on-chain and take their fee out of the
//   stablecoins sold; the permit runs as a pre-hook of that settlement;
// - the native coin lands in the wallet, the plan then runs as usual.
// No account and no API key: CoW's public order book. Ethereum, Base, Polygon
// and Plasma (the same settlement contract everywhere). Arc needs nothing (its
// native coin is USDC). On Plasma a plain USDT0 send needs no XPL (Plasma's
// free USDT0 transfers): see needsNativeGas.
import { ethers } from "ethers";

const COW_API = {
  ethereum: "https://api.cow.fi/mainnet",
  base: "https://api.cow.fi/base",
  polygon: "https://api.cow.fi/polygon",
  plasma: "https://api.cow.fi/plasma",
};
const SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
const VAULT_RELAYER = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
// the stablecoins that can pay, in order of preference
const PAYERS = ["USDC", "USDT0", "USDT", "USDC.e", "USDCE"];
const ORDER_TYPES = {
  Order: [
    { name: "sellToken", type: "address" },
    { name: "buyToken", type: "address" },
    { name: "receiver", type: "address" },
    { name: "sellAmount", type: "uint256" },
    { name: "buyAmount", type: "uint256" },
    { name: "validTo", type: "uint32" },
    { name: "appData", type: "bytes32" },
    { name: "feeAmount", type: "uint256" },
    { name: "kind", type: "string" },
    { name: "partiallyFillable", type: "bool" },
    { name: "sellTokenBalance", type: "string" },
    { name: "buyTokenBalance", type: "string" },
  ],
};
const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function nonces(address) view returns (uint256)",
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
];

export const canTopUp = (networkKey) => !!COW_API[networkKey];

// Does this plan need the native coin for its fees at all? On Arc the native
// coin IS USDC; on Plasma plain USDT0 sends are free; elsewhere yes.
// `steps`: [{ kind, asset }]
export function needsNativeGas(networkKey, steps) {
  if (networkKey === "arc") return false;
  if (networkKey === "plasma" && steps.length > 0 && steps.every(s => s.kind === "send" && /^USDT0?$/i.test(s.asset || ""))) return false;
  return true;
}

// The EIP-2612 domain of a token (its version isn't always readable: found by
// matching its DOMAIN_SEPARATOR). null: no permit, it can't pay without gas.
async function permitDomain(token, chainId) {
  try {
    const [name, separator] = await Promise.all([token.name(), token.DOMAIN_SEPARATOR()]);
    await token.nonces(ethers.ZeroAddress);
    const verifyingContract = await token.getAddress();
    let declared = null;
    try { declared = await token.version(); } catch { /* not exposed */ }
    const candidates = [declared, "1", "2"].filter(Boolean).map(version => ({ name, version, chainId, verifyingContract }));
    candidates.push({ name, chainId, verifyingContract }); // no version field
    return candidates.find(d => ethers.TypedDataEncoder.hashDomain(d).toLowerCase() === separator.toLowerCase()) || null;
  } catch {
    return null;
  }
}

async function cow(networkKey, path, body) {
  const res = await fetch(`${COW_API[networkKey]}/api/v1${path}`, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.description || data?.errorType || `CoW ${res.status}`);
  return data;
}

// Which stablecoin pays, and how much the order would take. null: none can.
async function choosePayer({ wallet, networkKey, tokens, buyNative }) {
  const owner = await wallet.getAddress();
  const { chainId } = await wallet.provider.getNetwork();
  for (const sym of PAYERS) {
    const t = tokens[sym];
    if (!t?.address) continue;
    const token = new ethers.Contract(t.address, ERC20, wallet.provider);
    const balance = await token.balanceOf(owner).catch(() => 0n);
    if (balance === 0n) continue;
    const allowance = await token.allowance(owner, VAULT_RELAYER).catch(() => 0n);
    const domain = allowance > 0n ? null : await permitDomain(token, Number(chainId));
    if (allowance === 0n && !domain) continue; // no permit and no approval: it can't pay without gas
    let quote;
    try {
      quote = await cow(networkKey, "/quote", {
        sellToken: t.address, buyToken: NATIVE, from: owner, receiver: owner,
        kind: "buy", buyAmountAfterFee: buyNative.toString(),
        appData: "{}", signingScheme: "eip712", onchainOrder: false, priceQuality: "optimal",
      });
    } catch { continue; }
    const cost = BigInt(quote.quote.sellAmount) + BigInt(quote.quote.feeAmount);
    if (cost * 12n / 10n > balance) continue;
    return { sym, t, token, domain, allowance, cost, owner, chainId: Number(chainId) };
  }
  return null;
}

// Buys `buyNative` (wei) of the native coin with a stablecoin, signed only.
// Resolves once it landed in the wallet (or throws, nothing taken).
export async function topUpNativeGas({ wallet, networkKey, tokens, buyNative, nativeSymbol, onStatus }) {
  if (!canTopUp(networkKey)) throw new Error("No gas top-up on this network.");
  const payer = await choosePayer({ wallet, networkKey, tokens, buyNative });
  if (!payer) throw new Error(`No ${nativeSymbol} for the network fees, and no stablecoin that can pay for it without a fee. Add a little ${nativeSymbol} first.`);
  const { sym, t, token, domain, allowance, cost, owner, chainId } = payer;
  // at most 30% above the quote (prices move while it settles)
  const sellLimit = cost * 13n / 10n;

  // the permit, as a pre-hook the settlement runs (when there's no approval yet)
  const hooks = [];
  if (allowance < sellLimit && domain) {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const nonce = await token.nonces(owner);
    const sig = ethers.Signature.from(await wallet.signTypedData(domain, {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }, { owner, spender: VAULT_RELAYER, value: sellLimit, nonce, deadline }));
    hooks.push({
      target: t.address,
      callData: new ethers.Interface(ERC20).encodeFunctionData("permit", [owner, VAULT_RELAYER, sellLimit, deadline, sig.v, sig.r, sig.s]),
      gasLimit: "100000",
    });
  } else if (allowance < sellLimit) {
    throw new Error(`${sym} can't pay for the fees here. Add a little ${nativeSymbol} first.`);
  }
  const appData = JSON.stringify({ appCode: "Lyra", metadata: hooks.length ? { hooks: { pre: hooks, version: "0.1.0" } } : {}, version: "1.3.0" });
  const appDataHash = ethers.keccak256(ethers.toUtf8Bytes(appData));

  // the final quote, with the hook's gas in it
  onStatus?.(`Getting ${nativeSymbol} for the network fees…`);
  const q = await cow(networkKey, "/quote", {
    sellToken: t.address, buyToken: NATIVE, from: owner, receiver: owner,
    kind: "buy", buyAmountAfterFee: buyNative.toString(),
    appData, appDataHash, signingScheme: "eip712", onchainOrder: false, priceQuality: "optimal",
  });
  const sellAmount = (BigInt(q.quote.sellAmount) + BigInt(q.quote.feeAmount)) * 102n / 100n;
  if (sellAmount > sellLimit) throw new Error("The price moved while preparing the fees top-up. Try again.");
  const order = {
    sellToken: t.address,
    buyToken: NATIVE,
    receiver: owner,
    sellAmount: sellAmount.toString(),
    buyAmount: buyNative.toString(),
    validTo: Math.floor(Date.now() / 1000) + 20 * 60,
    appData: appDataHash,
    feeAmount: "0",
    kind: "buy",
    partiallyFillable: false,
    sellTokenBalance: "erc20",
    buyTokenBalance: "erc20",
  };
  const signature = await wallet.signTypedData({ name: "Gnosis Protocol", version: "v2", chainId, verifyingContract: SETTLEMENT }, ORDER_TYPES, order);
  const uid = await cow(networkKey, "/orders", { ...order, signingScheme: "eip712", signature, from: owner, appData, appDataHash, quoteId: q.id });

  // settled when the solvers pick it up (usually well under a minute)
  const before = await wallet.provider.getBalance(owner);
  const until = Date.now() + 4 * 60 * 1000;
  while (Date.now() < until) {
    await new Promise(r => setTimeout(r, 4000));
    const o = await cow(networkKey, `/orders/${uid}`).catch(() => null);
    if (o?.status === "fulfilled") return { uid, paid: `${ethers.formatUnits(sellAmount, t.decimals)} ${sym}` };
    if (o?.status === "cancelled" || o?.status === "expired") break;
    if ((await wallet.provider.getBalance(owner)) >= before + buyNative) return { uid, paid: `${ethers.formatUnits(sellAmount, t.decimals)} ${sym}` };
  }
  throw new Error(`The ${nativeSymbol} for the fees didn't arrive in time. Nothing else was sent; try again in a moment.`);
}
