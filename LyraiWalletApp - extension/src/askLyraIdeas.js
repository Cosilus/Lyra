// Ideas shown under "Ask Lyra" when the box is focused and empty. Three at a
// time, drawn from a shuffled deck kept in localStorage, so every focus shows
// new ones and a user sees the whole range (wallet, DeFi, x402, multi-step)
// after a few visits before any idea comes back.

const DECK_KEY = "lyra_ask_ideas_deck_v1";

// ctx = { stable, native, other, who, who2, otherNet }
export function buildIdeas({ stable, native, other, who, who2, otherNet }) {
  return [
    // In the wallet
    { kind: "send", text: `Send 5 ${stable} to ${who}` },
    { kind: "send", text: `Send $10 of ${native} to ${who}` },
    { kind: "receive", text: `Show my address to receive ${stable}` },
    { kind: "wallet", text: `Show my balance on every network` },
    { kind: "wallet", text: `Show my last 5 transactions` },
    { kind: "wallet", text: `Switch to ${otherNet}` },
    { kind: "wallet", text: `Open my contacts` },
    { kind: "wallet", text: `Gather all my ${stable} on one network` },
    { kind: "send", text: `Send 1 ${stable} to ${who2}` },

    // DeFi
    { kind: "swap", text: `Swap all my ${stable} to ${other}` },
    { kind: "swap", text: `Swap half my ${native} to ${stable}` },
    { kind: "bridge", text: `Bridge 10 ${stable} to ${otherNet}` },
    { kind: "stake", text: `Stake 20 ${stable} to earn yield` },
    { kind: "unstake", text: `Withdraw my staked ${stable}` },
    { kind: "stake", text: `Stake all my ${stable}` },
    { kind: "bridge", text: `Bridge half my ${stable} to ${otherNet}` },

    // x402 and paid APIs
    { kind: "pay", text: `Pay a few cents for a market news summary with x402` },
    { kind: "pay", text: `Find a paid weather API and pay it with x402` },
    { kind: "pay", text: `Show my Nanopayments balance` },
    { kind: "pay", text: `Deposit 5 USDC into Nanopayments` },
    { kind: "pay", text: `Set my x402 spending limit to $5` },

    // Several steps, one plan
    { kind: "multi", text: `Swap 20 ${stable} to ${other}, then send it to ${who}` },
    { kind: "multi", text: `Bridge 10 ${stable} to ${otherNet} and stake it` },
    { kind: "multi", text: `Send 5 ${stable} to ${who} and 5 ${stable} to ${who2}` },
    { kind: "multi", text: `Withdraw my staked ${stable}, then bridge it to ${otherNet}` },
    { kind: "multi", text: `Swap 10 ${stable} to ${native}, then send it to ${who}` },
    { kind: "multi", text: `Swap half my ${native} to ${stable} and stake it` },
    { kind: "multi", text: `Swap 5 ${stable} to ${other} and bridge it to ${otherNet}` },
  ].filter(idea => !sameAssetTwice(idea.text));
}

// On a network whose gas coin is the stablecoin (Arc: USDC), "swap USDC to
// USDC" ideas make no sense: drop them.
function sameAssetTwice(text) {
  return /\b([A-Z][A-Za-z0-9.]{1,9}) to \1\b/.test(text) || /\$\d+ of USD/.test(text);
}

function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The next `count` ideas from the deck; a new shuffled deck once it runs out.
export function drawIdeas(ideas, count = 3) {
  if (!ideas.length) return [];
  let deck = null;
  try { deck = JSON.parse(localStorage.getItem(DECK_KEY) || "null"); } catch { /* storage off */ }
  if (!deck || deck.size !== ideas.length || !Array.isArray(deck.order)) {
    deck = { size: ideas.length, order: shuffled(ideas.length), at: 0 };
  }
  const picked = [];
  while (picked.length < Math.min(count, ideas.length)) {
    if (deck.at >= deck.order.length) deck = { size: ideas.length, order: shuffled(ideas.length), at: 0 };
    const i = deck.order[deck.at++];
    if (!picked.includes(i)) picked.push(i);
  }
  try { localStorage.setItem(DECK_KEY, JSON.stringify(deck)); } catch { /* storage off */ }
  return picked.map(i => ideas[i]);
}
