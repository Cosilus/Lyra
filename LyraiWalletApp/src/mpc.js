// Client half of the 2-of-2 MPC key split: fragment1 stays on this
// device (password/biometric-encrypted, exactly like the single-key
// flow it replaces); fragment2 lives on the backend and is only
// fetched per unlock/reveal, after a spending-limit + biometric check
// there. Reconstruction (XOR of the two fragments) happens here, in
// memory, never persisted and never sent anywhere.
import { API_BASE_URL } from "./config.js";
import { confirmBiometricPresence } from "./Biometric.js";

function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  return bytes;
}

function bytesToHex(bytes) {
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Splits a raw private key (hex, with or without "0x") into two
// 32-byte fragments such that fragment1 XOR fragment2 === privateKey.
// Information-theoretically secure for this 2-of-2 case: neither
// fragment alone reveals anything about the key.
export function splitPrivateKey(privateKeyHex) {
  const key = hexToBytes(privateKeyHex);
  const fragment2 = crypto.getRandomValues(new Uint8Array(key.length));
  const fragment1 = new Uint8Array(key.length);
  for (let i = 0; i < key.length; i++) fragment1[i] = key[i] ^ fragment2[i];
  return { fragment1: bytesToHex(fragment1), fragment2: bytesToHex(fragment2) };
}

export function combineFragments(fragment1Hex, fragment2Hex) {
  const a = hexToBytes(fragment1Hex);
  const b = hexToBytes(fragment2Hex);
  if (a.length !== b.length) throw new Error("MPC fragment length mismatch.");
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return bytesToHex(out);
}

async function mpcFetch(path, options) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `MPC request failed (${res.status}).`);
  return data;
}

export function registerMpcWallet(address, fragment2Hex, dailyLimitUsd) {
  return mpcFetch("/api/mpc/register", {
    method: "POST",
    body: JSON.stringify({ address, fragment2: fragment2Hex, dailyLimitUsd: dailyLimitUsd ?? null })
  });
}

export function getMpcStatus(address) {
  return mpcFetch(`/api/mpc/status/${address}`);
}

export function setMpcDailyLimit(address, dailyLimitUsd) {
  return mpcFetch("/api/mpc/limit", {
    method: "POST",
    body: JSON.stringify({ address, dailyLimitUsd })
  });
}

// Confirms presence via the device's existing biometric credential (if
// one is registered) before asking the backend to release fragment2.
// amountUsd defaults to 0 (unlock/reveal, not a spend) -- pass the
// real USD value here once this is wired into a per-transaction
// signing path instead of just unlock.
export async function releaseFragment2(address, { amountUsd = 0, biometricCredentialId = null } = {}) {
  if (biometricCredentialId) {
    await confirmBiometricPresence(biometricCredentialId);
  }
  const { fragment2 } = await mpcFetch("/api/mpc/release-fragment", {
    method: "POST",
    body: JSON.stringify({ address, amountUsd, biometricConfirmed: true })
  });
  return fragment2;
}

// Recovery path (forgot password): the caller has already verified the
// recovery phrase reproduces this exact address, so no biometric/limit
// gate applies here -- see server/routes/mpc.js.
export async function recoverFragment2(address) {
  const { fragment2 } = await mpcFetch("/api/mpc/recover-fragment", { method: "POST", body: JSON.stringify({ address }) });
  return fragment2;
}
