// Lyra's approval window: a website asked to connect, to sign something or to
// send a transaction (public/providerBackground.js opened this window). The
// request is shown translated into plain language (signTranslator.js); the
// wallet is unlocked with the password only to sign, then locked again when
// the window closes. Closing the window counts as "reject".
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { ShieldCheck, ShieldAlert, AlertTriangle, Lock, Eye, EyeOff, Loader2, Globe, Check, X } from "lucide-react";
import { NETWORKS, DEFAULT_NETWORK, ERC20_ABI } from "../config";
import { loadSavedWallet, decryptPrivateKey, reconstructPrivateKey } from "../walletVault.js";
import { translateRequest, shortAddress, forbiddenSignature } from "../signTranslator.js";
import Logo3D from "../three-d/Logo3D.jsx";

const requestId = new URLSearchParams(window.location.search).get("id");

const RISK = {
  low: { label: "Safe", Icon: ShieldCheck },
  medium: { label: "Check the details", Icon: ShieldAlert },
  high: { label: "Be careful", Icon: AlertTriangle },
  blocked: { label: "Blocked by Lyra", Icon: AlertTriangle },
};

function send(message) {
  return chrome.runtime.sendMessage(message).catch(() => ({ ok: false, reason: "Lyra couldn't reach the site." }));
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// The address a request says it signs for, if it names one.
function requestedAddress(method, params) {
  if (method === "personal_sign") return params?.[1];
  if (method === "eth_signTypedData_v4" || method === "eth_signTypedData_v3") return params?.[0];
  if (method === "eth_sendTransaction") return params?.[0]?.from;
  return null;
}

export default function RequestApp() {
  const [req, setReq] = useState(undefined); // undefined: loading, null: gone
  const [translation, setTranslation] = useState(null);
  const [fee, setFee] = useState(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const saved = useMemo(loadSavedWallet, []);
  const network = useMemo(
    () => NETWORKS.find((n) => n.chainIdHex === req?.chainId) || DEFAULT_NETWORK,
    [req?.chainId]
  );
  const provider = useMemo(
    () => new ethers.JsonRpcProvider(network.rpcUrl, network.chainId, { staticNetwork: true }),
    [network]
  );
  const isConnect = req && (req.method === "eth_requestAccounts" || req.method === "wallet_requestPermissions");
  const host = useMemo(() => {
    try { return new URL(req?.origin).host; } catch { return req?.origin || ""; }
  }, [req?.origin]);

  // Load the request.
  useEffect(() => {
    if (!requestId) { setReq(null); return; }
    chrome.storage.session.get("lyraRequest:" + requestId).then((s) => setReq(s["lyraRequest:" + requestId] || null), () => setReq(null));
  }, []);

  // Keep the background awake while the user decides.
  useEffect(() => {
    const t = setInterval(() => send({ type: "lyra-keepalive" }), 20000);
    return () => clearInterval(t);
  }, []);

  // Translate it.
  useEffect(() => {
    if (!req || isConnect || !saved) return;
    let cancelled = false;
    const tokenInfo = async (address) => {
      const c = new ethers.Contract(address, ERC20_ABI, provider);
      const [symbol, decimals] = await withTimeout(Promise.all([c.symbol(), c.decimals()]), 4000);
      return { symbol, decimals: Number(decimals) };
    };
    translateRequest(req.method, req.params, { address: saved.address, chainId: network.chainId, nativeSymbol: network.nativeSymbol, tokenInfo }, req.origin)
      .then((t) => !cancelled && setTranslation(t));

    if (req.method === "eth_sendTransaction") {
      const tx = req.params?.[0] || {};
      (async () => {
        try {
          const [gas, feeData] = await withTimeout(Promise.all([
            tx.gas || tx.gasLimit ? BigInt(tx.gas || tx.gasLimit) : provider.estimateGas({ from: saved.address, to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n }),
            provider.getFeeData(),
          ]), 6000);
          const price = feeData.maxFeePerGas || feeData.gasPrice;
          if (!cancelled && price) setFee(`≈ ${Number(ethers.formatEther(gas * price)).toPrecision(3)} ${network.nativeSymbol}`);
        } catch (e) {
          if (!cancelled) setFee(/revert|execution/i.test(e?.message || "") ? "This transaction would probably fail." : null);
        }
      })();
    }
    return () => { cancelled = true; };
  }, [req, isConnect, saved, provider, network]);

  async function answer(message) {
    const res = await send({ type: "lyra-request-result", id: requestId, ...message });
    if (res && res.ok === false) {
      setError(res.reason || "The site stopped waiting for this request.");
      setBusy(false);
      return;
    }
    window.close();
  }

  function reject() {
    answer({ error: { code: 4001, message: "The user rejected the request." } });
  }

  async function approve() {
    setError("");
    if (isConnect) {
      setBusy(true);
      return answer({ result: true });
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    try {
      // checked again here, whatever the screen showed
      const forbidden = forbiddenSignature(req.method, req.params);
      if (forbidden) throw new Error(forbidden);
      const named = requestedAddress(req.method, req.params);
      if (named && ethers.isAddress(named) && ethers.getAddress(named) !== ethers.getAddress(saved.address)) {
        throw new Error("This request is for a different wallet address.");
      }
      let localSecret;
      try {
        localSecret = await decryptPrivateKey(saved, password);
      } catch {
        throw new Error("Wrong password.");
      }
      const privateKey = await reconstructPrivateKey(localSecret, saved.address, saved.mpcEnabled);
      const wallet = new ethers.Wallet(privateKey, provider);
      if (wallet.address.toLowerCase() !== saved.address.toLowerCase()) throw new Error("This wallet couldn't be unlocked.");

      let result;
      if (req.method === "personal_sign") {
        const msg = req.params[0];
        result = await wallet.signMessage(ethers.isHexString(msg) ? ethers.getBytes(msg) : msg);
      } else if (req.method === "eth_signTypedData_v4" || req.method === "eth_signTypedData_v3") {
        const raw = ethers.isAddress(req.params[0]) ? req.params[1] : req.params[0];
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        const types = { ...data.types };
        delete types.EIP712Domain;
        result = await wallet.signTypedData(data.domain, types, data.message);
      } else if (req.method === "eth_sendTransaction") {
        const tx = req.params[0] || {};
        const sent = await wallet.sendTransaction({
          to: tx.to || null,
          data: tx.data || tx.input || "0x",
          value: tx.value ? BigInt(tx.value) : 0n,
          ...(tx.gas || tx.gasLimit ? { gasLimit: BigInt(tx.gas || tx.gasLimit) } : {}),
          ...(tx.maxFeePerGas ? { maxFeePerGas: BigInt(tx.maxFeePerGas) } : {}),
          ...(tx.maxPriorityFeePerGas ? { maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas) } : {}),
          ...(tx.gasPrice && !tx.maxFeePerGas ? { gasPrice: BigInt(tx.gasPrice) } : {}),
        });
        result = sent.hash;
      } else {
        throw new Error("Lyra can't sign this kind of request.");
      }
      await answer({ result });
    } catch (e) {
      setError(e?.shortMessage || e?.message || "Couldn't sign.");
      setBusy(false);
    }
  }

  if (req === undefined) {
    return <div className="rq-page"><div className="rq-center"><Loader2 className="spin" size={22} /></div></div>;
  }

  if (req === null) {
    return (
      <div className="rq-page">
        <div className="rq-center">
          <p className="rq-muted">This request is no longer waiting for an answer.</p>
          <button type="button" className="rq-secondary" onClick={() => window.close()}>Close</button>
        </div>
      </div>
    );
  }

  if (!saved?.address) {
    return (
      <div className="rq-page">
        <Header host={host} origin={req.origin} />
        <div className="rq-card">
          <div className="rq-title">No wallet yet</div>
          <p className="rq-summary">Open Lyra and create or import a wallet first, then try again on {host}.</p>
        </div>
        <div className="rq-actions"><button type="button" className="rq-secondary" onClick={reject}>Close</button></div>
      </div>
    );
  }

  const risk = isConnect ? "low" : translation?.risk || "medium";
  const { label: riskLabel, Icon: RiskIcon } = RISK[risk];

  return (
    <div className="rq-page">
      <Header host={host} origin={req.origin} />

      <div className={`rq-card rq-risk-${risk}`}>
        {isConnect ? (
          <>
            <div className="rq-title">Connect to {host}?</div>
            <p className="rq-summary">The site will see your wallet address and balances, and can ask you to approve transactions. It can't move anything without your approval.</p>
            <div className="rq-details">
              <Row label="Wallet" value={shortAddress(saved.address)} />
              <Row label="Network" value={network.name} />
            </div>
          </>
        ) : !translation ? (
          <div className="rq-center rq-small"><Loader2 className="spin" size={18} /> Reading the request…</div>
        ) : (
          <>
            <div className={`rq-badge rq-badge-${risk}`}><RiskIcon size={14} /> {riskLabel}</div>
            <div className="rq-title">{translation.title}</div>
            <p className="rq-summary">{translation.summary}</p>
            {translation.warnings.length > 0 && (
              <ul className="rq-warnings">
                {translation.warnings.map((w) => <li key={w}><AlertTriangle size={14} /> <span>{w}</span></li>)}
              </ul>
            )}
            <div className="rq-details">
              {translation.details.map((d, i) => <Row key={i} label={d.label} value={d.value} />)}
              <Row label="Network" value={network.name} />
              {fee && <Row label="Network fee" value={fee} />}
            </div>
          </>
        )}
      </div>

      {!isConnect && (
        <label className="unlock-password-field rq-password" htmlFor="rq-password">
          <Lock size={15} strokeWidth={1.8} className="unlock-password-icon" />
          <input
            id="rq-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) approve(); }}
            placeholder="Your Lyra password"
            autoComplete="current-password"
            autoFocus
          />
          <button type="button" className="unlock-password-eye" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </label>
      )}

      {error && <div className="seed-error rq-error">{error}</div>}

      <div className="rq-actions">
        <button type="button" className="rq-secondary" onClick={reject} disabled={busy}><X size={16} /> Reject</button>
        <button type="button" className={`rq-primary${risk === "high" ? " rq-primary-danger" : ""}`} onClick={approve} disabled={busy || (!isConnect && !translation) || translation?.risk === "blocked"}>
          {busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
          {isConnect ? "Connect" : req.method === "eth_sendTransaction" ? "Confirm" : "Sign"}
        </button>
      </div>
    </div>
  );
}

function Header({ host, origin }) {
  return (
    <div className="rq-header">
      <Logo3D className="rq-logo" />
      <div className="rq-site">
        <Globe size={14} />
        <span title={origin}>{host}</span>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="rq-row">
      <span className="rq-row-label">{label}</span>
      <span className="rq-row-value">{value}</span>
    </div>
  );
}
