// The other addresses of this wallet. "plasma_wallet_v2" (walletVault.js)
// stays the record of the address in use, so everything that reads it
// (unlock, exports, websites, the approval window) keeps working unchanged;
// this list holds every address's encrypted record, and switching swaps
// which one sits in "plasma_wallet_v2".
//
// Each entry: { address, name, kind: "main" | "derived" | "imported", index?, record }
// where record has the same shape as "plasma_wallet_v2" (encrypted key,
// optional encrypted recovery phrase, mpcEnabled).
import { loadSavedWallet } from "./walletVault.js";

const ACCOUNTS_KEY = "lyra_accounts_v1";
const ACTIVE_KEY = "plasma_wallet_v2";

const same = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

// The list, with the address in use always in it and its record up to date
// (a password reset or MPC change rewrites "plasma_wallet_v2" only).
export function loadAccounts() {
  const list = read();
  const active = loadSavedWallet();
  if (!active?.address || !active?.ciphertext) return list;
  const i = list.findIndex(a => same(a.address, active.address));
  if (i < 0) {
    list.unshift({ address: active.address, name: "Main account", kind: "main", index: 0, record: active });
    write(list);
  } else if (JSON.stringify(list[i].record) !== JSON.stringify(active)) {
    list[i] = { ...list[i], record: active };
    write(list);
  }
  return list;
}

export function findAccount(address) {
  return loadAccounts().find(a => same(a.address, address)) || null;
}

// Makes `address` the one in use. Returns its record.
export function activateAccount(address) {
  const entry = loadAccounts().find(a => same(a.address, address));
  if (!entry) throw new Error("This address isn't in your wallet.");
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(entry.record));
  return entry.record;
}

export function addAccount(entry) {
  const list = loadAccounts();
  if (list.some(a => same(a.address, entry.address))) throw new Error("This address is already in your wallet.");
  list.push(entry);
  write(list);
  return list;
}

export function renameAccount(address, name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 32);
  if (!clean) return loadAccounts();
  const list = loadAccounts().map(a => (same(a.address, address) ? { ...a, name: clean } : a));
  write(list);
  return list;
}

export function removeAccount(address) {
  const active = loadSavedWallet();
  if (same(active?.address, address)) throw new Error("Switch to another address before removing this one.");
  const list = loadAccounts().filter(a => !same(a.address, address) || a.kind === "main");
  write(list);
  return list;
}

export function clearAccounts() {
  try { localStorage.removeItem(ACCOUNTS_KEY); } catch { /* storage off */ }
}

// The next free index on the main recovery phrase (m/44'/60'/0'/0/i)
export function nextDerivedIndex(list) {
  return list.reduce((max, a) => (a.kind === "main" || a.kind === "derived" ? Math.max(max, a.index ?? 0) : max), 0) + 1;
}

export function defaultAccountName(list, kind) {
  if (kind === "imported") return `Imported ${list.filter(a => a.kind === "imported").length + 1}`;
  return `Account ${list.filter(a => a.kind !== "imported").length + 1}`;
}
