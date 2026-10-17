// Live reading of what the user is typing in "Ask Lyra", before anything is
// sent: which words are amounts, tokens, people or networks (highlighted in
// the input) and which steps the sentence describes (the preview boxes under
// it). Purely local and best effort: the real plan still comes from the
// backend once the message is sent.

// The verbs in every language Lyra speaks (word by word for the languages
// written with spaces; the others are caught by VERB_SUBSTRINGS below).
const VERBS = [
  { kind: "swap", re: /^(swap|swaps|convert|exchange|trade|change|swappe|échange\p{L}*|echange\p{L}*|convertis|convertir|change[rz]?|cambia|cambiar|intercambia\p{L}*|conviert[ea]|troca|troque|trocar|convert[ae]|converter|tausch\p{L}*|wechsl\p{L}*|wechseln|umtauschen|scambia\p{L}*|convertire|takas|değiştir\p{L}*|degistir\p{L}*|çevir\p{L}*|cevir\p{L}*|tukar\p{L}*|đổi|doi|обменя\p{L}*|поменя\p{L}*|конверт\p{L}*)$/iu },
  { kind: "send", re: /^(send|sends|pay|transfer|give|envo[iy]\p{L}*|pa[iy]e[rz]?|transf[eéè]r\p{L}*|donne[rz]?|envía|envia[rs]?|enviar|envíe|envie|manda|mandar|mande|paga|pagar|pague|transfier\p{L}*|transfira|transferir|sende|senden|schick\p{L}*|zahle|zahlen|überweis\p{L}*|ueberweis\p{L}*|invia\p{L}*|mandare|pagare|trasferisci|trasferire|gönder\p{L}*|gonder\p{L}*|öde|kirim\p{L}*|bayar\p{L}*|gửi|gui|chuyển|chuyen|отправ\p{L}*|пошли|перевед\p{L}*|перевест\p{L}*|заплат\p{L}*)$/iu },
  { kind: "stake", re: /^(stake|deposit|earn|lend|stak\p{L}*|d[ée]pos\p{L}*|pr[eê]te[rz]?|deposita\p{L}*|deposite|presta\p{L}*|empreste|einzahl\p{L}*|verleih\p{L}*|yatır\p{L}*|setor\p{L}*|внес\p{L}*|застейк\p{L}*)$/iu },
  { kind: "unstake", re: /^(unstake|withdraw|retire[rz]?|retira[r]?|saque|sacar|abheben|auszahl\p{L}*|ritira\p{L}*|preleva\p{L}*|tarik|вывед\p{L}*|вывест\p{L}*|сним\p{L}*)$/iu },
  { kind: "bridge", re: /^(bridge|move|bridger|puentea\p{L}*|ponte|brücke)$/iu },
];

// Languages written without spaces (or where the word comes with endings
// glued on): looked for anywhere in the sentence.
const VERB_SUBSTRINGS = [
  { kind: "bridge", re: /跨链|ブリッジ|브릿지|브리지|ब्रिज/u },
  { kind: "swap", re: /兑换|换成|交换|交換|両替|スワップ|스왑|교환|바꿔|استبدل|بدّل|بدل|स्वैप|बदल/u },
  { kind: "unstake", re: /取出|赎回|引き出|出金|인출|출금|سحب|निकाल/u },
  { kind: "stake", re: /质押|存入|ステーク|預け|스테이킹|예치|راهن|إيداع|ايداع|स्टेक|जमा/u },
  { kind: "send", re: /发送|转账|转给|付款|支付|送金|送って|送る|送信|払って|보내|송금|전송|أرسل|ارسل|حوّل|حول|ادفع|भेज|ट्रांसफर/u },
];

// "to" in each language: "send 10 to maria", "swap USDC to EURC", "bridge to Base"
const TO_WORDS = /^(to|for|into|on|onto|via|à|a|au|vers|en|pour|sur|para|em|no|na|zu|nach|an|auf|in|per|su|ke|kepada|di|sang|cho|için|на|в|для)$/iu;

