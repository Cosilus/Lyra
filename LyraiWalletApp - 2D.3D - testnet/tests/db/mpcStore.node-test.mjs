// Integration test of the PostgreSQL backend of the MPC store, run with
// `npm run test:db` (needs DATABASE_URL, e.g. a Neon branch). It only touches
// rows with random addresses and deletes them at the end. Kept outside vitest
// (whose workers don't inherit the environment).
import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";

const URL_DB = process.env.MPC_TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!URL_DB) {
  console.log("DATABASE_URL not set: skipping the PostgreSQL store test.");
  process.exit(0);
}
process.env.DATABASE_URL = URL_DB;
process.env.MPC_MASTER_KEY = crypto.randomBytes(32).toString("hex");

const addr = "0x" + crypto.randomBytes(20).toString("hex");
const fragment = "0x" + crypto.randomBytes(32).toString("hex");
const store = await import("../../server/mpc/store.js");

after(async () => {
  const pool = new pg.Pool({ connectionString: URL_DB });
  await pool.query("DELETE FROM mpc_spend_log WHERE address = $1", [addr]);
  await pool.query("DELETE FROM mpc_wallets WHERE address = $1", [addr]);
  await pool.end();
  process.exit(0); // the store keeps its own pool open
});

test("registers a wallet, stores it encrypted, and releases the same fragment", async () => {
  await store.registerWallet(addr, fragment, 100);
  const w = await store.getWallet(addr.toUpperCase().replace("0X", "0x"));
  assert.equal(w.dailyLimitUsd, 100);
  assert.ok(!w.fragment2Ciphertext.includes(fragment.slice(2)), "fragment must be stored encrypted");
  assert.equal(await store.releaseFragment(addr), fragment);
});

test("refuses to register the same wallet twice", async () => {
  await assert.rejects(store.registerWallet(addr, fragment, 100), /already registered/);
});

test("tracks spending and updates the daily limit", async () => {
  assert.equal(await store.spentInLast24h(addr), 0);
  await store.logSpend(addr, 30);
  await store.logSpend(addr, 12.5);
  assert.ok(Math.abs((await store.spentInLast24h(addr)) - 42.5) < 1e-9);
  await store.setDailyLimit(addr, 500);
  assert.equal((await store.getWallet(addr)).dailyLimitUsd, 500);
});

test("unknown wallet: null and errors", async () => {
  const other = "0x" + crypto.randomBytes(20).toString("hex");
  assert.equal(await store.getWallet(other), null);
  assert.equal(await store.releaseFragment(other), null);
  await assert.rejects(store.setDailyLimit(other, 1), /not registered/);
});

test("data survives a fresh connection (it is really in the database)", async () => {
  const pool = new pg.Pool({ connectionString: URL_DB });
  const r = await pool.query("SELECT count(*)::int AS n FROM mpc_wallets WHERE address = $1", [addr]);
  await pool.end();
  assert.equal(r.rows[0].n, 1);
});
