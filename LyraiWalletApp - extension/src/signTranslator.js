// "Translated signatures": turns what a website asks the wallet to sign into
// plain language, so nobody has to read hex or raw JSON before approving.
//
// translateRequest(method, params, ctx) handles the three kinds of requests a
// dApp can make:
//   - personal_sign / eth_sign            a message (often "Sign in with Ethereum")
//   - eth_signTypedData_v4 (and _v3)      structured data (permits, orders...)
//   - eth_sendTransaction                 a transaction (transfers, approvals...)
//
// It returns { kind, title, summary, details: [{ label, value }], risk, warnings }.
// risk is "low" (nothing can move), "medium" (spends or moves funds the user
// can see) or "high" (gives someone else lasting power over funds, or can't be
// understood). Nothing here signs anything.
//
// ctx: { address, nativeSymbol, chainId, tokenInfo(address) -> { symbol, decimals } | null }
// tokenInfo is optional and may be async (it reads the token contract).
import { ethers } from "ethers";

const MAX_UINT256 = (1n << 256n) - 1n;
// Anything this large is an "unlimited" allowance in practice.
const UNLIMITED_FROM = 1n << 200n;
const MAX_UINT160 = (1n << 160n) - 1n;

const KNOWN_FUNCTIONS = new ethers.Interface([
  "function approve(address spender, uint256 amount)",
  "function increaseAllowance(address spender, uint256 addedValue)",
  "function transfer(address to, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function deposit()",
  "function withdraw(uint256 amount)",
]);

