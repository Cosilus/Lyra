// Live reading of what the user is typing in "Ask Lyra", before anything is
// sent: which words are amounts, tokens, people or networks (highlighted in
// the input) and which steps the sentence describes (the preview boxes under
// it). Purely local and best effort: the real plan still comes from the
// backend once the message is sent.

const VERBS = [
  { kind: "swap", re: /^(swap|swaps|convert|exchange|trade|change)$/i },
  { kind: "send", re: /^(send|sends|pay|transfer|give)$/i },
  { kind: "stake", re: /^(stake|deposit|earn|lend)$/i },
  { kind: "unstake", re: /^(unstake|withdraw)$/i },
  { kind: "bridge", re: /^(bridge|move)$/i },
];

const QUANTIFIERS = /^(half|all|everything|max|rest|quarter|third)$/i;
const ADDRESS = /^0x[0-9a-fA-F]{6,}$/;
const NAME_SERVICE = /^[a-z0-9-]+\.(eth|sui|lens|base|xyz)$/i;
const NUMBER = /^\$?\d+(?:[.,]\d+)?%?$/;

function tokenizeWithOffsets(text) {
  const out = [];
  const re = /[A-Za-z0-9$.%,_-]+/g;
  let m;
  while ((m = re.exec(text))) {
    // a trailing comma or period ends a clause, it is not part of the word
    let word = m[0];
    let end = m.index + word.length;
    while (/[.,]$/.test(word) && !/^\$?\d+[.,]\d+$/.test(word)) {
      word = word.slice(0, -1);
      end -= 1;
    }
    if (word) out.push({ word, start: m.index, end });
  }
  return out;
}

// Well-known tokens, recognised on every network: the active network only
// lists what it holds (Arc: USDC, EURC), but "bridge 3 USDT to Base" still
// names a token.
const COMMON_SYMBOLS = ["USDC", "USDC.E", "USDT", "USDT0", "EURC", "DAI", "ETH", "WETH", "BTC", "WBTC", "CBBTC", "SOL", "XPL", "POL", "MATIC", "HYPE", "ARB", "OP", "BNB", "AVAX"];

// text -> { highlights: [{start, end, type}], steps: [{kind, amount, asset, toAsset, recipient, network, fromPrevious}] }
export function parseAskLyra(text, { tokenSymbols = [], contacts = [], networks = [] } = {}) {
  const symbols = new Set([...COMMON_SYMBOLS, ...tokenSymbols.map(s => s.toUpperCase())]);
  const contactNames = contacts.map(c => ({ name: c.name, lower: c.name.toLowerCase(), address: c.address }));
  const networkNames = networks.map(n => ({ key: n.key, name: n.name, lower: n.name.toLowerCase(), first: n.name.split(" ")[0].toLowerCase() }));

  const words = tokenizeWithOffsets(text);
  const highlights = [];
  const steps = [];
  let current = null;

  const mark = (w, type) => highlights.push({ start: w.start, end: w.end, type });
  const markSpan = (a, b, type) => highlights.push({ start: a.start, end: b.end, type });

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const lower = w.word.toLowerCase();

    const verb = VERBS.find(v => v.re.test(w.word));
    if (verb) {
      current = { kind: verb.kind, amount: null, asset: null, toAsset: null, recipient: null, network: null, fromPrevious: steps.length > 0 };
      steps.push(current);
      continue;
    }
    if (!current) continue;

    // "half my SUI", "all my USDC", "the rest"
    if (QUANTIFIERS.test(w.word)) {
      const startWord = /^the$/i.test(words[i - 1]?.word || "") ? words[i - 1] : w;
      let endWord = w;
      let j = i + 1;
      while (j < words.length && /^(my|of|the|your)$/i.test(words[j].word)) j++;
      if (j < words.length && symbols.has(words[j].word.toUpperCase())) {
        endWord = words[j];
        current.asset = current.asset || words[j].word.toUpperCase();
        i = j;
      }
      markSpan(startWord, endWord, "amount");
      current.amount = lower === "rest" ? "the rest" : lower === "everything" ? "all" : lower;
      continue;
    }

    if (NUMBER.test(w.word)) {
      mark(w, "amount");
      current.amount = current.amount || w.word.replace(",", ".");
      continue;
    }

    if (symbols.has(w.word.toUpperCase())) {
      mark(w, "token");
      const prev = words[i - 1]?.word.toLowerCase();
      if (current.kind === "swap" && (prev === "to" || prev === "for" || prev === "into") && current.asset) {
        current.toAsset = w.word.toUpperCase();
      } else if (!current.asset) {
        current.asset = w.word.toUpperCase();
      } else if (current.kind === "swap") {
        current.toAsset = w.word.toUpperCase();
      }
      continue;
    }

    if (ADDRESS.test(w.word) || NAME_SERVICE.test(w.word)) {
      mark(w, "person");
      current.recipient = w.word;
      continue;
    }

    const contact = contactNames.find(c => c.lower === lower);
    if (contact) {
      mark(w, "person");
      current.recipient = contact.name;
      continue;
    }

    const net = networkNames.find(n => n.lower === lower || n.first === lower);
    if (net && /^(to|on|onto|via)$/i.test(words[i - 1]?.word || "")) {
      mark(w, "network");
      current.network = net.name;
      if (current.kind === "send" && !current.recipient) current.kind = "bridge";
      continue;
    }

    // "send 10 to maria": an unknown name after "to" is still a recipient
    if (current.kind === "send" && !current.recipient && /^to$/i.test(words[i - 1]?.word || "") && /^[a-z][\w.-]{1,}$/i.test(w.word)) {
      mark(w, "person");
      current.recipient = w.word;
    }
  }

  highlights.sort((a, b) => a.start - b.start);
  return { highlights, steps };
}

// Splits the text into plain and highlighted pieces for the overlay.
export function highlightPieces(text, highlights) {
  const pieces = [];
  let pos = 0;
  for (const h of highlights) {
    if (h.start < pos) continue;
    if (h.start > pos) pieces.push({ text: text.slice(pos, h.start) });
    pieces.push({ text: text.slice(h.start, h.end), type: h.type });
    pos = h.end;
  }
  if (pos < text.length) pieces.push({ text: text.slice(pos) });
  return pieces;
}
