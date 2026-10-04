import { ethers } from "ethers";
import { lookupSpender } from "./knownSpenders.js";
import { readPermission, short, tokenAmount, tokenLabel, tokenAt } from "./readings.js";

// eth_signTypedData_v4 (EIP-712): signatures that apps turn into actions
// later, often without any further transaction from you. This is where most
// modern scams happen (a gasless Permit, a 0 ETH OpenSea listing), so Lyra
// reads the common kinds and says plainly what they allow:
//   - Permit (EIP-2612): a token approval made by signature
//   - Permit2 (Uniswap): approvals and one-time transfers through Permit2
//   - Seaport (OpenSea and others): listings and offers
//   - Polymarket orders
// Anything else is shown as "can't verify", with the raw data.

const MAX_UINT = ethers.MaxUint256;
const MAX_UINT160 = (1n << 160n) - 1n;
const ITEM = { 0: "native", 1: "erc20", 2: "erc721", 3: "erc1155", 4: "erc721", 5: "erc1155" };

// v4 sends [address, json], a few sites send [json, address].
export function parseTypedDataParams(params = []) {
  const raw = ethers.isAddress(params[0]) ? params[1] : params[0];
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data?.types || !data?.primaryType || !data?.message) throw new Error("Malformed typed data.");
  return data;
}

// ethers wants only the types reachable from the primary type, without
// EIP712Domain (it builds the domain itself).
export function signableTypes(data) {
  const keep = {};
  const visit = (name) => {
    const base = name.replace(/\[\d*\]$/, "");
    if (keep[base] || !data.types[base] || base === "EIP712Domain") return;
    keep[base] = data.types[base];
    for (const field of data.types[base]) visit(field.type);
  };
  visit(data.primaryType);
  return keep;
}

