// Demo: what Lyra plans for a few requests, against a local server (npm run
// server, port 3001) and a demo wallet. Nothing is signed or sent.
//   node "LyraiWalletApp - 2D.3D/server/tests/demo-plans.mjs" ["your sentence"]
const API = process.env.LYRA_API || "http://localhost:3001";
const wallet = {
  walletAddress: "0x40b1000000000000000000000000000000005c27",
  balance: "2000",
  history: [],
  contacts: [{ name: "Papa", address: "0x1111111111111111111111111111111111111111" }],
  holdings: [{ symbol: "XPL", amount: "2000" }, { symbol: "USDT0", amount: "0" }, { symbol: "USDC", amount: "50" }],
  network: "plasma",
};
const phrases = process.argv.slice(2).length ? process.argv.slice(2) : [
  "swap 100 xpl to usdc and bridge them to base and swap them to eth",
  "swap 100 xpl to usdc",
  "swap 100 xpl to usdc, send 2 usdc to Papa and bridge the rest to base",
  "I want 100 usdc on ETH and take my xpl",
];
const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, violet: (s) => `\x1b[38;5;141m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m` };
const CHAIN = { pla: "Plasma", eth: "Ethereum", bas: "Base", pol: "Polygon", hyp: "Hyperliquid" };

console.log(c.bold("\nLyra · plan demo") + c.dim(`  (wallet on Plasma: 2000 XPL, 50 USDC, contact Papa · nothing is signed)`));
for (const message of phrases) {
  console.log("\n" + c.violet("» " + message));
  const t0 = Date.now();
  let j;
  try {
    const r = await fetch(`${API}/api/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...wallet, message }) });
    j = await r.json();
  } catch (e) {
    console.log(c.yellow(`  Lyra's server isn't answering on ${API}: ${e.message}`));
    continue;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (j.intent === "CHAT" || (!j.steps && !j.defiTicket)) {
    console.log(c.yellow("  Lyra asks: ") + (j.message || j.intent) + c.dim(`  (${secs}s)`));
    continue;
  }
  const steps = j.steps || [{ kind: j.defiFeature, amount: j.amount, asset: j.asset, tokenOutSymbol: j.defiTicket?.tokenOutSymbol, ticket: j.defiTicket }];
  console.log(c.green(`  ${steps.length} step${steps.length > 1 ? "s" : ""}, one confirmation`) + c.dim(`  (${secs}s)`));
  steps.forEach((s, i) => {
    const to = s.kind === "send" ? (s.contactName || s.recipient)
      : s.kind === "bridge" ? `${s.tokenOutSymbol || s.asset} on ${CHAIN[s.destinationChainKey] || s.destinationChainKey}`
      : s.kind === "swap" ? s.tokenOutSymbol : "staking";
    const amount = s.amount ? `${Number(s.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })}${s.amountIsEstimate ? " (est.)" : ""}` : "?";
    const receive = s.ticket?.estimatedReceive ? c.dim(`  ≈ ${s.ticket.estimatedReceive}${s.ticket.platform ? " via " + s.ticket.platform : ""}`) : "";
    console.log(`   ${i + 1}. ${s.kind.padEnd(6)} ${amount} ${s.asset} → ${to}${receive}`);
  });
  if (j.message) console.log(c.dim("  “" + j.message + "”"));
}
console.log("");
