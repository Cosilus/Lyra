// WebAuthn-based biometric helpers for wallet unlock.
//
// Two tiers, auto-selected based on what the browser/authenticator supports
//. The user never has to pick, registerBiometric() figures it out:
//
// - "prf" tier: the authenticator supports the WebAuthn PRF extension
//   (Touch ID / Windows Hello / recent Chrome+platform authenticators),
//   which lets us derive a stable, secret, device+biometric-bound AES key.
//   That key encrypts a *second* copy of the private key (alongside the
//   password-encrypted one already used by the app). Unlocking via
//   biometric decrypts using this key directly. No password needed again
//   on that device, even after the extension is fully closed and reopened.
//
// - "gate" tier: PRF isn't available on this device/browser. Biometric
//   can't derive a real secret, so it can only re-confirm presence to
//   restore access to a private key that's already been decrypted once
//   with the password *in the current browser session* (kept in memory,
//   never written to disk). If the extension popup fully closes (memory
//   is wiped) or the browser restarts, that cached copy is gone and the
//   password is required again. Biometric alone can never re-derive it
//   in this tier. This is a real limitation of the Web Authentication
//   API without PRF, not something that can be worked around safely.

const CHALLENGE_BYTES = 32;

function toBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function deriveAesKeyFromPrf(prfOutput) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    prfOutput,
    "HKDF",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("lyra-biometric-key")
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function isWebAuthnAvailable() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

// Registers a platform authenticator (Touch ID / Windows Hello / Android
// biometrics) for this wallet address. Returns a record describing which
// tier was actually granted. The caller doesn't need to guess.
export async function registerBiometric(address) {
  const challenge = randomBytes(CHALLENGE_BYTES);
  const userId = randomBytes(16);
  const prfSalt = randomBytes(32);

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Lyra Wallet" },
      user: { id: userId, name: address, displayName: address },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required"
      },
      extensions: { prf: { eval: { first: prfSalt } } }
    }
  });

  const extResults = credential.getClientExtensionResults();
  // some authenticators only answer PRF at the first sign-in, not at creation:
  // the caller then tries once (enrollBiometric in App.jsx)
  const supportsPrf = extResults?.prf?.enabled === true || !!extResults?.prf?.results?.first;
  const prfOnCreate = extResults?.prf?.results?.first || null;

  return {
    credentialId: toBase64(credential.rawId),
    prfSalt: toBase64(prfSalt),
    supportsPrf,
    // the key straight away when the authenticator gave it at creation (no second prompt)
    aesKey: prfOnCreate ? await deriveAesKeyFromPrf(prfOnCreate) : null
  };
}

// Re-derives the PRF-based AES key at unlock time. Returns null if the
// authenticator doesn't honor the PRF extension this time. The caller
// should treat that as "fall back to gate tier / password".
export async function getBiometricAesKey(credentialId, prfSaltB64) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(CHALLENGE_BYTES),
      allowCredentials: [{ id: fromBase64(credentialId), type: "public-key" }],
      userVerification: "required",
      extensions: { prf: { eval: { first: fromBase64(prfSaltB64) } } }
    }
  });

  const results = assertion.getClientExtensionResults();
  const prfOutput = results?.prf?.results?.first;
  if (!prfOutput) return null;

  return deriveAesKeyFromPrf(prfOutput);
}

// "Gate" tier: just confirms presence via the platform authenticator, no
// secret material comes back. Only useful to re-confirm access to a key
// already cached in memory this session.
export async function confirmBiometricPresence(credentialId) {
  await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(CHALLENGE_BYTES),
      allowCredentials: [{ id: fromBase64(credentialId), type: "public-key" }],
      userVerification: "required"
    }
  });
  return true;
}

export async function encryptWithKey(key, plaintext) {
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return { iv: toBase64(iv), ciphertext: toBase64(encrypted) };
}

export async function decryptWithKey(key, ivB64, ciphertextB64) {
  const iv = new Uint8Array(fromBase64(ivB64));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    fromBase64(ciphertextB64)
  );
  return new TextDecoder().decode(decrypted);
}
// "device" tier, for the web app on a phone whose passkey provider has no
// PRF (some Android makers' own password managers): an AES key generated
// here, NON-EXTRACTABLE (the browser keeps it, no code can read its bytes),
// stored in this origin's IndexedDB. It encrypts the second copy of the key,
// and the app only uses it after the fingerprint was confirmed. Weaker than
// PRF (the fingerprint gates its use, it doesn't derive the secret), but bound
// to this device and this browser, and erased with the app's data.
const DB = "lyra-device-keys";
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", mode);
    const req = fn(tx.objectStore("keys"));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function createDeviceKey() {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await idbDo("readwrite", (store) => store.put(key, "biometric"));
  return key;
}
export async function loadDeviceKey() {
  try { return (await idbDo("readonly", (store) => store.get("biometric"))) || null; } catch { return null; }
}
export async function clearDeviceKey() {
  try { await idbDo("readwrite", (store) => store.delete("biometric")); } catch { /* nothing kept */ }
}