const QUANTIFIERS = /^(half|all|everything|max|rest|quarter|third|tout|toute|tous|moitié|reste|todo|toda|mitad|resto|tudo|metade|alles|hälfte|tutto|metà|hepsi|yarısı|semua|setengah|sisa|всё|все|половин\p{L}*|остат\p{L}*)$/iu;
const REST_WORDS = /^(rest|reste|resto|sisa|остат\p{L}*)$/iu;
const ALL_WORDS = /^(all|everything|tout|toute|tous|todo|toda|tudo|alles|tutto|hepsi|semua|всё|все)$/iu;
const HALF_WORDS = /^(half|moitié|mitad|metade|hälfte|metà|yarısı|setengah|половин\p{L}*)$/iu;
// "half MY sui", "la moitié DE mes usdc"
const FILLER_WORDS = /^(my|of|the|your|mon|ma|mes|de|du|des|le|la|les|mi|mis|meu|minha|meus|minhas|do|da|dos|das|mein|meine|meines|von|der|die|das|il|lo|i|miei|mia|mie|benim|saya|мои|мой|моих)$/iu;
const ADDRESS = /^0x[0-9a-fA-F]{6,}$/;
const NAME_SERVICE = /^[a-z0-9-]+\.(eth|sui|lens|base|xyz)$/i;
const NUMBER = /^\$?\d+(?:[.,]\d+)?%?$/;

