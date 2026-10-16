import { useMemo } from "react";
import { Gift, ArrowLeftRight, Send, Route, Vault } from "lucide-react";
import { loadAuditLog } from "./auditLog.js";

// "Rewards" tab: the user's own activity with Lyra, counted from the wallet's
// local record of real actions (auditLog.js: successful sends, swaps, bridges,
// stakes; Lyra's own fee lines are not counted), and what the airdrop is about.
const KINDS = [
  { key: "send", label: "Sends", Icon: Send, tone: "t" },
  { key: "swap", label: "Swaps", Icon: ArrowLeftRight, tone: "p" },
  { key: "bridge", label: "Bridges", Icon: Route, tone: "b" },
  { key: "stake", label: "Stakes", Icon: Vault, tone: "a" },
];
const GOAL = 50; // the bar fills up to 50 interactions, then starts again

function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

export function RewardsPanel() {
  const stats = useMemo(() => {
    const done = loadAuditLog().filter(e => e.status === "success" && e.category !== "fee");
    const by = Object.fromEntries(KINDS.map(k => [k.key, done.filter(e => e.category === k.key || (k.key === "stake" && e.category === "unstake")).length]));
    // days in a row with at least one interaction, ending today or yesterday
    const days = new Set(done.map(e => dayKey(e.timestamp)));
    let streak = 0;
    const d = new Date();
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
    return { total: done.length, by, streak };
  }, []);

  return (
    <div className="rewards">
      <div className="rw-hero">
        <span>Interactions recorded</span>
        <div className="rw-count">{stats.total}</div>
        <div className="rw-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, ((stats.total % GOAL) / GOAL) * 100)}%` }} /></div>
        <span>{stats.streak > 1 ? `${stats.streak}-day streak · keep going` : stats.total ? "Every interaction counts" : "Your first one starts the count"}</span>
      </div>

      <div className="rw-card">
        <div className="rw-row">
          <span className="settings-row-icon tone-p" aria-hidden="true"><Gift size={15} strokeWidth={1.9} /></span>
          <span className="rw-row-text"><b>Community Airdrop</b><span>A new type of airdrop. Details soon.</span></span>
          <span className="menu-chip">Soon</span>
        </div>
        {KINDS.map(({ key, label, Icon, tone }) => (
          <div className="rw-row" key={key}>
            <span className={`settings-row-icon tone-${tone}`} aria-hidden="true"><Icon size={15} strokeWidth={1.9} /></span>
            <span className="rw-row-text"><b>{label}</b></span>
            <span className="rw-row-value">{stats.by[key]}</span>
          </div>
        ))}
      </div>

      <p className="rw-note">Counted on this device. Details and eligibility will be announced; nothing here is a promise of any reward.</p>
    </div>
  );
}