const when = (seconds) => {
  const n = Number(seconds);
  if (!n) return null;
  if (n > 4102444800) return "never expires"; // after 2100
  const date = new Date(n * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return n * 1000 < Date.now() ? `already expired on ${date}` : `until ${date}`;
};

const SIGNATURE_NOTE = "This is a free signature, not a transaction: the site can use it as soon as you sign, without asking you again.";

function readErc2612Permit(data, ctx) {
  const { spender, value, deadline } = data.message;
  const token = data.domain.verifyingContract;
  const unlimited = BigInt(value) >= MAX_UINT / 2n;
  const known = lookupSpender(spender, ctx.origin);
  const amount = unlimited ? "an UNLIMITED amount" : tokenAmount(ctx.network.key, token, value);
  const tokenName = tokenAt(ctx.network.key, token)?.symbol || data.domain.name || short(token);
  return readPermission({
    spender,
    origin: ctx.origin,
    title: `Allow ${known?.protocol || short(spender)} to use your ${tokenName}`,
    knownLine: unlimited ? "Unlimited is the usual choice here, so you don't sign again for every use." : `Up to ${amount}.`,
    unknownRisk: unlimited ? "danger" : "warn",
    unknownLines: [
      `It could move ${amount} of your ${tokenName}${when(deadline) ? ` (${when(deadline)})` : ""}.`,
      "Lyra doesn't know this contract. Gasless permits like this one are a favourite of wallet-draining scams.",
    ],
    extraLines: [SIGNATURE_NOTE],
  });
}

function readPermit2(data, ctx) {
  const m = data.message;
  const net = ctx.network.key;
  const known = lookupSpender(m.spender, ctx.origin);
  const who = known?.protocol || short(m.spender);

  // Allowance (AllowanceTransfer): PermitSingle / PermitBatch
  if (m.details) {
    const details = Array.isArray(m.details) ? m.details : [m.details];
    const unlimited = details.some(d => BigInt(d.amount) >= MAX_UINT160 / 2n);
    const list = details.map(d => (BigInt(d.amount) >= MAX_UINT160 / 2n ? `unlimited ${tokenLabel(net, d.token)}` : tokenAmount(net, d.token, d.amount))).join(", ");
    const expiry = when(details[0]?.expiration);
    return readPermission({
      spender: m.spender,
      origin: ctx.origin,
      title: `Allow ${who} to use your ${details.map(d => tokenLabel(net, d.token)).join(", ")} through Permit2`,
      knownLine: `${list}${expiry ? `, ${expiry}` : ""}. This is how ${who} spends your tokens for the swap you're making.`,
      unknownRisk: unlimited ? "danger" : "warn",
      unknownLines: [`It could move ${list}${expiry ? ` (${expiry})` : ""}.`, "Lyra doesn't know who receives this permission."],
      extraLines: [SIGNATURE_NOTE],
    });
  }

  // One-time transfer (SignatureTransfer), including UniswapX-style orders
  const permitted = Array.isArray(m.permitted) ? m.permitted : [m.permitted];
  const list = permitted.map(p => tokenAmount(net, p.token, p.amount)).join(", ");
  return readPermission({
    spender: m.spender,
    origin: ctx.origin,
    title: `Let ${who} take ${list} once`,
    knownLine: `A single transfer of at most ${list}${when(m.deadline) ? `, ${when(m.deadline).startsWith("already") ? "" : "valid "}${when(m.deadline)}` : ""}. Typical for a swap order.`,
    unknownRisk: "warn",
    unknownLines: [`${who} could take ${list} from your wallet, once${when(m.deadline) ? `, ${when(m.deadline)}` : ""}.`, "Lyra doesn't know who receives this."],
    extraLines: [SIGNATURE_NOTE],
  });
}

function describeItem(item, net) {
  const kind = ITEM[Number(item.itemType)];
  const amount = item.startAmount ?? item.amount;
  if (kind === "native") return { text: `${ethers.formatEther(amount)} ${net.nativeSymbol}`, money: true };
  if (kind === "erc20") return { text: tokenAmount(net.key, item.token, amount), money: true };
  const id = BigInt(item.identifierOrCriteria ?? 0);
  const count = kind === "erc1155" && BigInt(amount) > 1n ? `${amount}× ` : "";
  return { text: `${count}NFT ${id > 0n && Number(item.itemType) < 4 ? `#${id}` : "(any item)"} from ${short(item.token)}`, money: false };
}

function readSeaportOrder(data, ctx) {
  const m = data.message;
  const me = ctx.account.toLowerCase();
  const offer = (m.offer || []).map(i => describeItem(i, ctx.network));
  const toMe = (m.consideration || []).filter(c => String(c.recipient).toLowerCase() === me);
  const toOthers = (m.consideration || []).filter(c => String(c.recipient).toLowerCase() !== me);
  const get = toMe.map(i => describeItem(i, ctx.network));
  const give = offer.map(i => i.text).join(", ") || "nothing";
  const known = lookupSpender(data.domain.verifyingContract, ctx.origin);
  const market = known?.protocol?.replace(/ \(Seaport.*\)$/, "") || "the marketplace";

  if (offer.length && get.length === 0) {
    return {
      risk: "danger",
      title: `Give away ${give} for nothing`,
      lines: [
        "This order gives your items to someone and pays you NOTHING in return.",
        "It's the classic marketplace scam: a fake \"sign to verify\" or \"claim\" that is really a 0-price listing.",
      ],
    };
  }

  const isListing = offer.some(i => !i.money);
  const lines = isListing
    ? [`You list ${give} and receive ${get.map(i => i.text).join(", ")} when someone buys it.`, "Nothing moves now: it's only an order the buyer can fill. You can cancel it on the site."]
    : [`You offer ${give} to get ${get.map(i => i.text).join(", ")}.`, "Nothing moves now: the payment only happens if the owner accepts."];
  if (toOthers.length) lines.push(`Fees to others (marketplace, creator): ${toOthers.map(i => describeItem(i, ctx.network).text).join(", ")}.`);
  if (when(m.endTime)) lines.push(when(m.endTime).startsWith("already") ? `This order ${when(m.endTime)}.` : `Valid ${when(m.endTime)}.`);

  return known
    ? {
      risk: "expected",
      title: isListing ? `List ${give} on ${market}` : `Make an offer on ${market}`,
      lines,
      why: {
        heading: `Normal step for ${market}`,
        text: `Marketplaces built on Seaport (like ${market}) work with signed orders: your signature is the listing itself, so it's required to sell or bid. Check the price above, that's what you agree to.`,
        footer: "You can cancel an order on the marketplace before it's filled.",
      },
    }
    : { risk: "warn", title: isListing ? `List ${give}` : "Make an offer", lines: [...lines, "Lyra doesn't know the contract that will execute this order."] };
}

function readPolymarketOrder(data, ctx) {
  const m = data.message;
  const buying = Number(m.side) === 0;
  const usdc = (raw) => `${Number(ethers.formatUnits(raw, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`;
  const shares = (raw) => Number(ethers.formatUnits(raw, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const title = buying ? `Bet ${usdc(m.makerAmount)} on Polymarket` : `Sell ${shares(m.makerAmount)} shares on Polymarket`;
  const lines = [buying ? `For ${shares(m.takerAmount)} shares.` : `For ${usdc(m.takerAmount)}.`];
  const host = new URL(ctx.origin).host;
  return host === "polymarket.com" || host.endsWith(".polymarket.com")
    ? { risk: "expected", title, lines, why: { heading: "Normal step for Polymarket", text: "Polymarket orders are signatures: this is how a bet is placed. Check the amount above.", footer: "Open orders can be cancelled on Polymarket." } }
    : { risk: "warn", title, lines: [...lines, `This is a Polymarket order, but you're on ${host}, not polymarket.com.`] };
}

export function readTypedData(params, ctx) {
  let data;
  try { data = parseTypedDataParams(params); } catch {
    return { risk: "danger", title: "Sign malformed data", lines: ["Lyra can't read this request at all. Don't sign it."] };
  }
  const text = JSON.stringify(data.message, null, 2);
  const domainChain = data.domain?.chainId != null ? Number(data.domain.chainId) : null;
  if (domainChain !== null && domainChain !== Number(ctx.network.chainId)) {
    return { risk: "danger", title: "Signature for another network", lines: [`This signature is for chain ${domainChain}, but Lyra is on ${ctx.network.name}. A site has no normal reason to do that.`], text };
  }

  let reading;
  const name = data.domain?.name;
  const type = data.primaryType;
  if (type === "Permit" && data.message.spender && data.message.value !== undefined) reading = readErc2612Permit(data, ctx);
  else if (name === "Permit2") reading = readPermit2(data, ctx);
  else if (name === "Seaport" && type === "OrderComponents") reading = readSeaportOrder(data, ctx);
  else if (name === "Polymarket CTF Exchange" && type === "Order") reading = readPolymarketOrder(data, ctx);
  else {
    reading = {
      risk: "unknown",
      title: `Sign "${type}" for ${name || "an app"}`,
      lines: [
        `Used by the contract ${short(data.domain?.verifyingContract) || "(none named)"}.`,
        "Lyra can't read this kind of signature yet. Some of them can move funds later: only sign on a site you trust, and read the data below.",
      ],
    };
  }
  // The contract that will use the signature: the backend checks its reputation.
  return { ...reading, text, verifyingContract: data.domain?.verifyingContract || null };
}
