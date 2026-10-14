// What Lyra recognised in the Ask Lyra sentence, as character ranges, so the
// box can tint them while the user types (amounts, tokens, contacts,
// networks, "half my XPL", "the rest", addresses). Purely visual: the plan
// itself still comes from parseAskLyra and handleIntent.

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// `kind`: "contact" for a saved contact, "value" for everything else
export function highlightRanges(text, { tokenSymbols = [], contacts = [], networks = [] } = {}) {
  const value = String(text || "");
  if (!value.trim()) return [];
  const found = [];
  const add = (re, kind = "value") => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(value))) {
      if (!m[0]) { re.lastIndex++; continue; }
      found.push({ start: m.index, end: m.index + m[0].length, kind });
    }
  };

  const symbols = tokenSymbols.filter(Boolean).map(esc);
  const symbolAlt = symbols.length ? symbols.join("|") : null;

  // "half my XPL", "all my USDT0", "a quarter of my ETH"
  add(new RegExp(`\\b(?:half|all|a quarter|a third)(?:\\s+of)?\\s+my\\s+${symbolAlt ? `(?:${symbolAlt})` : "[A-Za-z0-9]+"}\\b`, "gi"));
  // "the rest", "everything", "max"
  add(/\b(?:the rest|everything|max)\b/gi);
  // amounts: 5, 0.5, 1,000.25, $10, 10$
  add(/\$?\d+(?:[.,]\d+)*\$?/g);
  // token tickers
  if (symbolAlt) add(new RegExp(`\\b(?:${symbolAlt})\\b`, "gi"));
  // networks
  const nets = networks.map(n => n?.name).filter(Boolean).map(esc);
  if (nets.length) add(new RegExp(`\\b(?:${nets.join("|")})\\b`, "gi"));
  // full or partly typed addresses
  add(/0x[0-9a-fA-F]{6,}/g);
  // saved contacts (longest names first so "Papa Jean" beats "Papa")
  const names = contacts.map(c => c?.name).filter(Boolean).sort((a, b) => b.length - a.length).map(esc);
  if (names.length) add(new RegExp(`(?<![\\w])(?:${names.join("|")})(?![\\w])`, "gi"), "contact");

  // keep the widest range when two overlap ("half my XPL" over "XPL")
  found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = [];
  for (const r of found) {
    const last = out[out.length - 1];
    if (last && r.start < last.end) {
      if (r.end > last.end && r.kind === last.kind) last.end = r.end;
      continue;
    }
    out.push({ ...r });
  }
  return out;
}

// The text cut into plain and highlighted pieces, in order.
export function highlightSegments(text, ranges) {
  const value = String(text || "");
  const segs = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start > at) segs.push({ text: value.slice(at, r.start), kind: null });
    segs.push({ text: value.slice(r.start, r.end), kind: r.kind });
    at = r.end;
  }
  if (at < value.length) segs.push({ text: value.slice(at), kind: null });
  return segs;
}
