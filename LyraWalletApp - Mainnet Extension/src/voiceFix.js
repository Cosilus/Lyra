// Speech recognition hears words, not tickers or the user's contacts: "1 XPL"
// comes back as "un XL", "1 x p l" or "1 XP", and "Brian" as "Bryan". This
// puts back what the wallet knows at that moment: the symbols of the tokens
// on the active network (the ones held first) and the saved contact names.
// Only near misses are changed; anything that doesn't look like one of them
// is left as heard.

const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Short words that must never be taken for a ticker, in Lyra's languages
const STOP = new Set(("a an and at be by do for go i if in is it me my no of on or so to up us we " +
  "de du la le les un une et en au aux ma mon mes ce sa son ses tu il je ne pas sur par pour " +
  "el los las una y al del con mi mis es " +
  "da di il lo gli e per con mio " +
  "der die das ein eine und zu mit von auf " +
  "o os um uma e do da em com meu").split(" "));

// spoken digits and letters, so "USDT zero" or "x p l" become USDT0 / XPL
const SPOKEN = {
  zero: "0", zéro: "0", cero: "0", null: "0", one: "1", un: "1", une: "1", uno: "1", eins: "1", two: "2", deux: "2", dos: "2",
  ex: "X", ix: "X", pi: "P", pe: "P", pee: "P", el: "L", elle: "L", es: "S", ess: "S", di: "D", de: "D", dee: "D", si: "C", see: "C", ce: "C",
  ti: "T", te: "T", tee: "T", you: "U", u: "U", ou: "U", i: "I", eth: "ETH",
};

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// a rough sound key for names: Bryan / Brian, Jonathon / Jonathan, Stephane / Stéphane
function soundKey(name) {
  return strip(name).toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/ph/g, "f").replace(/ck|q/g, "k").replace(/c(?=[aou])/g, "k")
    .replace(/y/g, "i").replace(/h/g, "")
    .replace(/(.)\1+/g, "$1")
    .replace(/e$/, "");
}

function tickerOf(words, symbols) {
  // the letters and digits of a few words in a row, as one ticker
  const joined = words.map(w => {
    const lw = strip(w).toLowerCase();
    return SPOKEN[lw] && words.length > 1 ? SPOKEN[lw] : w;
  }).join("").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!joined) return null;
  return symbols.find(s => s.toUpperCase() === joined) || null;
}

function nearTicker(word, symbols) {
  const w = word.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (w.length < 2 || STOP.has(word.toLowerCase())) return null;
  // spelled as a ticker (capitals) or short: a near miss of exactly one symbol
  const looksTicker = /^[A-Z0-9]{2,6}$/.test(word) || w.length <= 3;
  if (!looksTicker) return null;
  const close = symbols.filter(s => {
    const S = s.toUpperCase();
    if (S === w) return false;
    if (Math.abs(S.length - w.length) > 1) return false;
    return lev(S, w) === 1 && (S.includes(w) || w.length >= 3 || S[0] === w[0] || S.endsWith(w));
  });
  return close[0] || null; // symbols come held-first, so the one the user owns wins a tie
}

/**
 * fixTranscript("envoie un XL à Bryan", { symbols: ["XPL", "USDT0"], contacts: [{ name: "Brian" }] })
 *   -> "envoie un XPL à Brian"
 */
export function fixTranscript(text, { symbols = [], contacts = [] } = {}) {
  if (!text) return text;
  const parts = text.split(/(\s+)/); // words and the spaces between them
  const words = parts.filter((_, i) => i % 2 === 0);
  const out = [];
  const names = contacts.map(c => c?.name).filter(Boolean);
  const keys = names.map(n => ({ name: n, key: soundKey(n), first: soundKey(n.split(/\s+/)[0]) }));

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const bare = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const pre = w.slice(0, w.indexOf(bare));
    const post = w.slice(w.indexOf(bare) + bare.length);
    let done = false;

    // 3, 2 then 1 words making one ticker: "x p l", "USDT zero", "USD C"
    for (const n of [3, 2]) {
      if (i + n > words.length) continue;
      const group = words.slice(i, i + n).map(x => x.replace(/[^\p{L}\p{N}]/gu, ""));
      // only plain letters and digits, each word part of the ticker ("à", "to" never are)
      if (group.some(g => !/^[A-Za-z0-9]{1,5}$/.test(g) || STOP.has(g.toLowerCase()) && !SPOKEN[g.toLowerCase()])) continue;
      const hit = tickerOf(group, symbols);
      if (hit) {
        const last = words[i + n - 1];
        out.push(hit + last.replace(/^[\p{L}\p{N}]+/u, ""));
        i += n - 1;
        done = true;
        break;
      }
    }
    if (done) continue;
    if (!bare) { out.push(w); continue; }

    const exact = symbols.find(s => s.toUpperCase() === bare.toUpperCase());
    if (exact) { out.push(pre + exact + post); continue; }
    const near = nearTicker(bare, symbols);
    if (near) { out.push(pre + near + post); continue; }

    // a contact's name heard a little differently (only for words that aren't common ones)
    if (keys.length && bare.length >= 3 && !STOP.has(bare.toLowerCase())) {
      const k = soundKey(bare);
      const two = i + 1 < words.length ? soundKey(bare + words[i + 1]) : null;
      const full = keys.find(c => two && c.key === two && c.name.includes(" "));
      if (full) { out.push(pre + full.name + words[i + 1].replace(/^[\p{L}\p{N}]+/u, "")); i += 1; continue; }
      const same = keys.filter(c => c.first === k || (k.length >= 4 && lev(c.first, k) <= 1));
      if (same.length === 1 && same[0].name.split(/\s+/)[0].toLowerCase() !== bare.toLowerCase()) {
        out.push(pre + same[0].name.split(/\s+/)[0] + post);
        continue;
      }
    }
    out.push(w);
  }
  // rebuild with single spaces where words were merged, original spacing otherwise
  return out.join(" ").replace(/\s+/g, " ").trim();
}
