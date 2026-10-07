// "switch to base" / "passe sur Sepolia" / "use polygon" etc.: handled
// locally, same switch as the network menu, no AI round trip (it works even
// when Lyra's server can't be reached). Short messages only, and never when
// the message asks for something else (a bridge or a swap "to base" is a
// real request for the AI).
const NAMES = [
  ["plasma", /\b(plasma|xpl)\b/],
  ["ethereum", /\b(ethereum|eth|sepolia|mainnet)\b/],
  ["base", /\bbase\b/],
  ["polygon", /\b(polygon|matic|pol|amoy)\b/],
  ["arc", /\barc\b/],
  ["hyperliquid", /\b(hyperliquid|hyper ?evm|hype)\b/],
];

export function parseNetworkCommand(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t || t.length > 50) return null;
  if (/\b(send|swap|bridge|stake|unstake|bet|buy|sell|pay|transfer|deposit|withdraw|envoie\w*|echange\w*|échange\w*|achete\w*|vend\w*)\b/.test(t) || /\d/.test(t)) return null;
  if (!/\b(switch|change|go|move|use|set|select|connect|passe|passer|bascule|basculer|mets|mettre|change[rz]?|aller|va)\b/.test(t)) return null;
  const hits = NAMES.filter(([, re]) => re.test(t));
  return hits.length === 1 ? hits[0][0] : null;
}
