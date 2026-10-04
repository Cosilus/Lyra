import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { ShieldAlert, ShieldCheck, TriangleAlert, Globe, BadgeCheck, Ban, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { API_BASE_URL } from "../config.js";
import { logAuditEvent } from "../auditLog.js";
import { fetchPendingRequests, isApprovalWindow, resolveRequest } from "./dappBridge.js";
import { lookupSpender } from "./knownSpenders.js";
import { readPermission, short, tokenAt } from "./readings.js";
import { parseTypedDataParams, readTypedData, signableTypes } from "./typedData.js";
import "./dapp.css";

// Requests from websites (extension build): connect, send a transaction, sign
// a message, switch network. Shown one at a time in Lyra's approval window,
// with a plain-language reading of what the site asks for and a risk level.
//
// Requests are read locally first: known function selectors, sign-in
// messages, typed-data signatures (typedData.js) and known app contracts
// (knownSpenders.js). Then the backend (server/routes/dapp.js) adds what it
// can check: the site against phishing lists, the transaction simulated
// (real balance changes, hidden approvals) and the contract's reputation.
// Anything Lyra can't read is shown as "can't verify", never as safe.

const MAX_UINT = ethers.MaxUint256;
const ERC20 = new ethers.Interface([
  "function approve(address spender, uint256 amount)",
  "function increaseAllowance(address spender, uint256 addedValue)",
  "function transfer(address to, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
]);
// What a transaction does, as far as Lyra can tell without simulating it.
// The permission a transaction gives, remembered in the audit trail once
// sent, so the chat can list and revoke it later (approvals.js).
const withApproval = (approval, args) => ({ ...readPermission(args), approval });

function readTransaction(tx, network, origin) {
  const data = tx.data && tx.data !== "0x" ? tx.data : null;
  const value = tx.value ? BigInt(tx.value) : 0n;
  const valueText = value > 0n ? `${ethers.formatEther(value)} ${network.nativeSymbol}` : null;

  if (!data) {
    return { risk: "ok", title: `Send ${valueText || `0 ${network.nativeSymbol}`}`, lines: [`To ${short(tx.to)}`] };
  }
  if (!tx.to) {
    return { risk: "warn", title: "Deploy a contract", lines: ["This creates a new smart contract from your wallet."] };
  }

  let call = null;
  try { call = ERC20.parseTransaction({ data, value }); } catch { /* not one of the known calls */ }
  const token = tokenAt(network.key, tx.to);
  const amountText = (raw) => {
    if (BigInt(raw) >= MAX_UINT / 2n) return "an UNLIMITED amount";
    return token ? `${ethers.formatUnits(raw, token.decimals)} ${token.symbol}` : `${raw.toString()} units`;
  };
  const tokenName = token ? token.symbol : `the token at ${short(tx.to)}`;

  switch (call?.name) {
    case "approve":
    case "increaseAllowance": {
      const [spender, amount] = call.args;
      const unlimited = BigInt(amount) >= MAX_UINT / 2n;
      const known = lookupSpender(spender, origin);
      return withApproval({ token: tx.to, spender, all: false }, {
        spender,
        origin,
        title: `Allow ${known?.protocol || short(spender)} to use your ${tokenName}`,
        knownLine: unlimited
          ? `Unlimited is the usual choice here: you won't have to approve (and pay a fee) again for every use.`
          : `Up to ${amountText(amount)}.`,
        unknownRisk: unlimited ? "danger" : "warn",
        unknownLines: [
          `It could move ${amountText(amount)} of your ${tokenName}, at any time, without asking you again.`,
          unlimited ? "Lyra doesn't know this contract. Unlimited permissions to unknown contracts are how most wallet-draining scams work." : "Lyra doesn't know this contract. Accept only if you meant to use this site with this token.",
        ],
      });
    }
    case "setApprovalForAll": {
      const [operator, approved] = call.args;
      if (!approved) return { risk: "ok", title: `Remove ${short(operator)}'s access to this collection`, lines: [] };
      const known = lookupSpender(operator, origin);
      return withApproval({ token: tx.to, spender: operator, all: true }, {
        spender: operator,
        origin,
        title: `Allow ${known?.protocol || short(operator)} to transfer your items in this collection`,
        knownLine: "It covers every item you hold in this collection, so you can list any of them without approving each one.",
        unknownRisk: "danger",
        unknownLines: ["It could take every NFT you hold in this collection, now or later. Lyra doesn't know this contract: this is the most common NFT scam."],
      });
    }
    case "transfer": {
      const [to, amount] = call.args;
      return { risk: "ok", title: `Send ${amountText(amount)}`, lines: [`To ${short(to)}`] };
    }
    case "transferFrom": {
      const [from, to, amount] = call.args;
      return { risk: "warn", title: `Move ${amountText(amount)}`, lines: [`From ${short(from)} to ${short(to)}`] };
    }
  }

  return {
    risk: "unknown",
    title: `Use the contract at ${short(tx.to)}`,
    lines: [
      valueText ? `Sends ${valueText} along with the call.` : "No coins sent directly.",
      "Lyra can't read this contract call yet, so it can't tell you what it does. Only continue on a site you trust.",
    ],
  };
}

function readMessage(rawMessage, origin) {
  let text = rawMessage;
  if (ethers.isHexString(rawMessage)) {
    try { text = ethers.toUtf8String(rawMessage); } catch { text = null; }
  }
  if (text === null || /[\u0000-\u0008\u000e-\u001f]/.test(text)) {
    return { risk: "danger", title: "Sign unreadable data", lines: ["This isn't text, so you can't know what you're agreeing to. Don't sign unless you know exactly why."], text: rawMessage };
  }
  // Sign-In with Ethereum (EIP-4361): the first line names the site asking.
  const siwe = text.match(/^(\S+) wants you to sign in with your Ethereum account:/);
  if (siwe) {
    const host = new URL(origin).host;
    const matches = siwe[1] === host;
    return matches
      ? { risk: "ok", title: `Sign in to ${host}`, lines: ["A login: it proves you own this address, it can't move funds."], text }
      : { risk: "danger", title: `Sign in to ${siwe[1]}, from ${host}`, lines: [`This site asks you to log in to a DIFFERENT site (${siwe[1]}). That's a phishing pattern.`], text };
  }
  return { risk: "ok", title: "Sign a message", lines: ["Signing text doesn't move funds by itself. Read it first."], text };
}

// personal_sign is [message, address], but a few older sites send it the
// other way round.
function messageParam(params = []) {
  return ethers.isAddress(params[0]) && !ethers.isAddress(params[1]) ? params[1] : params[0];
}

const RISK_ORDER = ["ok", "expected", "unknown", "warn", "danger", "blocked"];
const raise = (reading, risk, line) => ({
  ...reading,
  risk: RISK_ORDER.indexOf(risk) > RISK_ORDER.indexOf(reading.risk) ? risk : reading.risk,
  lines: line ? [...reading.lines, line] : reading.lines,
  // once something is wrong, the reassuring "normal step" box no longer applies
  why: RISK_ORDER.indexOf(risk) >= RISK_ORDER.indexOf("warn") ? null : reading.why,
});

// What the backend found, folded into the local reading.
function applyAnalysis(reading, analysis, { origin, method, txTo }) {
  if (!analysis) return reading;
  let r = reading;
  const { site, simulation, contract } = analysis;

  if (site?.phishing) {
    return {
      risk: "blocked",
      title: `${site.host} is a known phishing site`,
      lines: [`It's listed by ${site.sources.join(" and ")} as a site that steals crypto. Lyra won't let you sign anything here. Close the tab.`],
    };
  }

  if (simulation?.available && simulation.reverted) {
    r = raise(r, "warn", `Simulation: this transaction would fail (${simulation.error}). You'd pay the network fee for nothing.`);
  }
  if (simulation?.available && !simulation.reverted) {
    const out = simulation.changes.filter(c => c.direction === "out");
    const inn = simulation.changes.filter(c => c.direction === "in");
    const hasData = method === "eth_sendTransaction" && txTo && reading.title && !/^Send /.test(reading.title);
    if (hasData && out.length && !inn.length && !lookupSpender(txTo, origin)) {
      r = raise(r, "warn", "Simulation: you'd send assets and get nothing back in this transaction. Make sure that's what you expect (a payment, a deposit).");
    }
    // A permission hidden inside a call Lyra couldn't read (multicall...).
    if (!reading.spender) {
      for (const a of simulation.approvals) {
        const known = lookupSpender(a.spender, origin);
        const what = a.all ? `all your ${a.symbol || "items"} in this collection` : `${a.unlimited ? "an UNLIMITED amount of" : a.amountText || "some of"} your ${a.symbol || "tokens"}`;
        r = known
          ? raise(r, "unknown", `It also gives ${known.protocol} permission to use ${what}.`)
          : raise(r, a.all || a.unlimited ? "danger" : "warn", `Hidden in this call: it gives ${short(a.spender)} (unknown to Lyra) permission to use ${what}.`);
      }
    }
  }

  if (contract?.flags?.length) {
    r = raise(r, "danger", `Security databases flag this contract: ${[...new Set(contract.flags)].join(", ")}.`);
  } else if (contract?.isContract && contract.verified === false && contract.ageDays !== null && contract.ageDays < 30) {
    r = raise(r, "warn", `This contract was created ${contract.ageDays === 0 ? "today" : `${contract.ageDays} day${contract.ageDays > 1 ? "s" : ""} ago`} and its code isn't published. Scams often use fresh, hidden contracts.`);
  }
  return r;
}

const RISK_LABEL = { blocked: "Blocked", expected: "Normal step", ok: "Looks fine", warn: "Check carefully", unknown: "Can't verify", danger: "Dangerous" };
const RISK_ICON = { blocked: Ban, expected: BadgeCheck, ok: ShieldCheck, warn: TriangleAlert, unknown: TriangleAlert, danger: ShieldAlert };

export default function DappRequests({ wallet, privateKey, locked, network, rpcUrl, networks, onSwitchNetwork }) {
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feeText, setFeeText] = useState("");
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [spenderIsWallet, setSpenderIsWallet] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef(null);
  const emptyPolls = useRef(0);
  const active = isApprovalWindow();
  const ready = !!(wallet?.address && privateKey && !locked);

  const refresh = useCallback(async () => {
    const list = await fetchPendingRequests();
    // Same requests as before: keep the same objects, so polling doesn't
    // reset what the user is doing (risk checkbox, fee estimate).
    setQueue(prev => prev.length === list.length && prev.every((r, i) => r.id === list[i].id) ? prev : list);
    // Close once everything is answered. A few empty polls first, so a
    // slow first answer from the background doesn't close the window early.
    emptyPolls.current = list.length ? 0 : emptyPolls.current + 1;
    if (active && emptyPolls.current >= 3) window.close();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    refresh();
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [active, refresh]);

  const request = queue[0] || null;
  let reading = useMemo(() => {
    if (!request) return null;
    switch (request.method) {
      case "eth_requestAccounts":
        return { risk: "ok", title: "Connect to this site", lines: ["The site will see your address and balances, and can ASK for transactions. Each one still needs your confirmation."] };
      case "eth_sendTransaction":
        return readTransaction(request.params?.[0] || {}, network, request.origin);
      case "personal_sign":
        return readMessage(messageParam(request.params), request.origin);
      case "eth_signTypedData_v4":
      case "eth_signTypedData_v3":
        return readTypedData(request.params, { network, origin: request.origin, account: wallet?.address || "" });
      case "wallet_switchEthereumChain": {
        const wanted = networks.find(n => "0x" + n.chainId.toString(16) === String(request.params?.[0]?.chainId).toLowerCase());
        return { risk: "ok", title: `Switch to ${wanted?.name || "another network"}`, lines: [`Lyra will use ${wanted?.name || "this network"} from now on, here and on this site.`] };
      }
      default:
        return { risk: "unknown", title: request.method, lines: [] };
    }
  }, [request?.id, network, networks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Backend checks: site reputation, simulation, contract facts. Hold stays
  // disabled while they run (8s at most), they never block on their own.
  useEffect(() => {
    setAnalysis(null);
    if (!request || !ready || !reading) return;
    const tx = request.method === "eth_sendTransaction" ? request.params?.[0] : null;
    const address = reading.spender || tx?.to || (reading.verifyingContract ?? null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    setAnalysing(true);
    fetch(`${API_BASE_URL}/api/dapp/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ network: network.key, origin: request.origin, from: wallet.address, tx, address }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(a => setAnalysis(a))
      .catch(() => {})
      .finally(() => { clearTimeout(timer); setAnalysing(false); });
    return () => { clearTimeout(timer); controller.abort(); };
  }, [request?.id, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Network fee, and an early warning when the transaction would fail.
  useEffect(() => {
    setFeeText("");
    setError("");
    setRiskAccepted(false);
    setSpenderIsWallet(false);
    if (!request || !ready) return;
    const provider = new ethers.JsonRpcProvider(rpcUrl, network.chainId);
    let cancelled = false;
    // A permission given to a personal wallet (no contract code) has no
    // legitimate use: apps always use contracts.
    if (reading?.unknownSpender) {
      provider.getCode(reading.spender).then(code => { if (!cancelled && code === "0x") setSpenderIsWallet(true); }).catch(() => {});
    }
    if (request.method !== "eth_sendTransaction") return () => { cancelled = true; };
    const tx = request.params?.[0] || {};
    (async () => {
      try {
        const [gas, fees] = await Promise.all([
          provider.estimateGas({ from: wallet.address, to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n }),
          provider.getFeeData(),
        ]);
        const price = fees.maxFeePerGas ?? fees.gasPrice ?? 0n;
        const fee = Number(ethers.formatEther(gas * price));
        if (!cancelled) setFeeText(fee > 0 && fee < 0.000001 ? `< 0.000001 ${network.nativeSymbol}` : `≈ ${fee.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${network.nativeSymbol}`);
      } catch (e) {
        if (!cancelled) setError("This transaction would probably fail on-chain (the network refused to estimate it).");
      }
    })();
    return () => { cancelled = true; };
  }, [request?.id, ready, rpcUrl, network, wallet?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active || !request) return null;

  if (!ready) {
    return (
      <div className="dapp-locked-banner">
        <Globe size={14} /> {new URL(request.origin).host} is waiting for you. Unlock Lyra to review its request.
      </div>
    );
  }

  const audit = (status, extra = {}) => logAuditEvent({
    category: "dapp", action: request.method, status, networkKey: network.key, counterparty: request.origin, ...extra,
  });

  async function answer(payload) {
    const reply = await resolveRequest(request.id, payload);
    if (reply?.remaining === 0) { window.close(); return; }
    setQueue(q => q.slice(1));
    refresh();
  }

  async function reject() {
    audit("rejected");
    await answer({ error: { code: 4001, message: "The user rejected the request." } });
  }

  async function approve() {
    setBusy(true);
    setError("");
    try {
      const signer = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(rpcUrl, network.chainId));
      let result = null;
      if (request.method === "eth_requestAccounts") {
        result = [wallet.address];
      } else if (request.method === "eth_sendTransaction") {
        const tx = request.params[0];
        const sent = await signer.sendTransaction({
          to: tx.to || undefined,
          data: tx.data || "0x",
          value: tx.value ? BigInt(tx.value) : 0n,
          gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
        });
        result = sent.hash;
        audit("sent", { txHash: sent.hash, meta: reading.approval ? { approval: reading.approval } : undefined });
      } else if (request.method === "personal_sign") {
        const raw = messageParam(request.params);
        result = await signer.signMessage(ethers.isHexString(raw) ? ethers.getBytes(raw) : raw);
      } else if (request.method === "eth_signTypedData_v4" || request.method === "eth_signTypedData_v3") {
        const data = parseTypedDataParams(request.params);
        const { EIP712Domain, ...rest } = data.types; // eslint-disable-line no-unused-vars
        result = await signer.signTypedData(data.domain, signableTypes({ ...data, types: rest }), data.message);
      } else if (request.method === "wallet_switchEthereumChain") {
        const wanted = networks.find(n => "0x" + n.chainId.toString(16) === String(request.params[0].chainId).toLowerCase());
        onSwitchNetwork(wanted.key);
      }
      if (request.method !== "eth_sendTransaction") audit("approved");
      await answer({ result });
    } catch (e) {
      setError(e.shortMessage || e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  reading = applyAnalysis(reading, analysis, { origin: request.origin, method: request.method, txTo: request.params?.[0]?.to });
  if (spenderIsWallet) {
    reading = { ...reading, risk: "danger", lines: [...reading.lines, "The receiver is a personal wallet, not an app contract. No real app asks for this: it's a scam pattern."] };
  }
  const needsRiskAck = reading.risk === "danger";
  const blocked = reading.risk === "blocked";
  const canHold = !busy && !analysing && !blocked && (!needsRiskAck || riskAccepted);
  const RiskIcon = RISK_ICON[reading.risk];

  function startHold() {
    if (!canHold) return;
    setHolding(true);
    holdTimer.current = setTimeout(() => { setHolding(false); approve(); }, 1200);
  }
  function stopHold() {
    setHolding(false);
    clearTimeout(holdTimer.current);
  }

  const host = new URL(request.origin).host;

  return (
    <div className="dapp-overlay">
      <div className="dapp-panel">
        <div className="dapp-site">
          {request.icon ? <img src={request.icon} alt="" className="dapp-favicon" /> : <Globe size={18} />}
          <div>
            <div className="dapp-host">{host}</div>
            <div className="dapp-net">{network.name}{queue.length > 1 ? ` · ${queue.length - 1} more waiting` : ""}</div>
          </div>
        </div>

        <div className={`dapp-risk dapp-risk-${reading.risk}`}>
          <RiskIcon size={14} /> {RISK_LABEL[reading.risk]}
        </div>

        <div className="dapp-title">{reading.title}</div>
        {reading.lines.map((line, i) => <p key={i} className="dapp-line">{line}</p>)}

        {reading.why && (
          <div className="dapp-why">
            <div className="dapp-why-heading"><BadgeCheck size={14} /> {reading.why.heading}</div>
            <p>{reading.why.text}</p>
            <p className="dapp-why-footer">{reading.why.footer}</p>
          </div>
        )}

        {/* A message is what the user agrees to: shown in full. Typed data is
            already summarised above, its raw fields stay one click away. */}
        {reading.text && (request.method === "personal_sign"
          ? <pre className="dapp-message">{reading.text}</pre>
          : (
            <div className="dapp-rows">
              <details>
                <summary>Technical details</summary>
                <pre className="dapp-message">{reading.text}</pre>
              </details>
            </div>
          ))}

        {analysis?.simulation?.available && !analysis.simulation.reverted && analysis.simulation.changes.length > 0 && (
          <div className="dapp-changes">
            <div className="dapp-changes-title">Balance changes (simulated)</div>
            {analysis.simulation.changes.map((c, i) => (
              <div key={i} className={`dapp-change dapp-change-${c.direction}`}>
                {c.direction === "in" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                <span>{c.direction === "in" ? "+" : "−"} {c.kind === "nft" ? `${c.symbol || short(c.token)} #${c.ids.join(", #")}` : `${Number(c.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${c.symbol || short(c.token)}`}</span>
              </div>
            ))}
          </div>
        )}
        {analysing && <p className="dapp-checking">Lyra is checking this request…</p>}

        {request.method === "eth_sendTransaction" && (
          <div className="dapp-rows">
            <div><span>Network fee</span><strong>{feeText || "Calculating…"}</strong></div>
            <details>
              <summary>Technical details</summary>
              <pre className="dapp-message">{JSON.stringify(request.params[0], null, 2)}</pre>
            </details>
          </div>
        )}

        {error && <div className="dapp-error">{error}</div>}

        {needsRiskAck && (
          <label className="dapp-ack">
            <input type="checkbox" checked={riskAccepted} onChange={e => setRiskAccepted(e.target.checked)} />
            I understand the risk and still want to continue.
          </label>
        )}

        <div className="dapp-actions">
          <button type="button" className="dapp-reject" onClick={reject} disabled={busy}>Reject</button>
          <button
            type="button"
            className={`dapp-hold${holding ? " holding" : ""}`}
            disabled={!canHold}
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
          >
            <span className="dapp-hold-fill" />
            <span className="dapp-hold-label">{busy ? "Working…" : "Hold to confirm"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
