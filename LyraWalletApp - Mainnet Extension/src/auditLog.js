// Local audit trail: every real wallet action (send, swap, bridge,
// stake/unstake, consolidate, multisig, predictions, x402 payments)
// gets one entry here, purely client-side (localStorage), so the
// wallet has its own record of "what happened and when" independent
// of any single chain's explorer, useful across networks and for
// off-chain actions (Polymarket orders, x402 payments) an explorer
// can't show at all. Not a substitute for the real on-chain history
// tabs, a traceability log alongside them.
const STORAGE_KEY = "plasma_audit_log_v1";
const MAX_ENTRIES = 500;

function loadRaw() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// entry: { category, action, status, networkKey, asset, amount,
//          amountUSD, counterparty, txHash, reason, meta }
// category/action/status/timestamp/id are always present; everything
// else is whatever the caller has for that specific kind of action.
export function logAuditEvent(entry) {
  try {
    const list = loadRaw();
    list.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      status: "success",
      ...entry,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch (e) {
    // Logging must never break the action it's logging.
    console.error("Audit log write failed:", e);
  }
}

export function loadAuditLog() {
  return loadRaw();
}

export function loadAuditLogByCategory(category) {
  return loadRaw().filter(e => e.category === category);
}

export function clearAuditLog() {
  localStorage.removeItem(STORAGE_KEY);
}
