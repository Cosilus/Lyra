// Shared pieces of the menu pages (Settings, Contacts, Help, Rewards): the
// header with its coloured icon, and the tinted icon in front of each setting.
import { X, Box, Download, Sparkles, Route, Lock, Globe, Fingerprint, ShieldCheck, Zap, Link, Gauge, Users, Settings } from "lucide-react";
import { isValidElement } from "react";
import "./menus.css";

export function PanelHead({ icon: Icon, tone = "p", title, subtitle, onClose }) {
  return (
    <div className="panel-head">
      <span className={`panel-head-icon tone-${tone}`} aria-hidden="true">{isValidElement(Icon) ? Icon : <Icon size={18} strokeWidth={1.9} />}</span>
      <div className="panel-head-text">
        <div className="panel-head-title">{title}</div>
        {subtitle && <div className="panel-head-sub">{subtitle}</div>}
      </div>
      <button type="button" className="contacts-close" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>
    </div>
  );
}

// a setting's icon, from its title
const SETTING_ICONS = [
  [/^interface/i, Box, "p"],
  [/^install/i, Download, "p"],
  [/plan animation/i, Sparkles, "p"],
  [/guided tour/i, Route, "p"],
  [/^auto-lock/i, Lock, "t"],
  [/^network/i, Globe, "b"],
  [/biometric unlock/i, Fingerprint, "t"],
  [/extra protection/i, ShieldCheck, "t"],
  [/one-transaction/i, Zap, "p"],
  [/^delegation/i, Link, "c"],
  [/require biometric/i, Fingerprint, "t"],
  [/spending limit/i, Gauge, "a"],
  [/multisig/i, Users, "b"],
];
export function SettingIcon({ title }) {
  const hit = SETTING_ICONS.find(([re]) => re.test(String(title || "")));
  const [, Icon, tone] = hit || [null, Settings, "p"];
  return <span className={`settings-row-icon tone-${tone}`} aria-hidden="true"><Icon size={15} strokeWidth={1.9} /></span>;
}

// a person's initial on a colour picked from their name (always the same one)
const AVATAR = [["#F0997B", "#4A1B0C"], ["#5DCAA5", "#04342C"], ["#85B7EB", "#042C53"], ["#C4B0FF", "#26215C"], ["#FAC775", "#412402"], ["#ED93B1", "#4B1528"]];
export function Avatar({ name, size = 32 }) {
  const s = String(name || "?");
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = AVATAR[h % AVATAR.length];
  return (
    <span className="menu-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: bg, color: fg }} aria-hidden="true">
      {s.trim()[0]?.toUpperCase() || "?"}
    </span>
  );
}
