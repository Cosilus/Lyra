// Ported from Lyra-iWallet's App.jsx (getOrDeriveClobCreds /
// buildPolyHmacSignature), adapted from browser SubtleCrypto to Node's
// crypto module. Talks to clob.polymarket.com directly instead of
// through Lyra's own backend proxy (this bot is standalone).
import crypto from "node:crypto";
import { CLOB_API_BASE } from "./polymarketConfig.js";
import { fetchJson } from "./net.js";

let cachedCreds = null;

// L1 auth: sign a fixed EIP-712 message with the raw EOA to prove wallet
// control, then create-or-derive this account's standing CLOB API key.
// Always signed by the plain EOA (signer.getAddress()), even for a
// POLY_1271 deposit-wallet maker. Confirmed against Polymarket's own
// reference client, L1 auth has no maker/funder concept at all.
export async function getOrDeriveClobCreds(wallet) {
  if (cachedCreds) return cachedCreds;

  const address = await wallet.getAddress();
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = 0;
  const domain = { name: "ClobAuthDomain", version: "1", chainId: 137 };
  const types = {
    ClobAuth: [
      { name: "address", type: "address" },
      { name: "timestamp", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "message", type: "string" },
    ],
  };
  const value = {
    address,
    timestamp: String(timestamp),
    nonce,
    message: "This message attests that I control the given wallet",
  };
  const signature = await wallet.signTypedData(domain, types, value);

  const l1Headers = {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: String(timestamp),
    POLY_NONCE: String(nonce),
  };

  let res = await fetchJson(`${CLOB_API_BASE}/auth/api-key`, { method: "POST", headers: l1Headers });
  let creds = res.data;

  if (!res.ok || !creds?.apiKey) {
    res = await fetchJson(`${CLOB_API_BASE}/auth/derive-api-key`, { method: "GET", headers: l1Headers });
    creds = res.data;
    if (!res.ok || !creds?.apiKey) {
      throw new Error(creds?.error || `Polymarket rejected the authentication request for this wallet (HTTP ${res.status}).`);
    }
  }

  cachedCreds = { key: creds.apiKey, secret: creds.secret, passphrase: creds.passphrase, address };
  return cachedCreds;
}

// Same HMAC scheme as Polymarket's own clob-client (src/signing/hmac.ts):
// base64-decode the secret, HMAC-SHA256 over timestamp+method+path(+body),
// base64-encode the result, then make it URL-safe (+/ -> -_, keep padding).
export function buildPolyHmacSignature(secret, timestamp, method, requestPath, body) {
  let message = String(timestamp) + method + requestPath;
  if (body !== undefined) message += body;

  const keyBytes = Buffer.from(secret.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const hmac = crypto.createHmac("sha256", keyBytes);
  hmac.update(message);
  return hmac.digest("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

export function l2Headers(creds, method, requestPath, body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildPolyHmacSignature(creds.secret, timestamp, method, requestPath, body);
  return {
    POLY_ADDRESS: creds.address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: String(timestamp),
    POLY_API_KEY: creds.key,
    POLY_PASSPHRASE: creds.passphrase,
  };
}
