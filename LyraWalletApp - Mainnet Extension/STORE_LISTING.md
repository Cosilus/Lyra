# Chrome Web Store / Edge Add-ons — listing for "Lyra Wallet (Testnet)"

Everything to copy into the developer dashboard. English, because the store listing is read by reviewers.

## Store listing tab

**Name** (max 75): `Lyra Wallet (Testnet)`

**Summary** (max 132): `Lyra, the wallet you talk to. Swap, bridge and send in plain words. Testnet build: test coins only, no real funds.`

**Category**: Tools  (alternative: Productivity)

**Language**: English

**Description**:

```
Lyra is an Intelligent Conversational Wallet: say what you want to do, and Lyra checks the rate, the route and the risk before preparing a transaction for you to confirm. This is the TESTNET build: it works on test networks only, with coins that have no value.

WHAT YOU CAN DO
• Send, receive and track tokens on six test networks: Plasma Testnet, Ethereum Sepolia, Base Sepolia, Polygon Amoy, Arc Testnet and Hyperliquid Testnet.
• Bridge USDC and EURC between those networks (Circle Bridge Kit) and swap USDC/EURC on Arc Testnet.
• Ask questions about your wallet, Web3, crypto and blockchains: "Is this contract safe?", "What does this rate mean?"
• Control the wallet by chat: switch network, open your history, change the view, send to a saved contact.
• Choose a classic 2D view or an immersive 3D view that reacts to your mouse.

HOW IT KEEPS YOU IN CONTROL
• Non-custodial: your private key is encrypted with your password and never leaves your device.
• Nothing moves without you: every transaction becomes a ticket you read, then confirm with a hold-to-confirm button.
• Addresses are checked against explorer badges and public scam lists before you send.

IMPORTANT
• Test networks only. Do not import a recovery phrase or key that holds real funds.
• Lyra charges a 0.25% fee on swaps, bridges, staking deposits and sends, shown on the ticket before you confirm (paid in test coins on this build).
• Not financial advice.

Privacy policy: https://lyrapp.to/privacy-extension.html
```

**Icon** (128 × 128): `public/icons/icon-128.png` (dark background, pearly white star).

**Screenshots** (1280 × 800, PNG or JPEG, 1 to 5; show the side panel inside a browser window):
1. The chat answering a request and showing a ticket with "Hold to Confirm".
2. The 3D view with the right-hand menu open (Send, Receive, Swap, Bridge, Stake) and its glow.
3. The assets menu (top) with the token logos.
4. The 2D view with the menu row open.
5. The network switcher showing the six testnets.

**Small promo tile** (440 × 280, optional but recommended): the star icon, centered on the dark background, with the name "Lyra" next to it.

## Privacy practices tab

**Single purpose** (one sentence):
`Lyra Wallet is a non-custodial crypto wallet, used through a chat, that lets you hold, send, bridge and swap test tokens on test blockchain networks.`

**Permission justifications**

| Permission | Justification to paste |
|---|---|
| `sidePanel` | The wallet interface opens in the browser's side panel when the user clicks the toolbar icon. It stays open while the user browses. |
| Host permissions (backend `https://lyra-backend-testnet.onrender.com`) | The wallet's own backend: it understands the user's chat requests, checks addresses against scam lists, and reads prices and history. |
| Host permissions (`testnet-rpc.plasma.to`, `ethereum-sepolia-rpc.publicnode.com`, `sepolia.base.org`, `polygon-amoy-bor-rpc.publicnode.com`, `rpc.testnet.arc.network`, `rpc.hyperliquid-testnet.xyz`) | Public blockchain RPC nodes of the six supported test networks, used to read balances and broadcast the transactions the user signs. |
| Host permissions (`*.circle.com`) | Circle's Bridge Kit and Swap Kit, used to bridge and swap USDC/EURC on test networks. |
| Host permissions (`api.safe.global`) | Optional shared (multisig) wallets through Safe. |

**Remote code**: No. All the extension's code is in the package; it does not load or run remote code.

**Data usage** — what to declare (check the wording in the dashboard when you fill it; it may change):
- The extension handles: the text the user types to the assistant (**personal communications / user content**) and the user's public wallet address and balance (**financial / payment info**, because a wallet address and balance relate to the user's funds). They are sent to the developer's backend and to an AI provider to answer the request.
- It does **not** collect: personally identifiable information such as name or email, health, location, web history, website content, or authentication information (the password and the private key stay on the device).
- Certify all three statements: the data is **not sold** to third parties, **not used or transferred** for purposes unrelated to the item's single purpose, and **not used** to determine creditworthiness or for lending.

**Privacy policy URL**: `https://lyrapp.to/privacy-extension.html` (publish `siteweb/privacy-extension.html` first: push to `main`, then open the URL to check it).

## Distribution tab
- Visibility: **Unlisted** at first (only people with the link can install), then **Public** once it works for testers.
- Regions: all, or the regions you want to serve (check local rules on crypto wallets).

## Before you click "Submit for review"
1. `npm run store` produced `lyra-extension-testnet-0.1.0.zip` and the checks passed.
2. You tested `dist` in `chrome://extensions` (Load unpacked): create a wallet, chat, send a test transaction.
3. The privacy policy URL opens.
4. The support email `contact@lyrapp.to` receives mail (the store may write to it).

## Updating later
Raise `version` in `public/manifest.json` (and `package.json`), run `npm run store`, upload the new zip. Reviews of updates are usually faster than the first one.