function tokenizeWithOffsets(text) {
  const out = [];
  const re = /[\p{L}\p{M}\p{N}$.%,_-]+/gu;
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
export function parseAskLyra(text, { tokenSymbols = [], contacts = [], networks = [], currentNetwork = null } = {}) {
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
    // ...unless it's a contact's name: "send 1 XPL to Max"
    const isContactHere = contactNames.some(c => c.lower === lower) && (current.amount || TO_WORDS.test(words[i - 1]?.word || ""));
    if (QUANTIFIERS.test(w.word) && !isContactHere) {
      const startWord = FILLER_WORDS.test(words[i - 1]?.word || "") ? words[i - 1] : w;
      let endWord = w;
      let j = i + 1;
      while (j < words.length && FILLER_WORDS.test(words[j].word)) j++;
      if (j < words.length && symbols.has(words[j].word.toUpperCase())) {
        endWord = words[j];
        current.asset = current.asset || words[j].word.toUpperCase();
        i = j;
      }
      markSpan(startWord, endWord, "amount");
      current.amount = REST_WORDS.test(lower) ? "the rest" : ALL_WORDS.test(lower) ? "all" : HALF_WORDS.test(lower) ? "half" : lower;
      continue;
    }

    if (NUMBER.test(w.word)) {
      // "send 1 XPL to Brian and 2 XPL to Max": a new amount after a step that
      // already has its amount and target is a new step of the same kind
      if (current.amount && (current.recipient || current.toAsset || current.network)) {
        current = { kind: current.kind, amount: null, asset: null, toAsset: null, recipient: null, network: null, fromPrevious: false };
        steps.push(current);
      }
      mark(w, "amount");
      current.amount = current.amount || w.word.replace(",", ".");
      continue;
    }

    if (symbols.has(w.word.toUpperCase())) {
      mark(w, "token");
      const prev = words[i - 1]?.word.toLowerCase();
      if (current.kind === "swap" && TO_WORDS.test(prev || "") && current.asset) {
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
    if (net && TO_WORDS.test(words[i - 1]?.word || "")) {
      mark(w, "network");
      current.network = net.name;
      if (current.kind === "send" && !current.recipient) current.kind = "bridge";
      continue;
    }

    // "send 10 to maria": an unknown name after "to" is still a recipient
    if (current.kind === "send" && !current.recipient && TO_WORDS.test(words[i - 1]?.word || "") && /^\p{L}[\p{L}\p{N}.-]{1,}$/u.test(w.word) && !FILLER_WORDS.test(w.word)) {
      mark(w, "person");
      current.recipient = w.word;
    }
  }

  // Nothing found word by word (Chinese, Japanese... written without spaces,
  // or a verb Lyra doesn't know): read the sentence as one step from its verb,
  // or from an amount sent to an address.
  if (!steps.length) {
    const fallback = readWholeSentence(text, symbols);
    if (fallback) {
      steps.push(fallback.step);
      highlights.push(...fallback.highlights);
    }
  }

  // no money moves (a top-up, a network switch, a screen, a setting): one box
  // all the same. It also wins over a verb read loosely ("change" is a swap
  // verb, "change network to Base" is not a swap) when that step got nothing.
  const action = readAction(text, { networks, currentNetwork });
  if (action && steps.every(st => !st.amount && !st.asset && !st.recipient && !st.toAsset)) {
    steps.length = 0;
    steps.push(action);
  }

  // anything else (a question, a request Lyra will work out): still a box,
  // so every sentence shows what comes back before it is sent
  const question = /\?\s*$|^(what|how|why|when|where|who|which|is|are|can|do|does|explain|tell|qu'?est|comment|pourquoi|quand|o[uù]|c'est quoi|explique)\b/i.test(String(text).trim());
  if (words.length >= 2 && (!steps.length || (question && steps.every(st => !st.amount && !st.asset && !st.recipient && !st.toAsset)))) {
    steps.length = 0;
    steps.push({ kind: "ask", label: question ? "Question" : "Request", from: question ? "Your question" : "Your request", fromIcon: "help", to: question ? "Lyra's answer" : "Lyra works it out", toIcon: "spark" });
  }

  highlights.sort((a, b) => a.start - b.start);
  return { highlights, steps };
}

function readWholeSentence(text, symbols) {
  const verb = VERB_SUBSTRINGS.find(v => v.re.test(text));
  const highlights = [];
  const address = /0x[0-9a-fA-F]{6,}/.exec(text);
  const amount = /(?<![\w.])\$?\d+(?:[.,]\d+)?%?/.exec(text.replace(/0x[0-9a-fA-F]+/g, m => " ".repeat(m.length)));
  const assets = [];
  const symRe = /[A-Za-z][A-Za-z0-9.]*/g;
  let m;
  while ((m = symRe.exec(text))) {
    if (/^0x/i.test(m[0])) continue;
    if (symbols.has(m[0].toUpperCase())) {
      assets.push(m[0].toUpperCase());
      highlights.push({ start: m.index, end: m.index + m[0].length, type: "token" });
    }
  }
  const kind = verb?.kind || (address && amount ? "send" : null);
  if (!kind) return null;
  if (amount) highlights.push({ start: amount.index, end: amount.index + amount[0].length, type: "amount" });
  if (address) highlights.push({ start: address.index, end: address.index + address[0].length, type: "person" });
  return {
    highlights,
    step: {
      kind,
      amount: amount ? amount[0].replace(",", ".") : null,
      asset: assets[0] || null,
      toAsset: kind === "swap" ? assets[1] || null : null,
      recipient: address ? address[0] : null,
      network: null,
      fromPrevious: false,
    },
  };
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

// Requests that move no money still get their preview box, so the user sees
// what will happen before sending: a top-up, a network or interface switch, a
// screen to open, a setting, locking. step = { kind, label, from, to,
// fromIcon, toIcon }: `from` -> `to`, each with an optional icon kind.
const MENUS = [
  [/\b(settings?|r[ée]glages?|param[eè]tres?)\b/i, "Settings", "settings"],
  [/\b(contacts?|address book)\b/i, "Contacts", "contacts"],
  [/\b(history|historique|transactions?|activity|activit[ée])\b/i, "History", "history"],
  [/\b(help|aide|faq)\b/i, "Help", "help"],
  [/\b(rewards?|r[ée]compenses?|airdrop)\b/i, "Rewards", "rewards"],
  [/\b(assets?|portfolio|portefeuille|tokens)\b/i, "Assets", "wallet"],
  [/\b(approvals?|autorisations?)\b/i, "Approvals", "shield"],
];
const LANGS = { english: "English", anglais: "English", french: "French", français: "French", francais: "French", spanish: "Spanish", espagnol: "Spanish", german: "German", allemand: "German", italian: "Italian", italien: "Italian", portuguese: "Portuguese", portugais: "Portuguese", chinese: "Chinese", chinois: "Chinese", japanese: "Japanese", japonais: "Japanese", korean: "Korean", russian: "Russian", turkish: "Turkish", arabic: "Arabic", hindi: "Hindi" };

export function readAction(text, { networks = [], currentNetwork = null } = {}) {
  const t = String(text || "").trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const money = t.match(/[$€]\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:[$€]|usd|eur|dollars?|euros?)(?![a-z])/i);
  const amount = money ? (money[1] || money[2]).replace(",", ".") : (t.match(/\b(\d+(?:[.,]\d+)?)\b/)?.[1] || null);
  const token = t.match(/\b(USDC|USDT0?|EURC|ETH|XPL|POL|HYPE|DAI)\b/i)?.[1]?.toUpperCase() || null;
  const net = networks.find(n => new RegExp(`\\b${n.name.split(" ")[0]}\\b`, "i").test(t));

  // top up / buy with a card or a bank transfer
  if (/\b(top[\s-]?up|recharge\w*|on[\s-]?ramp|buy|ach[eè]te\w*|add (?:\$|€|\d))/i.test(t) && !/\b(x402|nano ?payments?|gateway)\b/i.test(t)) {
    const what = [amount ? `$${amount}` : null, token || "USDC"].filter(Boolean).join(" ");
    return { kind: "topup", label: "Top up", from: "Card or bank", fromIcon: "bank", to: what, toIcon: "wallet" };
  }
  // cash out to a bank account
  if (/\b(cash ?out|off[\s-]?ramp|sell .*to (?:my )?bank|withdraw .*to (?:my )?bank|vers ma banque|retire\w* .*banque)\b/i.test(t)) {
    const what = [amount, token].filter(Boolean).join(" ") || "Your funds";
    return { kind: "offramp", label: "Cash out", from: what, fromIcon: "wallet", to: "Bank account", toIcon: "bank" };
  }
  // 2D / 3D
  const mode = lower.match(/\b(2d|3d)\b/);
  if (mode && /\b(switch|change|go|use|passe|mode|interface|view|vue)\b/i.test(t)) {
    const to = mode[1].toUpperCase();
    return { kind: "setting", label: "Interface", from: to === "3D" ? "2D" : "3D", fromIcon: "box", to, toIcon: "box" };
  }
  // switch network
  if (net && /\b(switch|change|go|move to|use|passe|bascule|network|r[ée]seau|chain)\b/i.test(t) && !/\b(bridge|send|swap|stake|envoie|transf)/i.test(t)) {
    return { kind: "network", label: "Switch network", from: currentNetwork || "Current network", fromIcon: "globe", to: net.name, toIcon: "globe" };
  }
  // reply language
  const lang = Object.keys(LANGS).find(k => new RegExp(`\\b${k}\\b`, "i").test(t));
  if (lang && /\b(speak|reply|answer|talk|language|langue|parle|r[ée]ponds?)\b/i.test(t)) {
    return { kind: "setting", label: "Language", from: "Lyra's replies", fromIcon: "language", to: LANGS[lang], toIcon: "language" };
  }
  // auto-lock delay, biometrics
  const minutes = t.match(/(\d+)\s*(?:min|minutes?)/i)?.[1];
  if (/auto[\s-]?lock/i.test(t)) {
    return { kind: "setting", label: "Auto-lock", from: "Auto-lock", fromIcon: "lock", to: minutes ? `${minutes} min` : /\b(off|never|disable|d[ée]sactive)\b/i.test(t) ? "Off" : null, toIcon: "timer" };
  }
  // lock
  if (/\b(lock|verrouill\w*|bloque)\b/i.test(t) && !/\bunlock\b/i.test(t)) {
    return { kind: "lock", label: "Lock wallet", from: "Unlocked", fromIcon: "wallet", to: "Locked", toIcon: "lock" };
  }
  if (/\b(biometric\w*|fingerprint|face ?id|touch ?id|empreinte|windows hello)\b/i.test(t)) {
    const off = /\b(off|disable|remove|turn off|d[ée]sactive|enl[eè]ve)\b/i.test(t);
    return { kind: "setting", label: "Fingerprint unlock", from: off ? "On" : "Off", fromIcon: "fingerprint", to: off ? "Off" : "On", toIcon: "fingerprint" };
  }
  // show my address / receive
  if (/\b(my address|mon adresse|receive|recevoir|deposit address|qr)\b/i.test(t)) {
    return { kind: "receive", label: "Receive", from: "Your address", fromIcon: "wallet", to: net?.name || currentNetwork || "QR code", toIcon: "qr" };
  }
  // balance
  if (/\b(balance|solde|how much do i have|combien j'ai)\b/i.test(t)) {
    return { kind: "balance", label: "Balance", from: "Your wallet", fromIcon: "wallet", to: /\b(every|all|tous|toutes)\b/i.test(t) ? "All networks" : (net?.name || currentNetwork || "This network"), toIcon: "globe" };
  }
  // open a screen
  if (/\b(open|show|go to|display|ouvre|affiche|montre|va dans|voir)\b/i.test(t)) {
    const menu = MENUS.find(([re]) => re.test(t));
    if (menu) return { kind: "open", label: "Open", from: "Wallet", fromIcon: "wallet", to: menu[1], toIcon: menu[2] };
  }
  return null;
}
