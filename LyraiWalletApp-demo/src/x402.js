// x402 (HTTP 402 "Payment Required") protocol client, hand-rolled
// against the real, published v2 spec and cross-checked line-by-line
// against Coinbase's own reference implementation
// (@x402/evm@2.26.0's src/exact/client/eip3009.ts, read directly from
// the published npm tarball, not guessed), the same "verify against
// the real source, then implement directly with ethers" approach
// already used for multisig.js (Safe) rather than pulling in the
// vendor SDK, since the actual cryptographic surface here is small
// (one EIP-712 signature) and this needs custom orchestration around
// it (spend limits, biometric gate, smart liquidity routing) that the
// SDK's own auto-pay wrapper has no hook for anyway.
//
// Flow: a resource server answers a request with HTTP 402 and a JSON
// body shaped like PaymentRequired (below). The client picks one
// entry from "accepts", signs an EIP-3009 transferWithAuthorization
// (an off-chain authorization, no gas, nothing broadcast yet) for
// that exact asset/amount/recipient, and retries the same request
// with an "X-PAYMENT" header carrying base64(JSON.stringify(payload)).
// The resource server (via a facilitator) verifies the signature and
// settles it on-chain, then serves the resource.
import { ethers } from "ethers";

export const X402_VERSION = 2;

// EIP-3009's TransferWithAuthorization struct, verified verbatim
// against @x402/evm's authorizationTypes constant.
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

export function caip2ChainId(network) {
  if (typeof network !== "string" || !network.startsWith("eip155:")) {
    return null;
  }
  const id = Number.parseInt(network.split(":")[1], 10);
  return Number.isFinite(id) ? id : null;
}

// Picks the first requirement (from the 402 body's "accepts" array)
// whose network is one of Lyra's own supported chains, paired with
// which of Lyra's networks that is. Returns null if the resource
// server only accepts payment on a chain Lyra doesn't support at all
// (e.g. Solana), the caller reports that plainly instead of guessing.
export function selectPaymentRequirement(paymentRequired, networks) {
  const accepts = Array.isArray(paymentRequired?.accepts) ? paymentRequired.accepts : [];
  for (const requirement of accepts) {
    // Only the "exact" scheme paid with an EIP-3009 authorization is
    // implemented here. Real v2 servers list several options (Permit2,
    // batch settlement, Solana...), skip anything else instead of
    // signing something the server can't verify. The EIP-712 domain
    // (name/version) is required to sign at all.
    if (requirement.scheme && requirement.scheme !== "exact") continue;
    if (isGatewayRequirement(requirement)) continue; // Nanopayments option: signed differently, see selectGatewayOptions
    const transferMethod = requirement.extra?.assetTransferMethod;
    if (transferMethod && transferMethod !== "eip3009") continue;
    if (!requirement.extra?.name || !requirement.extra?.version) continue;
    const chainId = caip2ChainId(requirement.network);
    const network = networks.find(n => n.chainId === chainId);
    if (network) {
      // Some servers only fill maxAmountRequired (the v1 field name).
      return { requirement: { ...requirement, amount: requirement.amount ?? requirement.maxAmountRequired }, network };
    }
  }
  return null;
}

// v2 servers return the payment terms base64-encoded in the
// PAYMENT-REQUIRED response header (the body can be empty).
export function decodePaymentRequiredHeader(headerValue) {
  if (!headerValue) return null;
  try {
    return JSON.parse(base64DecodeUtf8(headerValue));
  } catch {
    return null;
  }
}

// Signs the EIP-3009 authorization for one payment requirement.
// `signer` is a plain ethers Wallet/Signer, exactly what the rest of
// the app already uses, no adapter/shim needed: ethers' own
// signTypedData(domain, types, value) takes the same three pieces
// the spec's EIP-712 signature is defined over.
export async function signX402Payment(signer, requirement, resource) {
  const chainId = caip2ChainId(requirement.network);
  if (!chainId) {
    throw new Error(`Unsupported x402 network identifier: ${requirement.network}`);
  }
  const { name, version } = requirement.extra || {};
  if (!name || !version) {
    throw new Error(`This payment requirement is missing its EIP-712 domain (name/version) for ${requirement.asset}.`);
  }

  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: await signer.getAddress(),
    to: ethers.getAddress(requirement.payTo),
    value: String(requirement.amount),
    validAfter: "0",
    validBefore: String(now + (requirement.maxTimeoutSeconds || 60)),
    nonce,
  };

  const domain = {
    name,
    version,
    chainId,
    verifyingContract: ethers.getAddress(requirement.asset),
  };
  const message = {
    from: authorization.from,
    to: authorization.to,
    value: BigInt(authorization.value),
    validAfter: BigInt(authorization.validAfter),
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce,
  };

  const signature = await signer.signTypedData(domain, TRANSFER_WITH_AUTHORIZATION_TYPES, message);

  return {
    x402Version: X402_VERSION,
    resource,
    accepted: requirement,
    payload: { authorization, signature },
  };
}

