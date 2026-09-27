/* generated from siteweb/index.html by build-data.mjs */
window.SITE = {
 "defi": {
  "eyebrow": "03 / DeFi",
  "title": "Swap, bridge, and stake by asking. Still one button to confirm.",
  "lead": "Lyra prepares real DeFi transactions across Plasma, Ethereum, Base, Polygon, Arc, and Hyperliquid. It reads the live rate, route, and risk first, puts everything on one ticket, and only signs when you hold the button. Several steps in one sentence still means one confirmation.",
  "cards": [
   {
    "title": "Swap",
    "tag": "via KyberSwap",
    "text": "Lyra finds the best route across DEX pools for your pair and reads its live rate before showing you a number. On Arc, USDC and EURC swap through Circle's own Swap Kit.",
    "check": "Rate confirmed live, never assumed"
   },
   {
    "title": "Bridge",
    "tag": "via LI.FI · Circle Bridge Kit on Arc",
    "text": "Every route is requested live from LI.FI, the engine behind Jumper, so what you see is exactly what gets signed. Bridges to and from Arc use Circle's own Bridge Kit.",
    "check": "Live quote per request, never hardcoded"
   },
   {
    "title": "Stake",
    "tag": "via Aave V3 · Aave V4 on Arc",
    "text": "Lyra checks the real market before proposing a deposit: current yield, lock status, and a plain-language risk level, not a static promise.",
    "check": "Withdraw anytime, same one-hold confirmation"
   },
   {
    "title": "Several steps at once",
    "tag": "one sentence, one ticket set",
    "text": "Say \"swap then stake\" or \"bridge and swap\" and Lyra chains the steps in order, shows each one, and asks for a single hold to run them.",
    "check": "You still see every step before it runs"
   },
   {
    "title": "Bring funds back",
    "tag": "consolidate",
    "text": "Sent funds to a chain Lyra doesn't actively use? Ask it to consolidate and it routes them back to your main balance.",
    "check": "Same ticket, same hold to confirm"
   },
   {
    "title": "Ask before you act",
    "tag": "research on demand",
    "text": "Ask if a protocol looks risky or what a rate means. Lyra checks the contract on the explorer and answers from live data, or says it can't find a reliable answer.",
    "check": "It tells you when it doesn't know"
   }
  ],
  "note": "Final once confirmed. Swaps and bridges are on-chain transactions: once you hold to confirm and they are broadcast, neither Lyra nor anyone else can undo them. Read the ticket, especially the amount and the network, before you hold the button."
 },
 "predictions": {
  "eyebrow": "04 / Predictions & bets",
  "title": "Bet on real-world outcomes in one sentence. Still one button to confirm.",
  "lead": "Ask about an event and Lyra finds the actual Polymarket market, reads the live price from its order book, and prepares the bet on Polygon as a single ticket. You see the price and the possible payout before anything is signed.",
  "cards": [
   {
    "title": "Find the market",
    "tag": "via Polymarket",
    "text": "Describe the event in your own words. Lyra searches Polymarket for the real, open market that matches it, and says so if nothing does instead of guessing.",
    "check": "Only open markets, never invented ones"
   },
   {
    "title": "Live price",
    "tag": "order book",
    "text": "The price comes from Polymarket's live order book for the exact outcome you picked, and the ticket shows what you would get if it resolves your way.",
    "check": "Price read fresh for every bet"
   },
   {
    "title": "One ticket, one hold",
    "tag": "on Polygon",
    "text": "The bet is a signed order on Polygon, prepared and shown as one ticket. Lyra can also bring in the funds it needs, like bridging or swapping into the right token.",
    "check": "Nothing is signed until you hold"
   },
   {
    "title": "Cash out early",
    "tag": "before it resolves",
    "text": "Changed your mind? Ask to cash out a position and Lyra prepares the sale at the current price, no waiting for the market to close.",
    "check": "Same confirmation as any other action"
   },
   {
    "title": "Cancel an open order",
    "tag": "unfilled orders",
    "text": "An order that hasn't been filled yet can be cancelled by asking. Lyra prepares the cancellation and waits for your hold.",
    "check": "Cancellation also waits for your hold"
   },
   {
    "title": "Risk stays visible",
    "tag": "no hidden leverage",
    "text": "A bet is a stake you can lose entirely. The ticket states the amount at risk and the payout, and Lyra never places a bet without an amount from you.",
    "check": "It asks for an amount instead of guessing one"
   }
  ],
  "note": "You can lose your whole stake. Prediction markets are risky and may not be available in every country. Only bet what you can afford to lose, and check that Polymarket is allowed where you live before you use it."
 },
 "payments": {
  "eyebrow": "05 / Agents & payments",
  "title": "Your agent can find, pay, hire, and shop. Still one button to confirm.",
  "lead": "Lyra speaks the open standards AI agents use to transact with the web and with each other: pay an API over HTTP, search a directory of paid services, hand a task to another agent, or check out without leaving the chat. Every payment shows its price first and waits for you.",
  "cards": [
   {
    "title": "x402 payments",
    "tag": "via x402 · HTTP 402",
    "text": "When a paid API answers \"402 Payment Required\", Lyra reads the price, shows you a ticket, and signs a USDC authorization once you hold the button. If the network is short of USDC, it can bridge funds in first, under the same confirmation.",
    "check": "Capped by a spending limit you set"
   },
   {
    "title": "Find services",
    "tag": "via Circle's service directory",
    "text": "Ask for what you need, like \"a service for crypto prices\". Lyra searches Circle's public directory of paid x402 services, keeps the simple ones it can pay straight from a chat, and lists a few cheap options with their prices.",
    "check": "You see the price and confirm first"
   },
   {
    "title": "Nanopayments",
    "tag": "via Circle Gateway",
    "text": "Deposit USDC once, then every payment is just a free signature: no gas, down to fractions of a cent, settled in batches by Circle. It works on Arc, Polygon, Base, and Ethereum, and a deposit on Arc is credited in about a second.",
    "check": "Used automatically when your balance covers the price"
   },
   {
    "title": "A2A: hire other agents",
    "tag": "via the Agent2Agent protocol",
    "text": "Alpha for now: the built-in agent returns simulated notes. Lyra can hand a task to another specialized agent: it reads that agent's public card, sends the task, and brings the answer back into the chat. No money moves.",
    "check": "Designed for any agent that publishes an A2A card"
   },
   {
    "title": "ACP: checkout in the chat",
    "tag": "via the Agentic Commerce Protocol",
    "text": "Alpha for now: the merchant is a demo, with no real order behind it. Buy without leaving the conversation: say what you want, Lyra builds a checkout with line items and a total, and one hold pays it over x402.",
    "check": "Same spending limit as every x402 payment"
   }
  ],
  "note": "What's real and what's a demo. x402 payments and Nanopayments work with real third-party services. The A2A agent and the ACP merchant are demos we built to show the flow, with nothing real behind them. A payment is final once it settles: Lyra can't reverse it, so keep your spending limit low and pay services you trust."
 },
 "thinks": {
  "eyebrow": "06 / How it thinks",
  "title": "It doesn't answer from memory. It goes and checks.",
  "lead": "Every ticket Lyra shows you comes from the same three-step loop | no cached rates, no assumed contract addresses, nothing invented to fill a gap.",
  "cards": [
   {
    "title": "Understand",
    "tag": "01",
    "text": "Lyra reads what you're asking, in plain language, and can piece it together across several messages if you didn't give every detail at once."
   },
   {
    "title": "Research",
    "tag": "02",
    "text": "It searches the web and checks the contract directly on-chain : live, every time, never from memory. If it can't find a reliable answer, it says so."
   },
   {
    "title": "Propose",
    "tag": "03",
    "text": "You get a ticket you can read line by line : rate, fees, risk. Nothing is signed or sent until you hold the button yourself."
   }
  ]
 },
 "ask": {
  "title": "Ask it anything, not just what to click",
  "lead": "Lyra is also who you ask before you act. It's the same research loop : real search, real contract checks. Turned toward your questions instead of a transaction."
 },
 "security": {
  "title": "An agent that can propose anything and move nothing.",
  "lead": "Automation and custody are two different problems. Lyra solves the first, your device still solves the second.",
  "cards": [
   {
    "title": "Your key stays yours",
    "text": "Encrypted locally on your device. Lyra never has access to it, unlocked or not."
   },
   {
    "title": "It never signs itself",
    "text": "Every action, including withdrawing from staking, waits for you to hold the button."
   },
   {
    "title": "Locks itself automatically",
    "text": "10 minutes of inactivity and Lyra locks, no setting to remember to turn on."
   },
   {
    "title": "Verified contracts only",
    "text": "If an address isn't confirmed, Lyra says so instead of guessing and signing anyway."
   },
   {
    "title": "Optional 2-of-2 key split",
    "text": "Turn it on when you create your wallet: your key is split in two halves, one on your device and one held by Lyra's backend. Neither half can sign alone. Early access."
   },
   {
    "title": "Spending limits",
    "text": "A cap you set on x402 payments and checkouts, enforced before anything is signed, plus an optional biometric re-check above an amount you choose."
   },
   {
    "title": "Multisig with Safe",
    "text": "Set up a shared wallet with up to five owners and an approval threshold, like 2 of 3. Nothing moves until enough owners approve."
   },
   {
    "title": "An audit trail",
    "text": "A local log of what was sent, paid, and delegated, including what got blocked, so you can always see what happened."
   }
  ],
  "note": "Every transaction shown on this page is real, across Plasma, Ethereum, Base, Polygon, Arc, and Hyperliquid. Automation reduces the number of steps, not the responsibility. Always read a ticket before you hold the button."
 },
 "faq": {
  "groups": [
   {
    "id": "basics",
    "label": "The basics",
    "items": [
     {
      "q": "What exactly is Lyra?",
      "a": "Lyra is an ICW (an Intelligent Conversational Wallet), non-custodial, live on Plasma, Ethereum, Base, Polygon, Arc, and Hyperliquid. Instead of clicking through a protocol's own interface, you describe what you want in plain language, and Lyra researches the rate, the fees, and the risk before preparing a transaction for you to approve. It can also pay for services over x402, hand tasks to other agents, and check out in the chat."
     },
     {
      "q": "How is this different from just using Uniswap, Aave, or LI.FI directly?",
      "a": "Nothing about those protocols changes. Lyra sits in front of them. Instead of opening each site, checking a rate, approving a token, and setting parameters yourself, you say what you want once and Lyra assembles the same transaction as a single ticket you review and confirm."
     },
     {
      "q": "Do I need to know anything about DeFi to use it?",
      "a": "No. You can ask in ordinary sentences | \"swap 200 XPL for USDT0\" or \"what's the safest way to earn yield on USDT0 right now\" | and Lyra translates that into a real, verified transaction. Every ticket still shows the underlying numbers, so you can learn as you go if you want to."
     },
     {
      "q": "Can I ask Lyra questions without making a transaction?",
      "a": "Yes. Lyra uses the same research loop as live web search and on-chain checks to answer questions like whether a contract looks risky, without preparing anything to sign."
     },
     {
      "q": "Can I receive funds from any chain, or only the network I'm on?",
      "a": "Your Receive screen shows one universal address and QR code that works for any token on any EVM-compatible chain, not just whichever network you're actively viewing. Send from Plasma, Ethereum, Base, Polygon, Arc, Hyperliquid, or elsewhere, it all lands on the same address; if it arrives on a chain Lyra doesn't actively support yet, ask Lyra to consolidate it and it will route it back to your main balance."
     }
    ]
   },
   {
    "id": "security",
    "label": "Security & custody",
    "items": [
     {
      "q": "Does Lyra ever have access to my private key?",
      "a": "No, never. Your key is encrypted and stored locally on your device. Lyra can propose transactions, but it has no path to your key, unlocked or not."
     },
     {
      "q": "Is Lyra custodial? Does it ever hold my funds?",
      "a": "No. Lyra is fully non-custodial. Your funds and your key stay on your device at all times Lyra's job is research and preparation, not holding anything."
     },
     {
      "q": "Can Lyra sign or send a transaction on its own?",
      "a": "No. Every single action, including withdrawing from a staking position, waits for you to hold the confirm button yourself. There's no setting that lets Lyra skip that step."
     },
     {
      "q": "What is the \"hold to confirm\" button, exactly?",
      "a": "It's the one control used for every transaction in Lyra, on purpose. Reading the ticket and then deliberately holding a button for a moment is harder to do by accident than a single tap, so it's the same gesture whether you're sending, swapping, bridging, or staking."
     },
     {
      "q": "What happens if I walk away with Lyra unlocked?",
      "a": "Lyra locks itself automatically after 10 minutes of inactivity. It isn't a setting you have to remember to turn on, it's on by default for every account."
     },
     {
      "q": "Does Lyra could be the victim of a scam ?",
      "a": "Unfortunalty, there is nerver zero risk. However, Lyra is equipped with a system to protect against phishing, poisoning and draining attacks, detecting and minimizing them by warning the user with a messagebefore any transaction."
     },
     {
      "q": "How does Lyra avoid sending me to a fake or malicious contract?",
      "a": "Lyra only proposes addresses it can confirm are the protocol's own verified, published contracts. If it can't verify one with confidence, it tells you that directly rather than guessing and preparing a ticket anyway."
     },
     {
      "q": "What is the optional 2-of-2 key protection?",
      "a": "When you create your wallet you can turn on 2-of-2 protection (marked Recommended). Your private key is split into two halves: one stays encrypted on your device and the other is kept by Lyra's backend, and neither half can sign a transaction alone. It's an early-access feature, unlocking needs the backend to be reachable, and it is not a multisig."
     },
     {
      "q": "What are spending limits?",
      "a": "In Settings you set a spending limit for x402 payments and checkouts. Anything above it is blocked before it's ever signed. You can also require a biometric confirmation above an amount you choose, on top of the hold-to-confirm."
     },
     {
      "q": "Can I set up a shared wallet with several owners?",
      "a": "Yes. Lyra can set up a multisig with Safe, with up to five owners and an approval threshold such as 2 of 3, on the networks Safe supports. Nothing is sent until enough owners approve."
     },
     {
      "q": "Is there a record of what Lyra did?",
      "a": "Yes. The audit trail is a local log of what was sent, swapped, bridged, staked, bet, paid, or delegated, including anything that was blocked."
     }
    ]
   },
   {
    "id": "actions",
    "label": "Swap, bridge, stake",
    "items": [
     {
      "q": "Which protocols does Lyra actually use?",
      "a": "Nine, today: KyberSwap for swaps, LI.FI for bridging (the same routing engine behind Jumper), Aave for staking (V3, and V4 on Arc), Polymarket for prediction markets, Circle for Arc swaps and bridges and for Nanopayments, Safe for multisig, and the open x402, A2A, and ACP standards for agent payments, service search, and checkout. The DeFi ones are verified, live contracts, not simulated, across Plasma, Ethereum, Base, Polygon, Arc, and Hyperliquid. The A2A agent and the ACP merchant Lyra ships with are demos."
     },
     {
      "q": "Are the rates Lyra shows me actually live?",
      "a": "Yes. Every rate, fee, and yield figure is fetched at the moment you ask, never from a cache or from memory. If Lyra can't get a reliable live number, it tells you that instead of estimating."
     },
     {
      "q": "Can I ask for more than one action at once, like swap then stake?",
      "a": "Yes. You can ask for something like \"swap 1,200 XPL to USDT0 and stake it,\" and Lyra will prepare each step as its own ticket, in order, you still confirm each one individually."
     },
     {
      "q": "Can I withdraw from staking whenever I want?",
      "a": "Yes, staking through Aave on Lyra has no lock. You can withdraw at any time, using the same one-hold confirmation as every other action."
     }
    ]
   },
   {
    "id": "agents",
    "label": "Agents & payments",
    "items": [
     {
      "q": "What is x402?",
      "a": "x402 is an open standard for paying over the web. A service answers a request with \"402 Payment Required\" and a price, Lyra shows you that price as a ticket, and when you hold the button it signs a USDC payment and retries. No card, no account, no invoice."
     },
     {
      "q": "How do I pay for a service with Lyra?",
      "a": "Tell Lyra to pay for a service and give it the link of the paid API or resource. Lyra checks the price, shows a ticket, and you hold to confirm. Right after, it explains in plain language what you got. Payments are capped by the spending limit you set in Settings."
     },
     {
      "q": "How does Lyra find services to pay for?",
      "a": "Say what you need, for example \"find me a service for crypto prices\". Lyra searches Circle's public directory of paid x402 services, keeps the simple ones it can pay straight from a chat (no login, no extra input needed), and lists a few cheap options with their price and link. Then \"use number 1\" prepares the payment. That directory comes from third parties, so you always see the price and confirm first."
     },
     {
      "q": "What are Nanopayments?",
      "a": "Circle Gateway lets you deposit USDC once and then pay with free signatures: no gas per payment, and prices down to a millionth of a dollar, because Circle settles thousands of payments together in batches. Lyra uses your Nanopayments balance automatically when it covers the price. Ask Lyra to deposit USDC into your nanopayments balance to fund it, and ask for your nanopayments balance to check it."
     },
     {
      "q": "Do Nanopayments only work on Arc?",
      "a": "No. Lyra supports Nanopayments on Arc, Polygon, Base, and Ethereum. The difference is speed: a deposit on Arc is credited in about a second and on Polygon in a few seconds, while Base and Ethereum take around 15 minutes. Each service also decides which networks it accepts, so your balance has to be on one of them. Plasma isn't supported by Circle Gateway."
     },
     {
      "q": "Do I need gas to pay with x402?",
      "a": "The payment itself is a signature, so no gas and no ETH. If the payment network is short of USDC, Lyra can bridge funds in automatically, but only when one other network holds enough, and that bridge needs a little of that network's own coin for its fee. A Nanopayments deposit is one normal on-chain transaction, and every payment after it is free."
     },
     {
      "q": "What is A2A?",
      "a": "A2A (Agent2Agent) is an open protocol for agents to talk to each other. Lyra can hand a task to another specialized agent: it reads that agent's public card, sends the task, and shows you the answer in the chat. No money moves."
     },
     {
      "q": "What is ACP?",
      "a": "ACP (Agentic Commerce Protocol) is checkout in the conversation. You say what you want to buy, Lyra builds a cart with line items and a total, and one hold pays it over x402, under your spending limit."
     },
     {
      "q": "Are A2A and ACP real, or demos?",
      "a": "The protocol flows are real, but the agent and the merchant Lyra ships with today are demos we built: the agent returns simulated notes and the merchant doesn't ship anything. x402 payments and Nanopayments, on the other hand, work with real third-party services."
     },
     {
      "q": "What if a paid service takes my payment and gives nothing?",
      "a": "A payment is final once it settles: Lyra can't reverse it and there is no built-in refund, you would need to ask that service. That's why Lyra shows the price first, why the spending limit exists, and why it's best to keep the limit low and pay only services you trust."
     },
     {
      "q": "Can Lyra book a restaurant or buy real things for me?",
      "a": "Not yet. Real booking and shopping services usually need an account on the platform behind them, which a chat-only flow can't create. Lyra includes a fictional demo restaurant that shows how paying for a reservation over x402 would work, with no real table and no real money movement."
     },
     {
      "q": "Will I understand what I paid for, and what to do when something fails?",
      "a": "Yes. After a paid request, Lyra explains what came back in plain language instead of showing raw data. If something fails, it tells you the likely cause and one concrete next step in the same message."
     }
    ]
   },
   {
    "id": "predictions",
    "label": "Predictions",
    "items": [
     {
      "q": "What are \"Predictions\" in Lyra?",
      "a": "Predictions let you bet on the outcome of a real-world event, an election, a sports match, whether a price crosses some level, through Polymarket, the largest prediction-market exchange. Ask Lyra in plain language, e.g. \"bet $20 the Fed cuts rates in December,\" and it finds the exact market, reads the live price, and prepares the order for you to confirm."
     },
     {
      "q": "Which network do Predictions run on?",
      "a": "Polygon, Polymarket's home network. If you place a bet while active on a different network, Lyra still routes the order correctly, your position lives on Polygon regardless of which chain you're viewing in the app."
     },
     {
      "q": "Can I get out of a bet before the market resolves?",
      "a": "Yes. While a market is still live, open your position from the Predictions tab and cash out, Lyra sells your shares back into Polymarket's order book at the current price as a market order, same one-hold confirmation as everything else. An unfilled limit order can be cancelled the same way."
     },
     {
      "q": "Why can't I withdraw or claim my winnings after a Polymarket market resolves?",
      "a": "Nothing is stuck, claiming a resolved market's winnings just isn't wired into Lyra yet, only cashing out a still-live position is. Once a market you bet on has resolved, go to polymarket.com, connect the same wallet, and redeem the position there, that's the same on-chain wallet Lyra uses, so your winnings land right back in your Polygon balance and Lyra picks them up from there. This only applies to positions Polymarket has actually settled; if a market is still open, use Cash Out inside Lyra instead."
     },
     {
      "q": "Are the odds Lyra shows me the real, live ones?",
      "a": "Yes, fetched from Polymarket's live order book right when you ask, not cached. Every bet executes as a market order against that same book, so the price you confirm can move slightly between the quote and the fill, exactly like it would placing the order directly on polymarket.com."
     }
    ]
   },
   {
    "id": "practical",
    "label": "Access & practical",
    "items": [
     {
      "q": "Which networks and platforms are supported right now?",
      "a": "Six networks today: Plasma (Lyra's home network), Ethereum, Base, Polygon, Arc (Circle's stablecoin network), and Hyperliquid (HyperEVM), with more to follow as new ones get verified. It's available today on Chrome and Mac OS, with other platforms to follow."
     },
     {
      "q": "Does Lyra cost anything to use?",
      "a": "Downloading and using Lyra is free. The only cost on any transaction is the underlying network fee the chain itself charges. Lyra shows that fee plainly on the ticket and doesn't add a markup on top."
     },
     {
      "q": "Do I need to create an account to use Lyra?",
      "a": "No separate account or sign-up. Once you've set up your wallet on your device, Lyra works directly with it."
     }
    ]
   }
  ]
 }
};
