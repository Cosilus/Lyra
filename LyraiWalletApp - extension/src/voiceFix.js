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
  if (close[0]) return close[0]; // symbols come held-first, so the one the user owns wins a tie
  // by sound: spelled letters that rhyme ("bee, see, dee, ee, gee, pee, tee,
  // vee, zee", "bé, cé, dé, pé, té, vé") are easy to mix up, so "USB" can be
  // USDT. Compared on that sound, without a trailing digit (USDT0 -> USDT).
  const key = (x) => x.toUpperCase().replace(/[^A-Z]/g, "").replace(/[BCDEGPTVZ]/g, "E");
  const wk = key(w);
  if (wk.length < 2 || !/^[A-Z]{2,5}$/.test(word)) return null; // only words heard as capitals
  const bySound = symbols.filter(s => {
    const sk = key(s.replace(/\d+$/, ""));
    return sk[0] === wk[0] && sk !== wk && lev(sk, wk) <= 1 && Math.abs(sk.length - wk.length) <= 1;
  });
  return bySound[0] || null;
}

// ---- numbers said as words -> digits, so Lyra reads them as amounts ----
const UNITS = {
  zero: 0, "zéro": 0, cero: 0, um: 1, uma: 1, one: 1, un: 1, une: 1, uno: 1, una: 1, eins: 1, ein: 1, eine: 1,
  two: 2, deux: 2, dos: 2, due: 2, zwei: 2, dois: 2, duas: 2,
  three: 3, trois: 3, tres: 3, "três": 3, tre: 3, drei: 3,
  four: 4, quatre: 4, cuatro: 4, quattro: 4, vier: 4, quatro: 4,
  five: 5, cinq: 5, cinco: 5, cinque: 5, "fünf": 5,
  six: 6, seis: 6, sei: 6, sechs: 6,
  seven: 7, sept: 7, siete: 7, sette: 7, sieben: 7, sete: 7,
  eight: 8, huit: 8, ocho: 8, otto: 8, acht: 8, oito: 8,
  nine: 9, neuf: 9, nueve: 9, nove: 9, neun: 9,
  ten: 10, dix: 10, diez: 10, dieci: 10, zehn: 10, dez: 10,
  eleven: 11, onze: 11, once: 11, undici: 11, elf: 11,
  twelve: 12, douze: 12, doce: 12, dodici: 12, "zwölf": 12,
  thirteen: 13, treize: 13, fourteen: 14, quatorze: 14, fifteen: 15, quinze: 15, sixteen: 16, seize: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, vingt: 20, veinte: 20, venti: 20, zwanzig: 20, vinte: 20,
  thirty: 30, trente: 30, treinta: 30, trenta: 30, "dreißig": 30, trinta: 30,
  forty: 40, quarante: 40, cuarenta: 40, quaranta: 40, vierzig: 40, quarenta: 40,
  fifty: 50, cinquante: 50, cincuenta: 50, cinquanta: 50, "fünfzig": 50, cinquenta: 50,
  sixty: 60, soixante: 60, sesenta: 60, sessanta: 60, sechzig: 60, sessenta: 60,
  seventy: 70, septante: 70, eighty: 80, huitante: 80, ninety: 90, nonante: 90,
};
const HUNDRED = new Set(["hundred", "cent", "cents", "cien", "ciento", "cento", "hundert", "cem"]);
const THOUSAND = new Set(["thousand", "mille", "mil", "mila", "tausend"]);
const DECIMAL = new Set(["point", "virgule", "comma", "coma", "virgola", "komma", "vírgula", "virgula"]);
const JOIN = new Set(["et", "and", "y", "e", "und"]);
// "un", "one"... are also articles: they count only right before a ticker
const AMBIGUOUS = new Set(["un", "une", "one", "uno", "una", "um", "uma", "ein", "eine", "eins"]);

const low = (w) => strip(w || "").toLowerCase().replace(/[^a-zß\-]/g, "");
const unitOf = (w) => UNITS[low(w)] ?? UNITS[(w || "").toLowerCase().replace(/[^\p{L}]/gu, "")];

// number words from i on ("vingt et un", "cent cinquante", "twenty-five",
// "zéro virgule cinq"); returns { value, end } or null
function numberRun(words, i) {
  let total = 0, current = 0, end = i, any = false;
  for (let j = i; j < words.length; j++) {
    const parts = (words[j] || "").toLowerCase().replace(/[^\p{L}\-]/gu, "").split("-").filter(Boolean);
    if (!parts.length) break;
    let ok = true, local = 0;
    for (const p of parts) {
      const u = UNITS[p] ?? UNITS[strip(p)];
      if (u !== undefined) local += u;
      else if (HUNDRED.has(p)) { current = ((current + local) || 1) * 100; local = 0; }
      else if (THOUSAND.has(p)) { total += ((current + local) || 1) * 1000; current = 0; local = 0; }
      else if (JOIN.has(p) && any) continue;
      else { ok = false; break; }
    }
    if (!ok) {
      if (any && JOIN.has(low(words[j])) && unitOf(words[j + 1]) !== undefined) continue; // "vingt et un"
      break;
    }
    current += local;
    any = true;
    end = j + 1;
  }
  if (!any) return null;
  let value = String(total + current);
  if (DECIMAL.has(low(words[end])) && unitOf(words[end + 1]) !== undefined && unitOf(words[end + 1]) < 10) {
    let digits = "", k = end + 1;
    while (k < words.length && unitOf(words[k]) !== undefined && unitOf(words[k]) < 10) { digits += unitOf(words[k]); k++; }
    value += "." + digits;
    end = k;
  }
  return { value, end };
}

function wordsToDigits(text, symbols) {
  const words = text.split(" ");
  const isTicker = (w) => !!w && symbols.some(s => s.toUpperCase() === w.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase());
  const out = [];
  for (let i = 0; i < words.length; i++) {
    // "1,5 XPL" in French: a decimal comma
    if (/^\d+,\d+$/.test(words[i]) && isTicker(words[i + 1])) { out.push(words[i].replace(",", ".")); continue; }
    const run = numberRun(words, i);
    if (!run) { out.push(words[i]); continue; }
    if (run.end === i + 1 && AMBIGUOUS.has(low(words[i])) && !isTicker(words[i + 1])) { out.push(words[i]); continue; }
    const tail = words[run.end - 1].replace(/^[\p{L}\p{N}\-]+/u, ""); // a trailing comma or period stays
    out.push(run.value + tail);
    i = run.end - 1;
  }
  // "swap 1 XPL USDT0": the "to" / "en" between two tickers was lost
  for (let i = out.length - 2; i >= 0; i--) {
    if (isTicker(out[i]) && isTicker(out[i + 1]) && /^[\p{L}\p{N}]+$/u.test(out[i])) out.splice(i + 1, 0, "to");
  }
  return out.join(" ");
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
  // rebuild with single spaces where words were merged, then amounts as digits
  return wordsToDigits(out.join(" ").replace(/\s+/g, " ").trim(), symbols);
}
