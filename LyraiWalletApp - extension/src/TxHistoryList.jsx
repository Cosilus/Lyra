// The transaction history lists (Send / Receive / Swap / Stake / Bridge).
// A line opens in place to show the essentials of that interaction and the
// explorer link, instead of jumping straight to the explorer. Stake adds two
// views next to its history: the positions still open, and the closed ones.
import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ExternalLink } from "lucide-react";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const amt = (leg) => (leg ? `${Number(leg.valueXPL).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${leg.symbol || ""}`.trim() : null);
const when = (ts) => {
  const d = new Date(ts * 1000);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
};

// "aPlaUSDT0" (the receipt token) -> "USDT0" when that's one of the network's tokens
export function stakeAssetOf(symbol, knownSymbols) {
  const s = String(symbol || "");
  if (knownSymbols.includes(s)) return s;
  const hit = knownSymbols.find(k => /^a/.test(s) && s.endsWith(k));
  return hit || s;
}

function rowTitle(row) {
  if (row.category === "send") return row.isSent ? `↗ Sent to ${row.counterpartyLabel}` : `↙ Received from ${row.counterpartyLabel}`;
  if (row.category === "swap") return "⇄ Swap";
  if (row.category === "stake") return row.stakeAction === "withdraw" ? "◆ Withdrawn" : "◆ Staked";
  return "⇢ Bridged";
}

// The few lines worth knowing for each kind of interaction
function rowDetails(row, { networkName, protocolFor }) {
  const lines = [];
  if (row.category === "send") {
    lines.push([row.isSent ? "To" : "From", row.counterpartyName ? `${row.counterpartyName} · ${short(row.counterparty)}` : short(row.counterparty)]);
    lines.push(["Amount", amt(row.display)]);
  } else if (row.category === "swap") {
    lines.push(["Paid", amt(row.outgoing) || "—"]);
    lines.push(["Received", amt(row.incoming) || "—"]);
    const via = protocolFor("swap");
    if (via) lines.push(["Via", via]);
  } else if (row.category === "stake") {
    lines.push(["Action", row.stakeAction === "withdraw" ? "Withdraw to wallet" : "Deposit to staking"]);
    lines.push(["Amount", amt(row.display)]);
    lines.push(["Protocol", protocolFor("stake", { asset: row.asset })]);
  } else {
    lines.push(["Amount", amt(row.display)]);
    const via = protocolFor("bridge");
    if (via) lines.push(["Via", via]);
  }
  lines.push(["Network", networkName]);
  lines.push(["Date", when(row.timestamp)]);
  return lines;
}

// one line after the other, sliding in from the left (like the ideas under Ask Lyra)
const slideIn = (i) => ({
  initial: { opacity: 0, x: -18 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 10) * 0.045 },
});

