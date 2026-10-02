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
import { ethers } from "ethers";
import {
  registerWallet,
  getWallet,
  setDailyLimit,
  spentInLast24h,
  logSpend,
  releaseFragment,
  issueRecoveryChallenge,
  takeRecoveryChallenge
} from "../mpc/store.js";

// Same message both when the challenge is issued and when the
// signature is verified -- derived only from address+nonce, so nothing
// extra needs to be stored alongside the nonce itself.
function recoveryChallengeMessage(address, nonce) {
  return `Lyra wallet recovery for ${address}\nNonce: ${nonce}\nThis proves you hold the recovery phrase for this wallet. Never share this signature with anyone.`;
}

const FRAGMENT_HEX_RE = /^0x[0-9a-fA-F]{64}$/;

export function registerMpcRoutes(app) {
  app.post("/api/mpc/register", async (req, res) => {
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
      await registerWallet(address, fragment2, dailyLimitUsd ?? null);
      res.json({ ok: true });
    } catch (err) {
      if (err.message === "Wallet already registered for MPC.") return res.status(409).json({ error: err.message });
      console.error("[mpc] register failed:", err.message);
      res.status(500).json({ error: "Could not save the protected key. Try again." });
    }
  });

  app.get("/api/mpc/status/:address", async (req, res) => {
    try {
      const wallet = await getWallet(req.params.address);
      if (!wallet) return res.json({ enabled: false });
      res.json({
        enabled: true,
        dailyLimitUsd: wallet.dailyLimitUsd,
        spentTodayUsd: await spentInLast24h(req.params.address)
      });
    } catch (err) {
      console.error("[mpc] status failed:", err.message);
      res.status(500).json({ error: "Could not read the protection status." });
    }
  });

  app.post("/api/mpc/limit", async (req, res) => {
    const { address, dailyLimitUsd } = req.body || {};
    if (!address || typeof dailyLimitUsd !== "number" || dailyLimitUsd < 0) {
      return res.status(400).json({ error: "address and a non-negative dailyLimitUsd are required." });
    }
    try {
      await setDailyLimit(address, dailyLimitUsd);
      res.json({ ok: true });
    } catch (err) {
      if (err.message === "Wallet not registered for MPC.") return res.status(404).json({ error: err.message });
      console.error("[mpc] set limit failed:", err.message);
      res.status(500).json({ error: "Could not save the limit. Try again." });
    }
  });

  app.post("/api/mpc/release-fragment", async (req, res) => {
    const { address, amountUsd, biometricConfirmed } = req.body || {};
    if (!address) return res.status(400).json({ error: "address is required." });

    try {
      const wallet = await getWallet(address);
      if (!wallet) return res.status(404).json({ error: "Wallet not registered for MPC." });

      if (!biometricConfirmed) {
        return res.status(403).json({ error: "Biometric confirmation required." });
      }

      const amount = typeof amountUsd === "number" && amountUsd >= 0 ? amountUsd : 0;
      if (wallet.dailyLimitUsd != null) {
        const spent = await spentInLast24h(address);
        if (spent + amount > wallet.dailyLimitUsd) {
          return res.status(403).json({
            error: "Daily spending limit exceeded.",
            dailyLimitUsd: wallet.dailyLimitUsd,
            spentTodayUsd: spent
          });
        }
      }

      const fragment2 = await releaseFragment(address);
      if (amount > 0) await logSpend(address, amount);
      res.json({ fragment2 });
    } catch (err) {
      console.error("[mpc] release failed:", err.message);
      res.status(500).json({ error: "Could not release the protected key. Try again." });
    }
  });

  // Password-reset path, step 1: issue a one-time nonce for this
  // address. The client signs it with a wallet derived from the
  // recovery phrase (proving possession) before recover-fragment below
  // will release anything.
  app.post("/api/mpc/recover-challenge", async (req, res) => {
    const { address } = req.body || {};
    if (!address) return res.status(400).json({ error: "address is required." });

    try {
      const wallet = await getWallet(address);
      if (!wallet) return res.status(404).json({ error: "Wallet not registered for MPC." });

      const nonce = issueRecoveryChallenge(address);
      res.json({ nonce, message: recoveryChallengeMessage(address, nonce) });
    } catch (err) {
      console.error("[mpc] recover-challenge failed:", err.message);
      res.status(500).json({ error: "Could not start the recovery. Try again." });
    }
  });

  // Password-reset path, step 2: the client already verified locally
  // that the recovery phrase reproduces this exact address, but that
  // local check alone used to be trusted as sufficient proof here --
  // anyone who knew the (public) address could call this directly and
  // get fragment2, recovery phrase or not. Now it requires a signature,
  // from a wallet derived from that same recovery phrase, over the
  // one-time nonce issued above: real cryptographic proof of
  // possession, verified server-side, not a client-side claim.
  app.post("/api/mpc/recover-fragment", async (req, res) => {
    const { address, signature } = req.body || {};
    if (!address || !signature) return res.status(400).json({ error: "address and signature are required." });

    let wallet;
    try {
      wallet = await getWallet(address);
    } catch (err) {
      console.error("[mpc] recover-fragment failed:", err.message);
      return res.status(500).json({ error: "Could not recover the protected key. Try again." });
    }
    if (!wallet) return res.status(404).json({ error: "Wallet not registered for MPC." });

    const nonce = takeRecoveryChallenge(address);
    if (!nonce) {
      return res.status(403).json({ error: "No pending recovery challenge for this address (it may have expired or already been used) -- request a new one." });
    }

    let recovered;
    try {
      recovered = ethers.verifyMessage(recoveryChallengeMessage(address, nonce), signature);
    } catch {
      return res.status(403).json({ error: "Invalid recovery signature." });
    }
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(403).json({ error: "Recovery signature doesn't match this wallet." });
    }

    try {
      const fragment2 = await releaseFragment(address);
      res.json({ fragment2 });
    } catch (err) {
      console.error("[mpc] recover-fragment failed:", err.message);
      res.status(500).json({ error: "Could not recover the protected key. Try again." });
    }
  });
}