export function shortAddress(a) {
  if (!a || typeof a !== "string") return String(a);
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function sameAddress(a, b) {
  try {
    return ethers.getAddress(a) === ethers.getAddress(b);
  } catch {
    return false;
  }
}

async function tokenLabel(ctx, address) {
  try {
    const info = await ctx?.tokenInfo?.(address);
    if (info?.symbol) return { symbol: info.symbol, decimals: Number(info.decimals ?? 18), known: true };
  } catch {
    // unreadable token: fall back to the address
  }
  return { symbol: `token ${shortAddress(address)}`, decimals: null, known: false };
}

function formatAmount(raw, decimals, symbol) {
  const value = BigInt(raw);
  if (value >= UNLIMITED_FROM) return `an unlimited amount of ${symbol}`;
  if (decimals == null) return `${value.toString()} units of ${symbol}`;
  const text = ethers.formatUnits(value, decimals);
  const [whole, frac = ""] = text.split(".");
  const trimmed = frac.replace(/0+$/, "").slice(0, 6);
  return `${Number(whole).toLocaleString("en-US")}${trimmed ? "." + trimmed : ""} ${symbol}`;
}

function formatDeadline(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return "no expiry";
  if (n > 4102444800) return "never (no real expiry)"; // after 2100
  return new Date(n * 1000).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function messageText(hexOrText) {
  if (typeof hexOrText !== "string") return String(hexOrText);
  if (!ethers.isHexString(hexOrText)) return hexOrText;
  try {
    const text = ethers.toUtf8String(hexOrText);
    // Keep it only if it reads like text.
    if (/^[\x09\x0A\x0D\x20-\x7E -￿]*$/.test(text)) return text;
  } catch {
    // not UTF-8
  }
  return null;
}

// EIP-4361 "Sign-In with Ethereum".
function parseSiwe(text) {
  const m = text.match(/^(\S+) wants you to sign in with your Ethereum account:\n(0x[0-9a-fA-F]{40})/);
  if (!m) return null;
  const field = (name) => (text.match(new RegExp(`^${name}: (.+)$`, "m")) || [])[1];
  return { domain: m[1], address: m[2], uri: field("URI"), chainId: field("Chain ID"), expires: field("Expiration Time") };
}

function translateMessage(params, ctx, origin) {
  // personal_sign is [message, address]; eth_sign is [address, message].
  const [a, b] = params || [];
  const raw = ethers.isAddress(a) && !ethers.isAddress(b) ? b : a;
  const text = messageText(raw);

  if (text == null) {
    return {
      kind: "message",
      title: "Sign an unreadable message",
      summary: "This site wants you to sign data that isn't readable text. It could be anything, including a transaction in disguise.",
      details: [{ label: "Data", value: String(raw).slice(0, 140) + (String(raw).length > 140 ? "…" : "") }],
      risk: "high",
      warnings: ["Only sign this if you fully trust the site and know why it needs it."],
    };
  }

  const siwe = parseSiwe(text);
  if (siwe) {
    const warnings = [];
    let host = null;
    try { host = new URL(origin).host; } catch { /* no origin */ }
    if (host && siwe.domain !== host) {
      warnings.push(`The message says it is for ${siwe.domain}, but it was sent by ${host}. This is a common phishing trick.`);
    }
    if (ctx?.address && !sameAddress(siwe.address, ctx.address)) {
      warnings.push("The message names a different wallet address than yours.");
    }
    return {
      kind: "message",
      title: `Sign in to ${siwe.domain}`,
      summary: "This only proves the wallet is yours, like a login. No funds move and it costs nothing.",
      details: [
        { label: "Site", value: siwe.domain },
        ...(siwe.expires ? [{ label: "Valid until", value: siwe.expires }] : []),
      ],
      risk: warnings.length ? "high" : "low",
      warnings,
    };
  }

  return {
    kind: "message",
    title: "Sign a message",
    summary: "This site wants you to sign a text message. Signing it doesn't move any funds and costs nothing.",
    details: [{ label: "Message", value: text.length > 600 ? text.slice(0, 600) + "…" : text }],
    risk: "low",
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Typed data (EIP-712)
// ---------------------------------------------------------------------------

function parseTypedData(params) {
  // eth_signTypedData_v4 is [address, typedData] (typedData often a JSON string).
  const [a, b] = params || [];
  const raw = ethers.isAddress(a) ? b : a;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// Signatures a site must never get. Once an address is delegated (EIP-7702,
// one-transaction plans), an ERC-4337 operation signed with its key is enough
// to move everything in it, with no transaction to approve: a site asking for
// one (typed data for an EntryPoint, a "UserOperation") is refused, always.
const ENTRY_POINTS = [
  "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789", // v0.6
  "0x0000000071727de22e5e9d8baf0edac6f37da032", // v0.7
  "0x4337084d9e255ff0702461cf8895ce9e3b5ff108", // v0.8
  "0x433709009b8330fda32311df1c2afa402ed8d009", // v0.9
];
export function forbiddenSignature(method, params) {
  if (method === "eth_sign") return "Lyra never signs raw hashes for a site: such a signature can authorize anything.";
  if (method !== "eth_signTypedData_v4" && method !== "eth_signTypedData_v3") return null;
  let data;
  try { data = parseTypedData(params); } catch { return null; }
  const domain = data?.domain || {};
  const typeNames = Object.keys(data?.types || {});
  const userOp = /useroperation/i.test(String(data?.primaryType || "")) || typeNames.some(t => /useroperation/i.test(t));
  const entryPoint = ENTRY_POINTS.includes(String(domain.verifyingContract || "").toLowerCase()) || /^erc-?4337$|entry ?point/i.test(String(domain.name || ""));
  return userOp || entryPoint
    ? "This is an account-abstraction operation (ERC-4337). Signed, it would let the site move everything in your wallet without any transaction to approve. Lyra blocks it."
    : null;
}

async function translateTypedData(params, ctx) {
  let data;
  try {
    data = parseTypedData(params);
  } catch {
    return unreadable("typed", "This site sent structured data that can't be read.");
  }
  {
    const forbidden = forbiddenSignature("eth_signTypedData_v4", params);
    if (forbidden) {
      return { kind: "typed", title: "Lyra blocked this signature", summary: forbidden, details: [], risk: "blocked", warnings: ["Close this window. A site you trust never needs this."] };
    }
  }
  const { domain = {}, primaryType, message = {} } = data || {};
  const app = domain.name ? `${domain.name}` : "a contract";
  const warnings = [];

  if (domain.chainId != null && ctx?.chainId != null && Number(domain.chainId) !== Number(ctx.chainId)) {
    warnings.push(`It is for another network (chain ${Number(domain.chainId)}), not the one you are on.`);
  }

  // EIP-2612 permit: gasless approval of an ERC-20 allowance.
  if (primaryType === "Permit" && message.spender && message.value != null) {
    const token = await tokenLabel(ctx, domain.verifyingContract);
    const symbol = token.known ? token.symbol : domain.name || token.symbol;
    const unlimited = BigInt(message.value) >= UNLIMITED_FROM;
    if (unlimited) warnings.push("The amount is unlimited: the spender could take all of this token, now and later.");
    return {
      kind: "typed",
      title: `Allow spending of your ${symbol}`,
      summary: `This signature lets ${shortAddress(message.spender)} take ${formatAmount(message.value, token.decimals, symbol)} from your wallet, without asking you again, until ${formatDeadline(message.deadline)}.`,
      details: [
        { label: "Spender", value: message.spender },
        { label: "Amount", value: formatAmount(message.value, token.decimals, symbol) },
        { label: "Expires", value: formatDeadline(message.deadline) },
      ],
      risk: "high",
      warnings: [...warnings, "Signing costs nothing, but it works like handing over a key: only sign for a site you trust."],
    };
  }

  // Uniswap Permit2 (single / batch allowance, or one-off transfer).
  if ((primaryType === "PermitSingle" || primaryType === "PermitBatch") && message.spender) {
    const list = primaryType === "PermitSingle" ? [message.details] : message.details || [];
    const lines = [];
    for (const d of list) {
      if (!d) continue;
      const token = await tokenLabel(ctx, d.token);
      const unlimited = BigInt(d.amount) >= MAX_UINT160;
      if (unlimited) warnings.push(`Unlimited amount of ${token.symbol}.`);
      lines.push(`${unlimited ? `all your ${token.symbol}` : formatAmount(d.amount, token.decimals, token.symbol)} until ${formatDeadline(d.expiration)}`);
    }
    return {
      kind: "typed",
      title: "Allow spending of your tokens (Permit2)",
      summary: `This signature lets ${shortAddress(message.spender)} take ${lines.join(", ")} from your wallet through Permit2, without asking you again.`,
      details: [
        { label: "Spender", value: message.spender },
        ...lines.map((l, i) => ({ label: list.length > 1 ? `Token ${i + 1}` : "Allowance", value: l })),
        { label: "Signature valid until", value: formatDeadline(message.sigDeadline) },
      ],
      risk: "high",
      warnings: [...warnings, "Only sign for a site you trust: this is an approval, not a payment."],
    };
  }
  if ((primaryType === "PermitTransferFrom" || primaryType === "PermitBatchTransferFrom") && message.spender) {
    const perms = Array.isArray(message.permitted) ? message.permitted : [message.permitted];
    const parts = [];
    for (const p of perms) {
      if (!p) continue;
      const token = await tokenLabel(ctx, p.token);
      parts.push(formatAmount(p.amount, token.decimals, token.symbol));
    }
    return {
      kind: "typed",
      title: "Let a site move your tokens once",
      summary: `This signature lets ${shortAddress(message.spender)} move up to ${parts.join(", ")} out of your wallet, one time, until ${formatDeadline(message.deadline)}.`,
      details: [{ label: "Spender", value: message.spender }, ...parts.map((p) => ({ label: "Amount", value: p }))],
      risk: "medium",
      warnings,
    };
  }

  // Seaport (OpenSea and others): listing NFTs / tokens for sale.
  if (primaryType === "OrderComponents" && Array.isArray(message.offer)) {
    const gives = message.offer.map((o) => describeSeaportItem(o)).join(", ");
    const mine = (message.consideration || []).filter((c) => ctx?.address && sameAddress(c.recipient, ctx.address));
    const gets = mine.map((c) => describeSeaportItem(c, true)).join(", ") || "nothing for you";
    return {
      kind: "typed",
      title: "List items for sale",
      summary: `You offer ${gives} and receive ${gets} if someone accepts, until ${formatDeadline(message.endTime)}.`,
      details: [
        { label: "You give", value: gives },
        { label: "You receive", value: gets },
        { label: "Marketplace", value: app },
      ],
      risk: "medium",
      warnings: mine.length ? warnings : [...warnings, "None of the payment in this order goes to your wallet."],
    };
  }

  // Polymarket / CTF orders.
  if (primaryType === "Order" && message.makerAmount != null && message.takerAmount != null) {
    return {
      kind: "typed",
      title: `Place an order on ${app}`,
      summary: `This signs a trading order on ${app}. It can be filled by the exchange as long as it is open.`,
      details: [
        { label: "Side", value: Number(message.side) === 0 ? "Buy" : "Sell" },
        { label: "You pay (raw units)", value: String(message.makerAmount) },
        { label: "You get (raw units)", value: String(message.takerAmount) },
      ],
      risk: "medium",
      warnings,
    };
  }

  // Anything else: show the fields, flag it as not understood.
  const fields = Object.entries(message).slice(0, 8).map(([k, v]) => ({
    label: k,
    value: typeof v === "object" ? JSON.stringify(v).slice(0, 120) : String(v),
  }));
  return {
    kind: "typed",
    title: `Sign data for ${app}`,
    summary: `This site asks you to sign "${primaryType || "data"}" for ${app}. Lyra doesn't recognize this kind of request, so check the details below.`,
    details: [
      ...(domain.verifyingContract ? [{ label: "Contract", value: domain.verifyingContract }] : []),
      ...fields,
    ],
    risk: "medium",
    warnings,
  };
}

function describeSeaportItem(item, isConsideration = false) {
  const type = Number(item.itemType);
  const amount = isConsideration ? item.startAmount : item.startAmount;
  switch (type) {
    case 0: return `${ethers.formatEther(BigInt(amount))} of the network coin`;
    case 1: return `${amount} units of token ${shortAddress(item.token)}`;
    case 2: return `NFT #${item.identifierOrCriteria} of ${shortAddress(item.token)}`;
    case 3: return `${amount} × item #${item.identifierOrCriteria} of ${shortAddress(item.token)}`;
    default: return `items of ${shortAddress(item.token)}`;
  }
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

async function translateTransaction(params, ctx) {
  const tx = (params && params[0]) || {};
  const native = ctx?.nativeSymbol || "coins";
  const value = tx.value ? BigInt(tx.value) : 0n;
  const data = tx.data || tx.input || "0x";
  const to = tx.to;
  const warnings = [];
  const valueText = `${trimFloat(ethers.formatEther(value))} ${native}`;

  if (!to) {
    return {
      kind: "tx",
      title: "Deploy a contract",
      summary: `This creates a new smart contract from your wallet${value > 0n ? ` and sends ${valueText} to it` : ""}.`,
      details: [],
      risk: "medium",
      warnings,
    };
  }

  if (!data || data === "0x") {
    return {
      kind: "tx",
      title: `Send ${valueText}`,
      summary: `This sends ${valueText} from your wallet to ${shortAddress(to)}.`,
      details: [{ label: "To", value: to }, { label: "Amount", value: valueText }],
      risk: "medium",
      warnings,
    };
  }

  let call = null;
  try {
    call = KNOWN_FUNCTIONS.parseTransaction({ data, value });
  } catch {
    call = null;
  }

  const extra = value > 0n ? [{ label: "Also sends", value: valueText }] : [];

  if (call?.name === "approve" || call?.name === "increaseAllowance") {
    const [spender, amount] = call.args;
    const token = await tokenLabel(ctx, to);
    if (BigInt(amount) === 0n) {
      return {
        kind: "tx",
        title: `Remove an allowance on ${token.symbol}`,
        summary: `This cancels ${shortAddress(spender)}'s permission to spend your ${token.symbol}. That's a safe, protective action.`,
        details: [{ label: "Spender", value: spender }, ...extra],
        risk: "low",
        warnings,
      };
    }
    const unlimited = BigInt(amount) >= UNLIMITED_FROM;
    if (unlimited) warnings.push("The amount is unlimited: the spender could take all of this token, now and later.");
    return {
      kind: "tx",
      title: `Allow spending of your ${token.symbol}`,
      summary: `This lets ${shortAddress(spender)} take ${formatAmount(amount, token.decimals, token.symbol)} from your wallet whenever it wants. Nothing is sent right now.`,
      details: [{ label: "Spender", value: spender }, { label: "Amount", value: formatAmount(amount, token.decimals, token.symbol) }, ...extra],
      risk: unlimited ? "high" : "medium",
      warnings,
    };
  }

  if (call?.name === "transfer") {
    const [recipient, amount] = call.args;
    const token = await tokenLabel(ctx, to);
    return {
      kind: "tx",
      title: `Send ${formatAmount(amount, token.decimals, token.symbol)}`,
      summary: `This sends ${formatAmount(amount, token.decimals, token.symbol)} from your wallet to ${shortAddress(recipient)}.`,
      details: [{ label: "To", value: recipient }, { label: "Amount", value: formatAmount(amount, token.decimals, token.symbol) }, ...extra],
      risk: "medium",
      warnings,
    };
  }

  if (call?.name === "transferFrom" || call?.name === "safeTransferFrom") {
    const [from, recipient, amountOrId] = call.args;
    const fromYou = ctx?.address && sameAddress(from, ctx.address);
    const token = call.name === "transferFrom" ? await tokenLabel(ctx, to) : null;
    const what = token && token.known ? formatAmount(amountOrId, token.decimals, token.symbol) : `item #${amountOrId} of ${shortAddress(to)}`;
    return {
      kind: "tx",
      title: fromYou ? `Send ${what}` : "Move tokens between wallets",
      summary: fromYou
        ? `This sends ${what} from your wallet to ${shortAddress(recipient)}.`
        : `This moves ${what} from ${shortAddress(from)} to ${shortAddress(recipient)}.`,
      details: [{ label: "From", value: from }, { label: "To", value: recipient }, ...extra],
      risk: "medium",
      warnings,
    };
  }

  if (call?.name === "setApprovalForAll") {
    const [operator, approved] = call.args;
    if (!approved) {
      return {
        kind: "tx",
        title: "Remove access to a collection",
        summary: `This cancels ${shortAddress(operator)}'s control over your items in collection ${shortAddress(to)}. That's a safe, protective action.`,
        details: [{ label: "Operator", value: operator }, ...extra],
        risk: "low",
        warnings,
      };
    }
    return {
      kind: "tx",
      title: "Give control of a whole collection",
      summary: `This lets ${shortAddress(operator)} move ALL your items in collection ${shortAddress(to)}, now and later, without asking you again.`,
      details: [{ label: "Operator", value: operator }, { label: "Collection", value: to }, ...extra],
      risk: "high",
      warnings: ["This is the most common way NFTs get stolen. Only approve a marketplace you trust."],
    };
  }

  if (call?.name === "deposit" && value > 0n) {
    return {
      kind: "tx",
      title: `Wrap ${valueText}`,
      summary: `This converts ${valueText} into its token version (wrapped) at ${shortAddress(to)}.`,
      details: [{ label: "Contract", value: to }],
      risk: "medium",
      warnings,
    };
  }

  // Unknown contract call.
  return {
    kind: "tx",
    title: "Interact with a contract",
    summary: `This calls function ${data.slice(0, 10)} on contract ${shortAddress(to)}${value > 0n ? ` and sends it ${valueText}` : ""}. Lyra can't tell exactly what it does.`,
    details: [{ label: "Contract", value: to }, { label: "Function", value: data.slice(0, 10) }, ...extra],
    risk: value > 0n ? "high" : "medium",
    warnings: ["Lyra couldn't decode this call: only continue if you trust this site."],
  };
}

function trimFloat(text) {
  const [w, f = ""] = text.split(".");
  const t = f.replace(/0+$/, "").slice(0, 6);
  return t ? `${w}.${t}` : w;
}

function unreadable(kind, summary) {
  return { kind, title: "Unreadable request", summary, details: [], risk: "high", warnings: ["Don't sign what you can't read."] };
}

// ---------------------------------------------------------------------------

export const SIGNING_METHODS = ["personal_sign", "eth_sign", "eth_signTypedData_v4", "eth_signTypedData_v3", "eth_sendTransaction"];

export async function translateRequest(method, params, ctx = {}, origin = "") {
  try {
    if (method === "personal_sign" || method === "eth_sign") return translateMessage(params, ctx, origin);
    if (method === "eth_signTypedData_v4" || method === "eth_signTypedData_v3") return await translateTypedData(params, ctx);
    if (method === "eth_sendTransaction") return await translateTransaction(params, ctx);
  } catch (e) {
    return unreadable("unknown", `Lyra couldn't read this request (${e?.message || "unknown error"}).`);
  }
  return unreadable("unknown", `Unsupported request: ${method}.`);
}

export { MAX_UINT256 };