function TxLine({ row, open, onToggle, networkName, protocolFor, explorerUrl, index = 0 }) {
  const negative = row.category === "stake" ? row.stakeAction !== "withdraw" : row.isSent;
  return (
    <motion.div className={`tx-item-wrap${open ? " is-open" : ""}`} {...slideIn(index)}>
      <button type="button" className={`tx-item ${negative ? "sent" : "received"}`} onClick={onToggle} aria-expanded={open}>
        <div className="tx-item-main">
          <div className="tx-item-direction">{rowTitle(row)}</div>
          <div className="tx-item-date">{when(row.timestamp)}</div>
        </div>
        <div className={`tx-item-amount ${negative ? "negative" : "positive"}`}>
          {negative ? "-" : "+"}{amt(row.display)}
        </div>
        <ChevronDown size={14} className="tx-item-chevron" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="tx-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="tx-detail-inner">
              {rowDetails(row, { networkName, protocolFor }).map(([k, v]) => (
                <div className="tx-detail-row" key={k}>
                  <span>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
              <a className="tx-detail-link" href={explorerUrl(row.hash)} target="_blank" rel="noreferrer">
                {short(row.hash)} <ExternalLink size={12} />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function TxHistoryList({ rows, networkName, protocolFor, explorerUrl, emptyText = "No transactions found for this category." }) {
  const [openHash, setOpenHash] = useState(null);
  if (!rows.length) return <div className="contacts-empty">{emptyText}</div>;
  return rows.map((row, i) => (
    <TxLine
      key={row.hash}
      index={i}
      row={row}
      open={openHash === row.hash}
      onToggle={() => setOpenHash(h => (h === row.hash ? null : row.hash))}
      networkName={networkName}
      protocolFor={protocolFor}
      explorerUrl={explorerUrl}
    />
  ));
}

// Stake: Active (what is staked now) · Closed (assets fully withdrawn) · History
// Aave's dashboard, opened on this network's market (Aave lists the positions
// of the wallet connected there). Networks without a known market open the
// dashboard as is, where the market can be picked.
const AAVE_MARKETS = {
  ethereum: "proto_mainnet_v3",
  base: "proto_base_v3",
  polygon: "proto_polygon_v3",
  plasma: "proto_plasma_v3",
};
export function aaveDashboardUrl(networkKey) {
  const market = AAVE_MARKETS[networkKey];
  return market ? `https://app.aave.com/dashboard/?marketName=${market}` : "https://app.aave.com/dashboard/";
}

export function StakeHistory({ rows, positions, networkName, networkKey, protocolFor, explorerUrl }) {
  const [view, setView] = useState("active");
  const [openAsset, setOpenAsset] = useState(null);

  const activeAssets = positions.map(p => p.symbol);
  const closed = useMemo(() => {
    const by = new Map();
    for (const r of rows) {
      if (activeAssets.includes(r.asset)) continue;
      const c = by.get(r.asset) || { symbol: r.asset, deposited: 0, withdrawn: 0, last: 0, rows: [] };
      const v = Number(r.display.valueXPL) || 0;
      if (r.stakeAction === "withdraw") c.withdrawn += v;
      else c.deposited += v;
      c.last = Math.max(c.last, r.timestamp);
      c.rows.push(r);
      by.set(r.asset, c);
    }
    return [...by.values()].sort((a, b) => b.last - a.last);
  }, [rows, activeAssets.join(",")]);

  const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  const tabs = [
    ["active", "Active", positions.length],
    ["closed", "Closed", closed.length],
    ["history", "History", rows.length],
  ];

  return (
    <>
      <div className="stake-tabs" role="tablist">
        {tabs.map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`stake-tab${view === key ? " is-on" : ""}`}
            onClick={() => setView(key)}
          >
            {view === key && <motion.span layoutId="stake-tab-pill" className="stake-tab-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="stake-tab-label">{label}{n > 0 && <span className="stake-tab-n">{n}</span>}</span>
          </button>
        ))}
      </div>

      {view === "active" && (
        positions.length === 0 ? (
          <div className="contacts-empty">Nothing staked right now.</div>
        ) : positions.map((p, i) => {
          // the position on Aave's own dashboard: connect the wallet there and it's listed
          const link = { href: aaveDashboardUrl(networkKey), target: "_blank", rel: "noreferrer", "data-tip": "See this position on Aave" };
          return (
            <motion.a className="stake-pos" key={p.symbol} {...link} {...slideIn(i)}>
              <div className="tx-item-main">
                <div className="tx-item-direction">{p.symbol}</div>
                <div className="tx-item-date">{protocolFor("stake", { asset: p.symbol })} · {networkName}</div>
              </div>
              <div className="stake-pos-right">
                <div className="stake-pos-amount">{fmt(p.amount)} {p.symbol}</div>
                {p.apy != null && <div className="stake-pos-apy">{p.apy.toFixed(2)}% APY</div>}
              </div>
              <ExternalLink size={13} className="stake-pos-link" />
            </motion.a>
          );
        })
      )}

      {view === "closed" && (
        closed.length === 0 ? (
          <div className="contacts-empty">No closed positions yet.</div>
        ) : closed.map((c, i) => {
          const open = openAsset === c.symbol;
          return (
            <motion.div className={`tx-item-wrap${open ? " is-open" : ""}`} key={c.symbol} {...slideIn(i)}>
              <button type="button" className="tx-item" onClick={() => setOpenAsset(open ? null : c.symbol)} aria-expanded={open}>
                <div className="tx-item-main">
                  <div className="tx-item-direction">{c.symbol}</div>
                  <div className="tx-item-date">Closed · {when(c.last)}</div>
                </div>
                <div className="tx-item-amount">{fmt(c.withdrawn)} {c.symbol}</div>
                <ChevronDown size={14} className="tx-item-chevron" />
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    className="tx-detail"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="tx-detail-inner">
                      <div className="tx-detail-row"><span>Deposited</span><span>{fmt(c.deposited)} {c.symbol}</span></div>
                      <div className="tx-detail-row"><span>Withdrawn</span><span>{fmt(c.withdrawn)} {c.symbol}</span></div>
                      <div className="tx-detail-row"><span>Protocol</span><span>{protocolFor("stake", { asset: c.symbol })}</span></div>
                      <div className="tx-detail-row"><span>Network</span><span>{networkName}</span></div>
                      {c.rows.map(r => (
                        <a key={r.hash} className="tx-detail-link" href={explorerUrl(r.hash)} target="_blank" rel="noreferrer">
                          {r.stakeAction === "withdraw" ? "Withdraw" : "Deposit"} · {new Date(r.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {short(r.hash)} <ExternalLink size={12} />
                        </a>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })
      )}

      {view === "history" && (
        <TxHistoryList
          rows={rows}
          networkName={networkName}
          protocolFor={protocolFor}
          explorerUrl={explorerUrl}
          emptyText="No staking transactions yet."
        />
      )}
    </>
  );
}
