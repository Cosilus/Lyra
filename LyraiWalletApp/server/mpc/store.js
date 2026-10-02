// Prototype-grade local persistence for MPC key fragments and spending
// limits: a single encrypted-at-rest JSON file on disk. Fine for local
// dev / a single-instance prototype, not for a multi-instance production
// host -- swap for Postgres/Mongo before any real deployment, the
// function signatures below are the seam to do that behind.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DB_PATH = process.env.MPC_DB_PATH || path.join(process.cwd(), "server", "mpc", "mpc-store.json");

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return { wallets: {}, spendLog: [] };
  }
}

function saveDb(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// AES-256-GCM at rest for fragment2. MPC_MASTER_KEY must be a 32-byte
// key, hex-encoded (64 hex chars), in the environment. Falling back to
// an ephemeral in-process key (with a loud warning) so local dev never
// hard-fails, but that means every restart invalidates any fragment2
// already stored -- set a real, persistent MPC_MASTER_KEY before this
// holds anything that matters.
let MASTER_KEY = process.env.MPC_MASTER_KEY;
if (!MASTER_KEY) {
  MASTER_KEY = crypto.randomBytes(32).toString("hex");
  console.warn("[mpc] MPC_MASTER_KEY not set in the environment -- using a throwaway key for this process only. Set a real MPC_MASTER_KEY (32-byte hex) before registering any wallet you care about.");
}
const MASTER_KEY_BYTES = Buffer.from(MASTER_KEY, "hex");
if (MASTER_KEY_BYTES.length !== 32) {
  throw new Error("MPC_MASTER_KEY must be 32 bytes, hex-encoded (64 hex characters).");
}

function encryptAtRest(plaintextHex) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", MASTER_KEY_BYTES, iv);
  const enc = Buffer.concat([cipher.update(plaintextHex, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString("hex"), ciphertext: Buffer.concat([enc, tag]).toString("hex") };
}

function decryptAtRest(ivHex, ciphertextHex) {
  const iv = Buffer.from(ivHex, "hex");
  const data = Buffer.from(ciphertextHex, "hex");
  const tag = data.subarray(data.length - 16);
  const enc = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", MASTER_KEY_BYTES, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function registerWallet(address, fragment2Hex, dailyLimitUsd) {
  const db = loadDb();
  const key = address.toLowerCase();
  if (db.wallets[key]) throw new Error("Wallet already registered for MPC.");
  const { iv, ciphertext } = encryptAtRest(fragment2Hex);
  db.wallets[key] = {
    fragment2Iv: iv,
    fragment2Ciphertext: ciphertext,
    dailyLimitUsd: dailyLimitUsd ?? null,
    createdAt: Date.now()
  };
  saveDb(db);
}

export function getWallet(address) {
  const db = loadDb();
  return db.wallets[address.toLowerCase()] || null;
}

export function setDailyLimit(address, dailyLimitUsd) {
  const db = loadDb();
  const key = address.toLowerCase();
  if (!db.wallets[key]) throw new Error("Wallet not registered for MPC.");
  db.wallets[key].dailyLimitUsd = dailyLimitUsd;
  saveDb(db);
}

export function spentInLast24h(address) {
  const db = loadDb();
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const key = address.toLowerCase();
  return db.spendLog
    .filter(e => e.address === key && e.createdAt >= since)
    .reduce((sum, e) => sum + e.amountUsd, 0);
}

export function logSpend(address, amountUsd) {
  const db = loadDb();
  db.spendLog.push({ address: address.toLowerCase(), amountUsd, createdAt: Date.now() });
  // Prototype-only retention: drop anything older than 30 days so this
  // file doesn't grow forever. A real store would just query a window.
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  db.spendLog = db.spendLog.filter(e => e.createdAt >= cutoff);
  saveDb(db);
}

export function releaseFragment(address) {
  const wallet = getWallet(address);
  if (!wallet) return null;
  return decryptAtRest(wallet.fragment2Iv, wallet.fragment2Ciphertext);
}
