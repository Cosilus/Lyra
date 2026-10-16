// The transaction history lists (Send / Receive / Swap / Stake / Bridge).
// A line opens in place to show the essentials of that interaction and the
// explorer link, instead of jumping straight to the explorer. Stake adds two
// views next to its history: the positions still open, and the closed ones.
import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ExternalLink, Vault } from "lucide-react";
import { TokenWithChain } from "./uiPolish.jsx";

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

// A line in two parts: what happened ("Sent") and with whom or what ("to Papa")
function rowVerb(row) {
  if (row.category === "send") return row.isSent ? "Sent" : "Received";
  if (row.category === "swap") return "Swap";
  if (row.category === "stake") return row.stakeAction === "withdraw" ? "Withdrawn" : "Staked";
  return "Bridged";
}
function rowWith(row, { networkName, protocolFor }) {
  if (row.category === "send") return `${row.isSent ? "to" : "from"} ${row.counterpartyLabel}`;
  if (row.category === "swap") return row.outgoing && row.incoming ? `${row.outgoing.symbol} → ${row.incoming.symbol}` : protocolFor("swap") || networkName;
  if (row.category === "stake") return protocolFor("stake", { asset: row.asset }) || networkName;
  return protocolFor("bridge") ? `via ${protocolFor("bridge")}` : networkName;
}
const day = (ts) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const hour = (ts) => new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

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

// [logo] what happened / with whom        amount / date
function TxLine({ row, open, onToggle, networkName, networkKey, protocolFor, explorerUrl, index = 0 }) {
  const negative = row.category === "stake" ? row.stakeAction !== "withdraw" : row.isSent;
  const amount = `${negative ? "−" : "+"}${amt(row.display)}`;
  const who = rowWith(row, { networkName, protocolFor });
  return (
    <motion.div className={`tx-item-wrap${open ? " is-open" : ""}`} {...slideIn(index)}>
      <button type="button" className={`tx-item tx-line ${negative ? "sent" : "received"}`} onClick={onToggle} aria-expanded={open}>
        <TokenWithChain symbol={row.asset || row.display?.symbol} networkKey={networkKey} size={30} />
        <span className="tx-line-col">
          <span className="tx-line-verb">{rowVerb(row)}</span>
          <span className="tx-line-who">{who}</span>
        </span>
        <span className="tx-line-col is-right">
          <span className={`tx-line-amount ${negative ? "negative" : "positive"}`}>{amount}</span>
          <span className="tx-line-when">{day(row.timestamp)} · {hour(row.timestamp)}</span>
        </span>
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

// lines grouped by day ("Today", "Yesterday", "This week", then the month)
function dayGroup(ts) {
  const d = new Date(ts * 1000), now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return d.toLocaleDateString("en-US", { month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

// empty: { icon, tone, title, text, example } shows an invitation instead of a
// bare "nothing here"; stats: a small count summary above the lines
export function TxHistoryList({ rows, networkName, networkKey, protocolFor, explorerUrl, emptyText = "No transactions found for this category.", empty = null, stats = false }) {
  const [openHash, setOpenHash] = useState(null);
  const groups = useMemo(() => {
    const out = [];
    for (const row of rows) {
      const g = dayGroup(row.timestamp);
      if (!out.length || out[out.length - 1].label !== g) out.push({ label: g, rows: [] });
      out[out.length - 1].rows.push(row);
    }
    return out;
  }, [rows]);
  if (!rows.length) {
    if (!empty) return <div className="contacts-empty">{emptyText}</div>;
    const Icon = empty.icon;
    return (
      <div className="menu-empty">
        <span className={`menu-empty-icon tone-${empty.tone || "p"}`}>{Icon && <Icon size={19} strokeWidth={1.9} />}</span>
        <strong>{empty.title}</strong>
        <span>{empty.text}</span>
        {empty.example && <code className="menu-example">{empty.example}</code>}
      </div>
    );
  }
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  let i = 0;
  return (
    <>
      {stats && (
        <div className="tx-stats">
          <div><span>Total</span><b>{rows.length}</b></div>
          <div><span>This month</span><b>{rows.filter(r => r.timestamp * 1000 >= month.getTime()).length}</b></div>
        </div>
      )}
      {groups.map(g => (
        <div className="tx-group" key={g.label}>
          <div className="tx-group-label">{g.label}</div>
          <div className="tx-group-card">
            {g.rows.map(row => (
              <TxLine
                key={row.hash}
                index={i++}
                row={row}
                open={openHash === row.hash}
                onToggle={() => setOpenHash(h => (h === row.hash ? null : row.hash))}
                networkName={networkName}
                networkKey={networkKey}
                protocolFor={protocolFor}
                explorerUrl={explorerUrl}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
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
      <div className="stake-tabs" role="tablist" style={{ "--tabs": tabs.length, "--tab-i": Math.max(0, tabs.findIndex(([k]) => k === view)) }}>
        {/* one pill under the tabs that slides sideways only, whatever the
            panel around it does (it recentres when the content changes height) */}
        <span className="stake-tab-pill" aria-hidden="true" />
        {tabs.map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`stake-tab${view === key ? " is-on" : ""}`}
            onClick={() => setView(key)}
          >
            <span className="stake-tab-label">{label}{n > 0 && <span className="stake-tab-n">{n}</span>}</span>
          </button>
        ))}
      </div>

      {view === "active" && (
        positions.length === 0 ? (
          <div className="menu-empty">
            <span className="menu-empty-icon tone-a"><Vault size={19} strokeWidth={1.9} /></span>
            <strong>Put your stablecoins to work</strong>
            <span>Stake in one sentence, withdraw any time.</span>
            <code className="menu-example">stake 100 usdt0</code>
          </div>
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
          networkKey={networkKey}
          protocolFor={protocolFor}
          explorerUrl={explorerUrl}
          emptyText="No staking transactions yet."
        />
      )}
    </>
  );
}
