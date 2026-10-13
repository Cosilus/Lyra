# Chrome Web Store / Edge Add-ons — listing for "Lyra Wallet" (mainnet)

Everything to copy into the developer dashboard. English, because the store listing is read by reviewers.
This is a NEW item, separate from "Lyra Wallet (Testnet)": in the dashboard, click "New item" and upload `lyra-extension-mainnet-<version>.zip`.

## Store listing tab

**Name** (max 75): `Lyra Wallet`

**Summary** (max 132): `The crypto wallet you talk to. Send, swap, bridge and stake in plain words, every step checked before you confirm.`

**Category**: Tools  (alternative: Productivity)

**Language**: English

**Description**:

```
Lyra is an Intelligent Conversational Wallet: say what you want to do, in your own words or by voice, and Lyra checks the rate, the route and the risk, then prepares a plan for you to confirm.

WHAT YOU CAN DO
• Send, receive and track your assets on Plasma, Ethereum, Base, Polygon, Arc and Hyperliquid.
• Swap (KyberSwap, Circle), bridge (Circle CCTP and others) and stake (Aave) by asking: "swap 10 USDT to XPL and send 5 to Alice".
• Several actions in one sentence become one plan: every step shown with its real amounts, simulated before you confirm, then sent as a single transaction when the network allows it (all or nothing).
• Ask questions about your wallet, Web3 and crypto: "Is this contract safe?", "What does this rate mean?"
• Connect to websites (dApps): every signature they ask for is explained in plain words, and dangerous ones are blocked.
• Use a Ledger hardware wallet: a whole plan is approved once on the device.
• Choose a classic 2D view or an immersive 3D view.

HOW IT KEEPS YOU IN CONTROL
• Non-custodial: your private key is encrypted with your password and stays on your device.
• Nothing moves without you: every transaction or plan is shown first, then confirmed with a hold-to-confirm button (and your fingerprint above the amount you choose).
• Addresses and contracts are checked against explorer data and public scam lists before you send.
• Optional MPC protection: your key split in two halves, with a daily spending limit.

GOOD TO KNOW
• Lyra charges a 0.25% fee on swaps, bridges, staking deposits and sends, shown on the plan before you confirm. Network fees are extra.
• Lyra cannot recover a lost password or recovery phrase: write your recovery phrase down and keep it safe.
• Not financial advice.

Privacy policy: https://lyrapp.to/privacy-wallet.html
```

**Icon** (128 × 128): `public/icons/icon-128.png` (dark background, pearly white star).

**Screenshots** (1280 × 800, PNG or JPEG, 1 to 5; show the wallet in a browser window, with real-looking but small amounts):
1. A request in Ask Lyra and the plan card ("3 steps, one confirmation") with "Hold to confirm".
2. The 3D plan animation (the steps arriving among the stars).
3. The 3D view with a side menu open (Send, Receive, Swap, Bridge, Stake).
4. A website asking to sign, with Lyra's plain-words explanation.
5. The network switcher showing Plasma, Ethereum, Base, Polygon, Arc and Hyperliquid.

**Small promo tile** (440 × 280, optional but recommended): the star icon, centered on the dark background, with the name "Lyra" next to it.

## Privacy practices tab

**Single purpose** (one sentence):
`Lyra Wallet is a non-custodial crypto wallet, used through a chat, that lets you hold, send, swap, bridge and stake digital assets and connect to websites.`

**Permission justifications**

| Permission | Justification to paste |
|---|---|
| `sidePanel` | The wallet interface opens in the browser's side panel when the user clicks the toolbar icon. It stays open while the user browses. |
| `activeTab` | When the user clicks the toolbar icon, the wallet can be shown as a floating card over the current page. Nothing is added to a page before that click. |
| `scripting` | Used together with activeTab, only after the user clicks the icon, to insert the floating wallet card into the current tab. |
| `storage` | Keeps the user's encrypted wallet, contacts and settings on the device. |
| Content scripts on `https://*/*` | Provides the standard wallet connection (EIP-1193 / EIP-6963) that websites use to ask the user to connect. A site gets the user's address only after the user approves, and every signature request is shown to the user first. The scripts do not read or change page content. |
| Host permissions (backend `https://lyra-mainnet.onrender.com`) | The wallet's own backend: it understands the user's chat requests, checks addresses against scam lists, simulates plans, and reads prices and history. |
| Host permissions (`rpc.plasma.to`, `ethereum-rpc.publicnode.com`, `mainnet.base.org`, `polygon.drpc.org`, `rpc.mainnet.arc.io`, `rpc.hyperliquid.xyz`) | Public blockchain RPC nodes of the six supported networks, used to read balances and broadcast the transactions the user signs. |
| Host permissions (`arb1.arbitrum.io`, `mainnet.optimism.io`, `bsc-dataseed.binance.org`, `api.avax.network`) | Read balances on these networks when the user asks to gather funds from them. |
| Host permissions (`aggregator-api.kyberswap.com`) | Swap routes and prices for the swaps the user asks for. |
| Host permissions (`*.circle.com`) | Circle's Swap Kit, Bridge Kit and CCTP, used to swap and bridge USDC/EURC. |
| Host permissions (`clob.polymarket.com`) | Prediction market orders, only when the user places one. |
| Host permissions (`api.safe.global`) | Optional shared (multisig) wallets through Safe. |
| Host permissions (`api.coingecko.com`) | The native coin's price, only when the wallet's backend can't be reached. |

**Remote code**: No. All the extension's code is in the package; it does not load or run remote code.

**Data usage** — what to declare (check the wording in the dashboard when you fill it; it may change):
- The extension handles: the text the user types or dictates to the assistant (**personal communications / user content**) and the user's public wallet address, balances and transactions (**financial and payment information**). They are sent to the developer's backend and to an AI provider to answer the request. With MPC protection turned on, one half of the user's key (useless on its own) is stored by the backend: declare it under **authentication information** if the dashboard asks.
- It does **not** collect: name, email or other personally identifiable information, health, location, web history or website content. The password and the full private key stay on the device.
- Certify all three statements: the data is **not sold** to third parties, **not used or transferred** for purposes unrelated to the item's single purpose, and **not used** to determine creditworthiness or for lending.

**Privacy policy URL**: `https://lyrapp.to/privacy-wallet.html`

## Distribution tab
- Visibility: **Unlisted** at first (only people with the link can install), then **Public** once it works for testers.
- Regions: all, or the regions you want to serve (check local rules on crypto wallets).

## Before you click "Submit for review"
1. `npm run store` produced `lyra-extension-mainnet-<version>.zip` and the checks passed.
2. You tested `dist` in `chrome://extensions` (Load unpacked) with a small amount: create a wallet, chat, send, a two-step plan.
3. `https://lyrapp.to/privacy-wallet.html` opens.
4. The support email `contact@lyrapp.to` receives mail (the store may write to it).
5. The backend `https://lyra-mainnet.onrender.com` answers.

## Updating later
Raise `version` in `public/manifest.json` (and `package.json`), run `npm run store`, upload the new zip. Reviews of updates are usually faster than the first one.
