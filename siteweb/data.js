/* generated from siteweb/index.html by build-data.mjs, then edited by hand: predictions and payments/agents sections replaced by control and networks */
window.SITE = {
 "defi": {
  "eyebrow": "03 / DeFi",
  "title": "Swap, bridge, and stake by asking. Still one button to confirm.",
  "lead": "Lyra prepares real DeFi transactions across Plasma, Ethereum, Base, Polygon, Arc, and Hyperliquid. It reads the live rate, route, and risk first, lays it all out as one plan, and only signs once you confirm with your fingerprint. Several steps in one sentence still means one plan and one confirmation.",
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
    "check": "Withdraw anytime, same one-touch confirmation"
   },
   {
    "title": "Several steps at once",
    "tag": "one sentence, one plan",
    "text": "Say \"swap then stake\" or \"bridge and swap\" and Lyra chains the steps into one plan, shows each one, and asks for a single confirmation to run them. It checks every step first: if one can't run, nothing is sent.",
    "check": "You still see every step before it runs"
   },
   {
    "title": "Bring funds back",
    "tag": "consolidate",
    "text": "Sent funds to a chain Lyra doesn't actively use? Ask it to consolidate and it routes them back to your main balance.",
    "check": "Same plan, same one-touch confirmation"
   },
   {
    "title": "Ask before you act",
    "tag": "research on demand",
    "text": "Ask if a protocol looks risky or what a rate means. Lyra checks the contract on the explorer and answers from live data, or says it can't find a reliable answer.",
    "check": "It tells you when it doesn't know"
   }
  ],
  "note": "Final once confirmed. Swaps and bridges are on-chain transactions: once you confirm and they are broadcast, neither Lyra nor anyone else can undo them. Read the plan, especially the amount and the network, before you confirm."
 },
 "control": {
  "eyebrow": "04 / Control by chat",
  "title": "Run the whole wallet from the chat. Still one button to confirm.",
  "lead": "Anything you would click in the wallet, you can ask for: switch network, open your history, change the view, send to a saved contact. Lyra prepares and navigates, but nothing moves until you confirm.",
  "cards": [
   {
    "title": "Switch network",
    "tag": "6 networks",
    "text": "Say \"switch to Base\" and Lyra changes the network for you, the same as the network menu.",
    "check": "Plasma, Ethereum, Base, Polygon, Arc, Hyperliquid"
   },
   {
    "title": "Open your history",
    "tag": "sent · received · swaps · bridges · stakes",
    "text": "Ask to see what you sent, received, swapped, bridged, or staked, and Lyra opens that list.",
    "check": "Same list as the History menu"
   },
   {
    "title": "Change the view",
    "tag": "2D or 3D",
    "text": "Say \"switch to 3D\" or \"switch to 2D\" and the interface follows, with the setting updated for you.",
    "check": "You can still change it in Settings"
   },
   {
    "title": "Send to a name",
    "tag": "contacts",
    "text": "Save a contact, then say \"send 10 USDC to Alice\". Lyra resolves the name, checks the address, and prepares the plan.",
    "check": "The address is checked before you confirm"
   },
   {
    "title": "Check before you sign",
    "tag": "explorer badges · scam lists",
    "text": "Paste an address or a contract and Lyra reads its explorer badges and public scam lists first, and tells you what it finds.",
    "check": "It tells you when it can't verify something"
   },
   {
    "title": "Money still needs your confirmation",
    "tag": "fingerprint to confirm",
    "text": "The chat can navigate, explain, and prepare. Anything that moves funds still becomes a plan that only you can confirm.",
    "check": "Lyra can't sign on its own"
   }
  ],
  "note": "Lyra answers questions about your wallet, Web3, crypto, and blockchains, and nothing else. Moving funds always goes through a plan you confirm with your fingerprint."
 },
 "networks": {
  "eyebrow": "05 / Networks",
  "title": "Six networks, one wallet. Switch by asking.",
  "lead": "Lyra works on six networks today. Each one keeps its own balance and history, and you can move between them in a sentence. What you can do depends on what each network offers.",
  "cards": [
   {
    "title": "Plasma",
    "tag": "native coin XPL",
    "text": "A purpose-built L1 for stablecoins: near-instant, low-fee USD₮ transfers with full EVM compatibility. Lyra's home network.",
    "check": "Send · swap · bridge · stake"
   },
   {
    "title": "Ethereum",
    "tag": "native coin ETH",
    "text": "The original smart-contract blockchain, the most decentralized and battle-tested, home to most of DeFi.",
    "check": "Send · swap · bridge · stake"
   },
   {
    "title": "Base",
    "tag": "native coin ETH",
    "text": "Coinbase's Ethereum L2: fast, low-cost transactions secured by Ethereum itself.",
    "check": "Send · swap · bridge · stake"
   },
   {
    "title": "Polygon",
    "tag": "native coin POL",
    "text": "A fast, low-cost Ethereum sidechain.",
    "check": "Send · swap · bridge"
   },
   {
    "title": "Arc",
    "tag": "gas paid in USDC",
    "text": "Circle's stablecoin-native L1: USDC itself pays the gas, sub-second finality, built for payments and tokenized assets. Swaps and bridges run through Circle's own kits.",
    "check": "Send · swap USDC/EURC · bridge · stake"
   },
   {
    "title": "Hyperliquid",
    "tag": "native coin HYPE",
    "text": "Hyperliquid's own EVM (HyperEVM), home to its perps and spot order books, with HYPE itself paying gas.",
    "check": "Send · swap · bridge"
   }
  ],
  "note": "More networks will follow as they are verified. Staking is offered where Aave runs."
 },
 "thinks": {
  "eyebrow": "06 / How it thinks",
  "title": "It doesn't answer from memory. It goes and checks.",
  "lead": "Every plan Lyra shows you comes from the same three-step loop | no cached rates, no assumed contract addresses, nothing invented to fill a gap.",
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
    "text": "You get a plan you can read step by step : rate, fees, risk. Nothing is signed or sent until you confirm it yourself."
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
    "title": "Hardware wallets",
    "text": "Plug in a Ledger (Nano S Plus, Nano X, Stax, Flex) over USB from Chrome: the key never leaves the device, and a whole plan is approved once, on the Ledger itself. Trezor support is on the way.",
    "check": "Ledger compatible"
   },
   {
    "title": "It never signs itself",
    "text": "Every action, including withdrawing from staking, waits for your confirmation."
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
    "text": "With the 2-of-2 key protection you can set a daily limit in USD: above it, Lyra's backend refuses to release its half of the key. You can also require a biometric re-check above an amount you choose.",
    "check": "Enforced before anything is signed"
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
  "note": "Every transaction shown on this page is real, across Plasma, Ethereum, Base, Polygon, Arc, and Hyperliquid. Automation reduces the number of steps, not the responsibility. Always read the plan before you confirm."
 },
 "faq": {
  "groups": [
   {
    "id": "basics",
    "label": "The basics",
    "items": [
     {
      "q": "What exactly is Lyra?",
      "a": "Lyra is an ICW (an Intelligent Conversational Wallet), non-custodial, live on Plasma, Ethereum, Base, Polygon, Arc, and Hyperliquid. Instead of clicking through a protocol's own interface, you describe what you want in plain language, and Lyra researches the rate, the fees, and the risk before preparing a transaction for you to approve. You can also ask it questions about Web3 and control the whole wallet from the chat."
     },
     {
      "q": "How is this different from just using Uniswap, Aave, or LI.FI directly?",
      "a": "Nothing about those protocols changes. Lyra sits in front of them. Instead of opening each site, checking a rate, approving a token, and setting parameters yourself, you say what you want once and Lyra assembles the same transaction as a single plan you review and confirm."
     },
     {
      "q": "Do I need to know anything about DeFi to use it?",
      "a": "No. You can ask in ordinary sentences | \"swap 200 XPL for USDT0\" or \"what's the safest way to earn yield on USDT0 right now\" | and Lyra translates that into a real, verified transaction. Every plan still shows the underlying numbers, so you can learn as you go if you want to."
     },
     {
      "q": "Can I ask Lyra questions without making a transaction?",
      "a": "Yes. Lyra uses the same research loop as live web search and on-chain checks to answer questions like whether a contract looks risky, without preparing anything to sign. It only answers about your wallet, Web3, crypto, and blockchains."
     },
     {
      "q": "Can I control the whole wallet from the chat?",
      "a": "Most of it, yes. You can switch network, open your history, change between the 2D and 3D view, send to a saved contact, and prepare swaps, bridges, and staking. Anything that moves funds still becomes a plan that only you can confirm."
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
      "q": "Can I use a hardware wallet like Ledger or Trezor?",
      "a": "Yes with Ledger: Nano S Plus, Nano X, Stax and Flex connect over USB from Chrome on a computer. Your key never leaves the Ledger, every transaction is approved on the device, and a plan of several steps is approved once. Trezor support is on the way. On phones, hardware wallets aren't supported yet."
     },
     {
      "q": "Is Lyra custodial? Does it ever hold my funds?",
      "a": "No. Lyra is fully non-custodial. Your funds and your key stay on your device at all times Lyra's job is research and preparation, not holding anything."
     },
     {
      "q": "Can Lyra sign or send a transaction on its own?",
      "a": "No. Every single action, including withdrawing from a staking position, waits for you to confirm it yourself. There's no setting that lets Lyra skip that step."
     },
     {
      "q": "How do I confirm a transaction, exactly?",
      "a": "With your fingerprint or your face (Touch ID, Windows Hello, or your phone's biometrics). It's the one gesture used for every transaction in Lyra, on purpose: you read the plan, then confirm it yourself, whether you're sending, swapping, bridging, or staking. On a device without biometrics, you press and hold the confirm button instead, which is just as hard to do by accident."
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
      "a": "Lyra only proposes addresses it can confirm are the protocol's own verified, published contracts. If it can't verify one with confidence, it tells you that directly rather than guessing and preparing a plan anyway."
     },
     {
      "q": "What is the optional 2-of-2 key protection?",
      "a": "When you create your wallet you can turn on 2-of-2 protection (marked Recommended). Your private key is split into two halves: one stays encrypted on your device and the other is kept by Lyra's backend, and neither half can sign a transaction alone. It's an early-access feature, unlocking needs the backend to be reachable, and it is not a multisig."
     },
     {
      "q": "What are spending limits?",
      "a": "With the 2-of-2 key protection you can set a daily limit in USD: above it, Lyra's backend refuses to release its half of the key, so nothing can be signed. Every transaction is also confirmed with your fingerprint or face, so a signature always needs you in person."
     },
     {
      "q": "Can I set up a shared wallet with several owners?",
      "a": "Yes. Lyra can set up a multisig with Safe, with up to five owners and an approval threshold such as 2 of 3, on the networks Safe supports. Nothing is sent until enough owners approve."
     },
     {
      "q": "Is there a record of what Lyra did?",
      "a": "Yes. The audit trail is a local log of what was sent, swapped, bridged, or staked, including anything that was blocked."
     }
    ]
   },
   {
    "id": "actions",
    "label": "Swap, bridge, stake",
    "items": [
     {
      "q": "Which protocols does Lyra actually use?",
      "a": "Five, today: KyberSwap for swaps, LI.FI for bridging (the same routing engine behind Jumper), Aave for staking (V3, and V4 on Arc), Circle for swaps and bridges on Arc, and Safe for multisig. They are verified, live contracts, not simulated, across Plasma, Ethereum, Base, Polygon, Arc, and Hyperliquid, wherever each one is available."
     },
     {
      "q": "Are the rates Lyra shows me actually live?",
      "a": "Yes. Every rate, fee, and yield figure is fetched at the moment you ask, never from a cache or from memory. If Lyra can't get a reliable live number, it tells you that instead of estimating."
     },
     {
      "q": "Can I ask for more than one action at once, like swap then stake?",
      "a": "Yes. You can ask for something like \"swap 1,200 XPL to USDT0 and stake it,\" and Lyra will prepare both steps as one plan, in order, that you confirm once. It checks every step before signing anything: if one can't run, nothing is sent."
     },
     {
      "q": "Can I withdraw from staking whenever I want?",
      "a": "Yes, staking through Aave on Lyra has no lock. You can withdraw at any time, using the same one-touch confirmation as every other action."
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
      "a": "Downloading and using Lyra is free. Lyra charges a 0.25% fee on swaps, bridges, staking deposits, and sends. It is shown on the plan before you confirm: it is taken out of the amount for swaps, bridges, and staking, and added on top for sends. The chain's own network fee is separate, and Lyra shows that plainly too."
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
