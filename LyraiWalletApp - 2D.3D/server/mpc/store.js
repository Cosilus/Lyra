// Persistence for MPC key fragments and spending limits.
//
// Two backends behind the same async functions:
//  - PostgreSQL (Neon, ...) when DATABASE_URL is set: survives restarts and
//    redeploys, so this is the one to use on a real host (including hosts
//    with no persistent disk, like Render's free plan).
//  - A single JSON file on disk otherwise (local dev, or a host with a
//    persistent disk and MPC_DB_PATH). Single instance only.
// fragment2 is always AES-256-GCM encrypted (MPC_MASTER_KEY) BEFORE it
// reaches either backend, so the database only ever holds ciphertext.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
// ES imports run before server.js calls dotenv.config(), so without this the
// key and DB settings below were read BEFORE .env was loaded (and a throwaway
// key was used even though .env had a real one).
import "dotenv/config";

const DB_PATH = process.env.MPC_DB_PATH || path.join(process.cwd(), "server", "mpc", "mpc-store.json");
const DATABASE_URL = process.env.DATABASE_URL || "";
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * DAY_MS;

// ---------------- file backend ----------------
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

const fileBackend = {
  async insertWallet(key, { iv, ciphertext, dailyLimitUsd }) {
    const db = loadDb();
    if (db.wallets[key]) return false;
    db.wallets[key] = { fragment2Iv: iv, fragment2Ciphertext: ciphertext, dailyLimitUsd, createdAt: Date.now() };
    saveDb(db);
    return true;
  },
  async getWallet(key) {
    return loadDb().wallets[key] || null;
  },
  async setDailyLimit(key, dailyLimitUsd) {
    const db = loadDb();
    if (!db.wallets[key]) return false;
    db.wallets[key].dailyLimitUsd = dailyLimitUsd;
    saveDb(db);
    return true;
  },
  async spentSince(key, since) {
    return loadDb().spendLog
      .filter(e => e.address === key && e.createdAt >= since)
      .reduce((sum, e) => sum + e.amountUsd, 0);
  },
  async addSpend(key, amountUsd) {
    const db = loadDb();
    db.spendLog.push({ address: key, amountUsd, createdAt: Date.now() });
    const cutoff = Date.now() - RETENTION_MS;
    db.spendLog = db.spendLog.filter(e => e.createdAt >= cutoff);
    saveDb(db);
  },
};

// ---------------- PostgreSQL backend ----------------
let pool = null;
let schemaReady = null;

function getPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 30000 });
    // An idle connection dropped by the host must not crash the process.
    pool.on("error", (err) => console.error("[mpc] postgres pool error:", err.message));
  }
  return pool;
}

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS mpc_wallets (
        address TEXT PRIMARY KEY,
        fragment2_iv TEXT NOT NULL,
        fragment2_ciphertext TEXT NOT NULL,
        daily_limit_usd DOUBLE PRECISION,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mpc_spend_log (
        id BIGSERIAL PRIMARY KEY,
        address TEXT NOT NULL,
        amount_usd DOUBLE PRECISION NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS mpc_spend_log_address_created_idx ON mpc_spend_log (address, created_at);
    `).catch((err) => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

const pgBackend = {
  async insertWallet(key, { iv, ciphertext, dailyLimitUsd }) {
    await ensureSchema();
    const r = await getPool().query(
      `INSERT INTO mpc_wallets (address, fragment2_iv, fragment2_ciphertext, daily_limit_usd, created_at)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (address) DO NOTHING`,
      [key, iv, ciphertext, dailyLimitUsd, Date.now()]
    );
    return r.rowCount === 1;
  },
  async getWallet(key) {
    await ensureSchema();
    const r = await getPool().query(
      "SELECT fragment2_iv, fragment2_ciphertext, daily_limit_usd, created_at FROM mpc_wallets WHERE address = $1",
      [key]
    );
    if (!r.rows[0]) return null;
    const row = r.rows[0];
    return {
      fragment2Iv: row.fragment2_iv,
      fragment2Ciphertext: row.fragment2_ciphertext,
      dailyLimitUsd: row.daily_limit_usd,
      createdAt: Number(row.created_at),
    };
  },
  async setDailyLimit(key, dailyLimitUsd) {
    await ensureSchema();
    const r = await getPool().query("UPDATE mpc_wallets SET daily_limit_usd = $2 WHERE address = $1", [key, dailyLimitUsd]);
    return r.rowCount === 1;
  },
  async spentSince(key, since) {
    await ensureSchema();
    const r = await getPool().query(
      "SELECT COALESCE(SUM(amount_usd), 0) AS total FROM mpc_spend_log WHERE address = $1 AND created_at >= $2",
      [key, since]
    );
    return Number(r.rows[0].total);
  },
  async addSpend(key, amountUsd) {
    await ensureSchema();
    const now = Date.now();
    await getPool().query("INSERT INTO mpc_spend_log (address, amount_usd, created_at) VALUES ($1, $2, $3)", [key, amountUsd, now]);
    await getPool().query("DELETE FROM mpc_spend_log WHERE created_at < $1", [now - RETENTION_MS]);
  },
};

if (!DATABASE_URL && !process.env.MPC_DB_PATH && (process.env.NODE_ENV === "production" || process.env.RENDER)) {
  throw new Error("No durable storage for protected keys. Set DATABASE_URL (PostgreSQL, e.g. Neon), or MPC_DB_PATH on a persistent disk. A plain file on this host is erased at every redeploy.");
}

const backend = DATABASE_URL ? pgBackend : fileBackend;
console.log(`[mpc] storage: ${DATABASE_URL ? "PostgreSQL (DATABASE_URL)" : `JSON file (${DB_PATH})`}`);

// AES-256-GCM at rest for fragment2. MPC_MASTER_KEY must be a 32-byte
// key, hex-encoded (64 hex chars), in the environment. Falling back to
// an ephemeral in-process key (with a loud warning) so local dev never
// hard-fails, but that means every restart invalidates any fragment2
// already stored -- set a real, persistent MPC_MASTER_KEY before this
// holds anything that matters.
let MASTER_KEY = process.env.MPC_MASTER_KEY;
// On a real deployment a throwaway key would silently lock every wallet
// out of its protected key the next time the server restarts, so refuse
// to start instead of "working" until then.
const IS_PRODUCTION = process.env.NODE_ENV === "production" || !!process.env.RENDER;
if (!MASTER_KEY && IS_PRODUCTION) {
  throw new Error("MPC_MASTER_KEY is not set. Refusing to start in production with a throwaway key: set a persistent 32-byte hex MPC_MASTER_KEY (and DATABASE_URL, or a persistent disk with MPC_DB_PATH).");
}
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

export async function registerWallet(address, fragment2Hex, dailyLimitUsd) {
  const { iv, ciphertext } = encryptAtRest(fragment2Hex);
  const inserted = await backend.insertWallet(address.toLowerCase(), { iv, ciphertext, dailyLimitUsd: dailyLimitUsd ?? null });
  if (!inserted) throw new Error("Wallet already registered for MPC.");
}

export async function getWallet(address) {
  return backend.getWallet(address.toLowerCase());
}

export async function setDailyLimit(address, dailyLimitUsd) {
  const ok = await backend.setDailyLimit(address.toLowerCase(), dailyLimitUsd);
  if (!ok) throw new Error("Wallet not registered for MPC.");
}

export async function spentInLast24h(address) {
  return backend.spentSince(address.toLowerCase(), Date.now() - DAY_MS);
}

export async function logSpend(address, amountUsd) {
  await backend.addSpend(address.toLowerCase(), amountUsd);
}

export async function releaseFragment(address) {
  const wallet = await getWallet(address);
  if (!wallet) return null;
  return decryptAtRest(wallet.fragment2Iv, wallet.fragment2Ciphertext);
}

// Proof-of-possession challenge for /api/mpc/recover-fragment (the
// password-reset path). SECURITY FIX: recover-fragment used to release
// fragment2 given nothing but the public address -- anyone who knew a
// user's address (inherently public, visible on any block explorer)
// could fetch fragment2 directly, no proof of holding the recovery
// phrase required at all. This nonce is signed client-side by a wallet
// derived from the recovery phrase (see routes/mpc.js), giving the
// server real cryptographic proof of possession before it releases
// anything. In-memory only (not persisted to disk): short-lived and
// single-use by design, a server restart just means the client
// requests a fresh one, no data worth persisting.
const recoveryChallenges = new Map(); // address (lowercase) -> { nonce, expiresAt }
const RECOVERY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function issueRecoveryChallenge(address) {
  const key = address.toLowerCase();
  const nonce = crypto.randomBytes(32).toString("hex");
  recoveryChallenges.set(key, { nonce, expiresAt: Date.now() + RECOVERY_CHALLENGE_TTL_MS });
  return nonce;
}

// Single-use: removed whether or not it's valid, so a leaked/observed
// nonce can't be replayed even within its TTL.
export function takeRecoveryChallenge(address) {
  const key = address.toLowerCase();
  const entry = recoveryChallenges.get(key);
  recoveryChallenges.delete(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.nonce;
}
