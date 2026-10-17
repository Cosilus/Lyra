// Coinbase Onramp: buying USDC on Base with a card, Apple Pay or a bank, on
// Coinbase's own hosted page (pay.coinbase.com). This server only asks
// Coinbase for a single-use session token tied to the user's address and
// builds the link; card and bank details never pass through Lyra.
//
// Environment (Coinbase Developer Platform, portal.cdp.coinbase.com):
//   CDP_API_KEY_ID      the secret API key's id ("organizations/…/apiKeys/…" or a UUID)
//   CDP_API_KEY_SECRET  its private key: an Ed25519 key (base64, the default
//                       for new keys) or an EC key (PEM, "-----BEGIN EC
//                       PRIVATE KEY-----", with literal "\n" for newlines)
import crypto from "node:crypto";

const HOST = "api.developer.coinbase.com";
const TOKEN_PATH = "/onramp/v1/token";

export function isCoinbaseOnrampConfigured() {
  return !!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function privateKey() {
  const raw = String(process.env.CDP_API_KEY_SECRET || "").replace(/\\n/g, "\n").trim();
  if (raw.includes("BEGIN")) return { key: crypto.createPrivateKey(raw), alg: "ES256" };
  // Ed25519: 64 bytes, the 32-byte seed then the 32-byte public key
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 64) throw new Error("CDP_API_KEY_SECRET isn't a valid Ed25519 key (64 bytes, base64).");
  const key = crypto.createPrivateKey({ key: { kty: "OKP", crv: "Ed25519", d: b64url(bytes.subarray(0, 32)), x: b64url(bytes.subarray(32)) }, format: "jwk" });
  return { key, alg: "EdDSA" };
}

// the short-lived JWT Coinbase asks for on each request (2 minutes, one URI)
function bearer(method, path) {
  const { key, alg } = privateKey();
  const keyId = process.env.CDP_API_KEY_ID;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg, kid: keyId, typ: "JWT", nonce: crypto.randomBytes(16).toString("hex") };
  const claims = { sub: keyId, iss: "cdp", nbf: now, exp: now + 120, uri: `${method} ${HOST}${path}` };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = alg === "EdDSA"
    ? crypto.sign(null, Buffer.from(input), key)
    : crypto.sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(signature)}`;
}

// A single-use token (valid 5 minutes) for this address, USDC on Base only.
export async function createOnrampSessionToken({ address }) {
  const res = await fetch(`https://${HOST}${TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer("POST", TOKEN_PATH)}` },
    body: JSON.stringify({ addresses: [{ address, blockchains: ["base"] }], assets: ["USDC"] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(data?.message || data?.errorMessage || `Coinbase answered ${res.status}`);
  return data.token;
}

export function buildCoinbaseBuyUrl({ token, amountUSD }) {
  const url = new URL("https://pay.coinbase.com/buy/select-asset");
  url.searchParams.set("sessionToken", token);
  url.searchParams.set("defaultNetwork", "base");
  url.searchParams.set("defaultAsset", "USDC");
  url.searchParams.set("defaultExperience", "buy");
  url.searchParams.set("fiatCurrency", "USD");
  const amount = Number(amountUSD);
  if (amount > 0) url.searchParams.set("presetFiatAmount", String(Math.round(amount * 100) / 100));
  return url.toString();
}
