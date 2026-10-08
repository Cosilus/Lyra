import { parseRich } from "./terms.js";
/* Content of the story: what is typed, answered and shown. Pure data. */

export const NET = [
  ["Plasma", "plasma"], ["Ethereum", "ethereum"], ["Base", "base"],
  ["Polygon", "polygon"], ["Arc", "arc"], ["Hyperliquid", "hyperliquid"],
];

/* One entry per chat chapter. */
export const CH = [
  {
    title: "What it is",
    q: "What is Lyra?",
    steps: ["Reading the docs"],
    a: "An [[Intelligent Conversational Wallet|icw]] (ICW). Say what you want to do and I research the real rate, route and risk first, then show you the plan. One touch of your fingerprint confirms it.",
    nets: true,
  },
  {
    title: "Swap in one touch",
    q: "[[Swap|swap]] 1,200 XPL to USDT0.",
    steps: ["Live rate · KyberSwap"],
    a: "Best route found. Here's the plan: confirm it with your fingerprint.",
    plan: {
      steps: [{ kind: "swap", label: "Swap · KyberSwap", from: "1,200 XPL", to: "≈ 96 USDT0" }],
      details: [["Rate", "1 XPL ≈ 0.08 USDT0"], ["Risk level", "Low", "low"]],
    },
    note: "Example numbers. The app reads them live.",
  },
  {
    title: "And much more",
    q: "What else can you do?",
    steps: [],
    a: "A lot more: [[DeFi interactions|defi]] like bridge, stake, etc., ask questions about [[Web3|web3]], [[control the entire wallet with the chat|control]], and more.",
    chips: ["DeFi", "Web3 questions", "Wallet control"],
  },
  {
    title: "Several steps at once",
    q: "[[Stake|stake]] 100,000 USDC and [[bridge|bridge]] $40 USDT0 to Base.",
    steps: ["Reading your balance", "Live rate · Aave", "Best route · LI.FI"],
    a: "Two steps, one plan, one confirmation. If a step can't run, nothing is sent.",
    plan: {
      steps: [
        { kind: "stake", label: "Stake · Aave", from: "100,000 USDC", to: "≈ 4.2% APY" },
        { kind: "bridge", label: "Bridge · LI.FI", from: "40 USDT0", to: "Base" },
      ],
      details: [["Lyra fee (0.25%)", "250 USDC"], ["You'll receive on Base", "≈ 39.7 USDT0"], ["Risk level", "Low", "low"]],
    },
    note: "Example numbers. The app reads them live.",
  },
  {
    title: "Ask about Web3",
    q: "Is it safe to stake on Aave?",
    steps: ["Reading Aave's docs", "Checking the audits"],
    a: "Aave is audited and widely used, but no protocol is risk-free. A bug or a market shock can still cost you, so start with an amount you can afford to lose.",
  },
  {
    title: "Hire an agent",
    q: "[[Hire|a2a]] an agent to show me around the site.",
    steps: ["Reading the agent card · A2A", "Sending the task"],
    a: "Found one. Here's the task: confirm to hire it.",
    plan: {
      steps: [{ kind: "agent", label: "Hire · A2A", from: "List the site's tabs", to: "Lyra Guide" }],
      details: [["Cost", "Free", "low"]],
    },
    note: "Alpha: the built-in agent is a demo. No money moves.",
    after: "Done. Here are the tabs I found. Tap one and I'll walk you through it.",
  },
];

/* Resolve the [[term|key]] marks: c.q / c.a / c.after become plain text, with matching *Spans. */
for (const c of CH) {
  for (const [field, spansField] of [["q", "qSpans"], ["a", "aSpans"], ["after", "afterSpans"]]) {
    if (c[field] == null) continue;
    const { text, spans } = parseRich(c[field]);
    c[field] = text; c[spansField] = spans;
  }
}

/* Tabs of the interactive menu: [id, label, short description, Lyra's intro line]. */
export const MENU = [
  ["defi", "DeFi", "Swap · bridge · stake", "DeFi: swap, bridge and stake by asking. One touch confirms the whole plan."],
  ["control", "Control by chat", "Network · history · view", "Control the wallet by chat: switch network, open history, change the view."],
  ["networks", "Networks", "Six networks, one wallet", "Six networks today. Switch between them by asking."],
  ["thinks", "How it thinks", "Understand · research · propose", "I don't answer from memory. I go and check."],
  ["ask", "Ask anything", "Questions, not just clicks", "Ask me anything, not just what to click."],
  ["security", "Security", "Your key stays yours", "I can propose anything and move nothing. Here's how."],
  ["faq", "FAQ", "Every question, answered", "Your questions, answered. Tap one to open it."],
  ["contact", "Contact", "Say hello", "Tell us anything: a question, feedback or a partnership."],
];

export const N = CH.length;      // chat chapters
export const TOTAL = N + 1;      // + the interactive menu