// ============================================================
// Circle Gateway "Nanopayments" (x402 paid from a prepaid USDC balance)
// ============================================================
// Written against Circle's own docs and the code of their official
// @circle-fin/x402-batching 3.5.0 client (read directly from the npm
// tarball, the same "verify against the real source" approach as the
// EIP-3009 flow above). The idea: deposit USDC ONCE into Circle's
// Gateway Wallet contract (an on-chain transaction), then every payment
// is just an off-chain signature, no gas, and Circle settles thousands of
// them in one batch. That is what makes sub-cent prices possible.
//
// Same "exact" scheme and same EIP-3009 struct as a normal x402 payment,
// but a different EIP-712 domain: name "GatewayWalletBatched", and the
// verifyingContract is the Gateway Wallet, not the USDC contract.
export const GATEWAY_BATCHING_NAME = "GatewayWalletBatched";
export const GATEWAY_BATCHING_VERSION = "1";
export const GATEWAY_WALLET_MAINNET = "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE";
export const GATEWAY_API_URL = "https://gateway-api.circle.com/v1";
export const GATEWAY_WALLET_ABI = ["function deposit(address token, uint256 value)"];
// Gateway's own domain ids (same as CCTP), and the native USDC on each of
// the four networks Lyra supports that Gateway also supports.
export const GATEWAY_NETWORKS = {
  ethereum: { domain: 0, usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", creditTime: "about 15 minutes" },
  base: { domain: 6, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", creditTime: "about 15 minutes" },
  polygon: { domain: 7, usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", creditTime: "a few seconds" },
  arc: { domain: 26, usdc: "0x3600000000000000000000000000000000000000", creditTime: "about a second" },
};

// Gateway signs authorizations that stay valid for a week or more so it
// can batch them, so the requested timeout is never shorter than this.
const GATEWAY_MIN_AUTH_VALIDITY_SECONDS = 7 * 24 * 60 * 60 + 100;

export function isGatewayRequirement(requirement) {
  return requirement?.extra?.name === GATEWAY_BATCHING_NAME && requirement?.extra?.version === GATEWAY_BATCHING_VERSION;
}

// Every Gateway payment option this wallet could use: right scheme, a
// network Lyra supports AND Gateway supports, and (safety) the
// verifyingContract must be Circle's real Gateway Wallet. Never sign an
// authorization against an arbitrary contract a seller names.
export function selectGatewayOptions(paymentRequired, networks) {
  const accepts = Array.isArray(paymentRequired?.accepts) ? paymentRequired.accepts : [];
  const options = [];
  for (const requirement of accepts) {
    if (requirement.scheme && requirement.scheme !== "exact") continue;
    if (!isGatewayRequirement(requirement)) continue;
    const verifying = String(requirement.extra.verifyingContract || "").toLowerCase();
    if (verifying !== GATEWAY_WALLET_MAINNET.toLowerCase()) continue;
    const chainId = caip2ChainId(requirement.network);
    const network = networks.find(n => n.chainId === chainId && GATEWAY_NETWORKS[n.key]);
    if (!network) continue;
    const gw = GATEWAY_NETWORKS[network.key];
    if (String(requirement.asset || "").toLowerCase() !== gw.usdc.toLowerCase()) continue;
    options.push({ requirement: { ...requirement, amount: requirement.amount ?? requirement.maxAmountRequired }, network });
  }
  return options;
}

// Gateway USDC balances for one address, per Lyra network key, in USDC
// (a plain number). The Gateway API is public and allows browser calls.
export async function fetchGatewayBalances(address) {
  const entries = Object.entries(GATEWAY_NETWORKS);
  const results = await Promise.all(entries.map(async ([key, { domain }]) => {
    try {
      const res = await fetch(`${GATEWAY_API_URL}/balances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "USDC", sources: [{ depositor: address, domain }] }),
      });
      if (!res.ok) return [key, 0];
      const data = await res.json();
      return [key, Number(data?.balances?.[0]?.balance ?? 0) || 0];
    } catch {
      return [key, 0];
    }
  }));
  return Object.fromEntries(results);
}

// Signs the Gateway EIP-3009 authorization, exactly like the official
// BatchEvmScheme: validAfter 10 minutes in the past, validBefore at least
// a week ahead, GatewayWalletBatched domain against the Gateway Wallet.
export async function signGatewayPayment(signer, requirement, resource) {
  const chainId = caip2ChainId(requirement.network);
  if (!chainId) throw new Error(`Unsupported x402 network identifier: ${requirement.network}`);
  if (!isGatewayRequirement(requirement)) throw new Error("This payment option isn't a Circle Nanopayments option.");
  const verifyingContract = ethers.getAddress(requirement.extra.verifyingContract);
  if (verifyingContract !== ethers.getAddress(GATEWAY_WALLET_MAINNET)) {
    throw new Error("Refusing to sign: the payment names a contract that isn't Circle's Gateway Wallet.");
  }

  const now = Math.floor(Date.now() / 1000);
  const validityWindow = Math.max(Number(requirement.maxTimeoutSeconds) || 0, GATEWAY_MIN_AUTH_VALIDITY_SECONDS);
  const authorization = {
    from: await signer.getAddress(),
    to: ethers.getAddress(requirement.payTo),
    value: String(requirement.amount),
    validAfter: String(now - 600),
    validBefore: String(now + validityWindow),
    nonce: ethers.hexlify(ethers.randomBytes(32)),
  };
  const domain = { name: GATEWAY_BATCHING_NAME, version: GATEWAY_BATCHING_VERSION, chainId, verifyingContract };
  const message = {
    from: authorization.from,
    to: authorization.to,
    value: BigInt(authorization.value),
    validAfter: BigInt(authorization.validAfter),
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce,
  };
  const signature = await signer.signTypedData(domain, TRANSFER_WITH_AUTHORIZATION_TYPES, message);
  return {
    x402Version: X402_VERSION,
    resource,
    accepted: requirement,
    payload: { authorization, signature },
  };
}

// Real UTF-8-safe base64 (JSON can contain non-Latin1 text, e.g. a
// resource description in another language; plain btoa() throws on
// that), matching the encode/decode Biometric.js already uses for
// binary payloads, just fed a UTF-8 byte string instead.
function base64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64DecodeUtf8(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodePaymentHeader(paymentPayload) {
  return base64EncodeUtf8(JSON.stringify(paymentPayload));
}

// Some x402 servers don't put the settlement transaction hash in their
// PAYMENT-RESPONSE header (or omit the header). The payment itself is an
// EIP-3009 authorization, and the USDC contract emits
// AuthorizationUsed(authorizer, nonce) when anyone submits it on-chain,
// so the settlement transaction can be found from the authorization we
// signed ourselves: same authorizer, same nonce. Best effort: returns
// null if nothing shows up within a few tries.
export async function findEip3009SettlementTx(provider, asset, authorization, { attempts = 4, delayMs = 2500, lookbackBlocks = 1000 } = {}) {
  const topic0 = ethers.id("AuthorizationUsed(address,bytes32)");
  const authorizerTopic = ethers.zeroPadValue(authorization.from, 32);
  for (let i = 0; i < attempts; i++) {
    try {
      const latest = await provider.getBlockNumber();
      const logs = await provider.getLogs({
        address: asset,
        topics: [topic0, authorizerTopic, authorization.nonce],
        fromBlock: Math.max(0, latest - lookbackBlocks),
        toBlock: latest,
      });
      if (logs.length) return logs[0].transactionHash;
    } catch {
      // RPC hiccup or range limit: try again below
    }
    if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return null;
}

export function decodePaymentResponseHeader(headerValue) {
  if (!headerValue) return null;
  try {
    return JSON.parse(base64DecodeUtf8(headerValue));
  } catch {
    return null;
  }
}
