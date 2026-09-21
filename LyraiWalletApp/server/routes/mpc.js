// MPC (2-of-2 key-split) endpoints. Fragment1 lives only on the user's
// device; fragment2 lives only here, encrypted at rest, and is released
// after a spending-limit check plus a client-asserted biometric
// confirmation. Reconstruction (XOR of the two fragments) happens on
// the client -- this server never sees the full private key.
//
// KNOWN PROTOTYPE GAP: `biometricConfirmed` is a plain boolean the
// client sends after its own local WebAuthn presence check
// (Biometric.js). It is NOT a cryptographically verified WebAuthn
// assertion -- this server never registered a credential public key,
// so there's nothing yet to check a signature against. Treat it as a
// UX gate, not a security boundary, until real challenge/response
// WebAuthn verification (e.g. via @simplewebauthn/server) is wired in.
import {
  registerWallet,
  getWallet,
  setDailyLimit,
  spentInLast24h,
  logSpend,
  releaseFragment
} from "../mpc/store.js";

const FRAGMENT_HEX_RE = /^0x[0-9a-fA-F]{64}$/;

export function registerMpcRoutes(app) {
  app.post("/api/mpc/register", (req, res) => {
    const { address, fragment2, dailyLimitUsd } = req.body || {};
    if (!address || !fragment2) {
      return res.status(400).json({ error: "address and fragment2 are required." });
    }
    if (!FRAGMENT_HEX_RE.test(fragment2)) {
      return res.status(400).json({ error: "fragment2 must be a 32-byte hex string." });
    }
    if (dailyLimitUsd != null && (typeof dailyLimitUsd !== "number" || dailyLimitUsd < 0)) {
      return res.status(400).json({ error: "dailyLimitUsd must be a non-negative number." });
    }
    try {
      registerWallet(address, fragment2, dailyLimitUsd ?? null);
      res.json({ ok: true });
    } catch (err) {
      res.status(409).json({ error: err.message });
    }
  });

  app.get("/api/mpc/status/:address", (req, res) => {
    const wallet = getWallet(req.params.address);
    if (!wallet) return res.json({ enabled: false });
    res.json({
      enabled: true,
      dailyLimitUsd: wallet.dailyLimitUsd,
      spentTodayUsd: spentInLast24h(req.params.address)
    });
  });

  app.post("/api/mpc/limit", (req, res) => {
    const { address, dailyLimitUsd } = req.body || {};
    if (!address || typeof dailyLimitUsd !== "number" || dailyLimitUsd < 0) {
      return res.status(400).json({ error: "address and a non-negative dailyLimitUsd are required." });
    }
    try {
      setDailyLimit(address, dailyLimitUsd);
      res.json({ ok: true });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  app.post("/api/mpc/release-fragment", (req, res) => {
    const { address, amountUsd, biometricConfirmed } = req.body || {};
    if (!address) return res.status(400).json({ error: "address is required." });

    const wallet = getWallet(address);
    if (!wallet) return res.status(404).json({ error: "Wallet not registered for MPC." });

    if (!biometricConfirmed) {
      return res.status(403).json({ error: "Biometric confirmation required." });
    }

    const amount = typeof amountUsd === "number" && amountUsd >= 0 ? amountUsd : 0;
    if (wallet.dailyLimitUsd != null) {
      const spent = spentInLast24h(address);
      if (spent + amount > wallet.dailyLimitUsd) {
        return res.status(403).json({
          error: "Daily spending limit exceeded.",
          dailyLimitUsd: wallet.dailyLimitUsd,
          spentTodayUsd: spent
        });
      }
    }

    const fragment2 = releaseFragment(address);
    if (amount > 0) logSpend(address, amount);
    res.json({ fragment2 });
  });

  // Password-reset path: the client already verified the recovery
  // phrase reproduces this exact address before calling this, so
  // ownership is already established without a biometric/limit check.
  app.post("/api/mpc/recover-fragment", (req, res) => {
    const { address } = req.body || {};
    if (!address) return res.status(400).json({ error: "address is required." });

    const wallet = getWallet(address);
    if (!wallet) return res.status(404).json({ error: "Wallet not registered for MPC." });

    const fragment2 = releaseFragment(address);
    res.json({ fragment2 });
  });
}
