// Encrypted wallet storage, shared by the wallet (App.jsx) and the dApp
// approval window (request/RequestApp.jsx). Moved out of App.jsx unchanged.
import { combineFragments, releaseFragment2 } from "./mpc";

export function loadSavedWallet() {
  try {
    return JSON.parse(
      localStorage.getItem("plasma_wallet_v2") || "null"
    );
  } catch {
    return null;
  }
}

async function deriveKey(password, salt) {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 310000,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function uint8ToBase64(bytes) {
  let binary = "";
  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });

  return btoa(binary);
}

function base64ToUint8(base64) {
  const binary = atob(base64);

  return Uint8Array.from(
    binary,
    char => char.charCodeAt(0)
  );
}

export async function encryptPrivateKey(privateKey, password) {
  const encoder = new TextEncoder();

  const salt = crypto.getRandomValues(
    new Uint8Array(16)
  );

  const iv = crypto.getRandomValues(
    new Uint8Array(12)
  );

  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    encoder.encode(privateKey)
  );

  return {
    salt: uint8ToBase64(salt),
    iv: uint8ToBase64(iv),
    ciphertext: uint8ToBase64(
      new Uint8Array(encrypted)
    )
  };
}

export async function decryptPrivateKey(encryptedWallet, password) {
  const decoder = new TextDecoder();

  const salt = base64ToUint8(
    encryptedWallet.salt
  );

  const iv = base64ToUint8(
    encryptedWallet.iv
  );

  const ciphertext = base64ToUint8(
    encryptedWallet.ciphertext
  );

  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    ciphertext
  );

  return decoder.decode(decrypted);
}

// Turns whatever decryptPrivateKey() just handed back into the actual
// signing key. For a non-MPC wallet, `localSecret` already *is* the
// full private key (unchanged behavior). For an MPC wallet,
// `localSecret` is only fragment1 -- fragment2 has to come from the
// backend (spending-limit + biometric gated there) before the two can
// be XORed back into a usable key, entirely in memory, here.
export async function reconstructPrivateKey(localSecret, address, mpcRecord, opts = {}) {
  if (!mpcRecord) return localSecret;
  const fragment2 = await releaseFragment2(address, opts);
  return combineFragments(localSecret, fragment2);
}
