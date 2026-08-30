import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { ACTIVE_NETWORK, TOKENS, DEFI_CONTRACTS, WXPL, UNISWAP_V3_FEE_TIERS, UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_QUOTER_ABI } from "../src/config.js";
import { getBalance, getAddress } from "./tools/walletTools.js";
import { isDefiFeatureEnabled, getDefiFeatureInfo } from "./tools/defiProtocols.js";

dotenv.config();

// Active chain for the wallet, server-side. Mainnet = 9745, Testnet = 9746.
// Must stay consistent with ACTIVE_NETWORK in src/config.js.
const ACTIVE_CHAIN_ID = 9745;

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
// The exact available model name changes regularly — check the
// up-to-date list at https://docs.claude.com before shipping to
// production, et override via la variable d'env ANTHROPIC_MODEL si besoin.

// Read-only provider — never signs anything, only reads on-chain data
// to give the AI real numbers instead of guessed ones.
const SERVER_RPC = new ethers.JsonRpcProvider(ACTIVE_NETWORK.rpcUrl, ACTIVE_NETWORK.chainId);

const AAVE_RESERVE_DATA_ABI = [
  "function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)"
];

const app = express();
// Render (and most hosts) assign the port dynamically via process.env.PORT
// — the server must listen on it, 3001 stays only as the local dev default.
const PORT = process.env.PORT || 3001;

// CORS_ORIGIN can be a comma-separated list of allowed frontend origins
// (e.g. "https://lyra-wallet.vercel.app,https://lyra.app"). Left unset,
// every origin is allowed — convenient for local dev, fine to tighten
// once the frontend's production URL is known.
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors(
  allowedOrigins.length
    ? { origin: allowedOrigins }
    : {}
));
app.use(express.json());

// Health check — lets Render (or any uptime monitor) confirm the
// service is alive without hitting a real API route.
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Plasma AI Wallet backend" });
});

const SYSTEM_PROMPT = `
You are Plasma AI, the intelligent assistant built into a Plasma Mainnet wallet.

You communicate naturally with the user in English.

Your role is to understand the user's requests and control the wallet
interface through intents.

Respond like a human assistant, fluently and concisely.
Never repeat technical values with unnecessary precision.

For crypto amounts:
- Round small amounts intelligently.
- Use at most 6 decimals unless more precision is genuinely needed.
- Answer the question directly.
- Don't respond with just a raw number.

Example:

Question:
"Do I have enough XPL for fees?"

Bad answer:
"Your current balance is 0.001607999999706 XPL."

Good answer:
"Yes, you currently have about 0.001608 XPL. That should be enough to cover network fees."

SECURITY RULES:

- You never know the seed phrase.
- You never know the private key.
- You never ask for the private key.
- You never ask for the seed phrase to send a transaction.
- You never ask for the wallet password in chat.
- You never sign a transaction.
- You never claim to have sent a transaction.
- The user must always confirm a transaction in the interface.
- The frontend is responsible for signing and sending.
- You must never make up an address.
- You must never make up an amount.
- You must never make up an XPL price.
- You must never make up a USD → XPL conversion.

AVAILABLE ACTIONS:

GET_BALANCE
GET_ADDRESS
RECEIVE_XPL
SEND_XPL
REFRESH_BALANCE
OPEN_WALLET
CANCEL
GET_HISTORY
GET_TRANSACTIONS
SWAP_XPL
BRIDGE_XPL
STAKE_XPL
UNSTAKE_XPL
MULTI_ACTION
ASK_CRYPTO
CHAT
OPEN_CONTACTS
OPEN_TRANSACTION_HISTORY
OPEN_SETTINGS
SWITCH_NETWORK
REVEAL_PRIVATE_KEY

---

## GET_BALANCE

If the user asks for their balance:

intent = "GET_BALANCE"

---

## GET_ADDRESS

If the user asks to know or be told their address as plain text, without
mentioning a QR code or scanning:

"what's my address"
"give me my address"
"what's my wallet address"

intent = "GET_ADDRESS"

Response:

{
  "intent": "GET_ADDRESS",
  "amount": null,
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "message": "",
  "requires_confirmation": false
}

Leave "message" empty — the frontend fills in the actual address itself.

---

## RECEIVE_XPL

If the user wants to receive funds and expects something visual to
share or scan a QR code, or a way for someone else to send them
money:

"qrcode"
"show my qrcode"
"show me my QR code"
"I want to receive XPL"
"how do people send me money"
"generate a QR code for my wallet"
"receive funds"

use:

intent = "RECEIVE_XPL"

IMPORTANT:
Any mention of "QR", "QR code", "scan", or "receive" → always
RECEIVE_XPL, never GET_ADDRESS. GET_ADDRESS is ONLY for a plain-text
request for the address, with no QR/receiving context at all.

Response:

{
  "intent": "RECEIVE_XPL",
  "amount": null,
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "message": "",
  "requires_confirmation": false
}

Leave "message" empty — the frontend generates and displays the QR
code itself.

## SEND_XPL

To send XPL, you need to identify:

1. The amount
2. The amount's unit: XPL or USD
3. The recipient's address

This information can be given across several messages.

The user may provide the amount and address in the same message
or across multiple messages.

Information already present in the history must be reused.

CONTACTS

The user can use the name of a saved contact instead of their address.

Example:

"Send 3000 XPL to dad"

If the context contains:

dad: 0x40b1...

then use:

recipient = "0x40b1..."

Don't ask for the address.

If the contact doesn't exist:

"I don't know dad's address yet. Which address would you like to use?"

Never invent an address yourself.

CONTACT NAME

If the user asks to send to a name like:

"Send 3000 XPL to dad"

and "dad" doesn't exist in contacts:

- contactName = "dad"
- recipient = null

Example:

{
  "intent": "SEND_XPL",
  "amount": "3000",
  "amountUSD": null,
  "recipient": null,
  "contactName": "dad",
  "asset": "XPL",
  "message": "Which address would you like to use for dad?",
  "requires_confirmation": false
}

If the address is then provided in the next message and the history
shows the requested contact was "dad", then:

{
  "intent": "SEND_XPL",
  "amount": "3000",
  "amountUSD": null,
  "recipient": "0x...",
  "contactName": "dad",
  "asset": "XPL",
  "message": "I'm ready to prepare the transfer.",
  "requires_confirmation": true
}

---

## AMOUNT UNITS

The amount can be expressed in:

- XPL
- USD
- dollars
- dollar
- $
- $

ABSOLUTE RULE:

If the amount is accompanied by "$", "USD", "dollar" or "dollars",
the amount is ALWAYS expressed in USD.

Example:

"Send $2 of XPL"

means:

amount = null
amountUSD = "2"

This does NOT mean:

amount = "2"

Other examples:

"Send $5 of XPL to 0x1234..."

→ amount = null
→ amountUSD = "5"

"Send $10 of XPL to 0x1234..."

→ amount = null
→ amountUSD = "10"

"Send 10 dollars of XPL to 0x1234..."

→ amount = null
→ amountUSD = "10"

"Send 10 USD of XPL to 0x1234..."

→ amount = null
→ amountUSD = "10"

If the user explicitly states XPL:

"Send 2 XPL to 0x1234..."

→ amount = "2"
→ amountUSD = null

"Send 0.001 XPL to 0x1234..."

→ amount = "0.001"
→ amountUSD = null

IMPORTANT:

NEVER convert USD → XPL yourself.

The backend will perform the conversion using the real XPL price.

You must only correctly identify the amount and its unit.

---

## EXAMPLE — AMOUNT IN XPL

User:

"I want to send 0.001 XPL"

Response:

{
  "intent": "SEND_XPL",
  "amount": "0.001",
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "message": "Which address would you like to send the 0.001 XPL to?",
  "requires_confirmation": false
}

---

## EXAMPLE — AMOUNT IN USD

User:

"I want to send $2 of XPL"

Response:

{
  "intent": "SEND_XPL",
  "amount": null,
  "amountUSD": "2",
  "recipient": null,
  "asset": "XPL",
  "message": "Which address would you like to send $2 of XPL to?",
  "requires_confirmation": false
}

---

## EXAMPLE — XPL + ADDRESS

User:

"Send 0.001 XPL to 0x1234..."

Response:

{
  "intent": "SEND_XPL",
  "amount": "0.001",
  "amountUSD": null,
  "recipient": "0x1234...",
  "asset": "XPL",
  "message": "I'm ready to prepare the transfer of 0.001 XPL to this address. Check the details, then hold the button to confirm.",
  "requires_confirmation": true
}

---

## EXAMPLE — USD + ADDRESS

User:

"Send $2 of XPL to 0x1234..."

Response:

{
  "intent": "SEND_XPL",
  "amount": null,
  "amountUSD": "2",
  "recipient": "0x1234...",
  "asset": "XPL",
  "message": "I'll convert $2 into XPL at the current rate before preparing the transaction.",
  "requires_confirmation": false
}

IMPORTANT:

Even if the recipient is present, a request expressed in USD
cannot be confirmed yet.

Why?

Because the exact XPL amount must first be calculated by the backend.

So:

USD + recipient
→ requires_confirmation = false

XPL + recipient
→ requires_confirmation = true

---

## MISSING INFORMATION

If the amount is missing:

ask for the amount.

If the recipient is missing:

ask for the address.

If the amount is in USD:

don't ask the user to convert it to XPL themselves.

The backend will handle that conversion.

Never make up an address yourself.

Never complete a partially provided address.

---

## EXAMPLE — MISSING AMOUNT

User:

"Send XPL to 0x1234..."

Response:

{
  "intent": "SEND_XPL",
  "amount": null,
  "amountUSD": null,
  "recipient": "0x1234...",
  "asset": "XPL",
  "message": "How much would you like to send?",
  "requires_confirmation": false
}

---

## EXAMPLE — MISSING RECIPIENT

User:

"Send 0.5 XPL"

Response:

{
  "intent": "SEND_XPL",
  "amount": "0.5",
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "message": "Which address would you like to send the 0.5 XPL to?",
  "requires_confirmation": false
}

---

## EXAMPLE — USD WITHOUT RECIPIENT

User:

"Send $5 of XPL"

Response:

{
  "intent": "SEND_XPL",
  "amount": null,
  "amountUSD": "5",
  "recipient": null,
  "asset": "XPL",
  "message": "Which address would you like to send $5 of XPL to?",
  "requires_confirmation": false
}

---

## USING THE HISTORY

Information for a transaction can be given across several messages.

Example:

User:
"I want to send $2 of XPL"

Assistant:
{
  "intent": "SEND_XPL",
  "amount": null,
  "amountUSD": "2",
  "recipient": null,
  "asset": "XPL",
  "message": "Which address would you like to send $2 of XPL to?",
  "requires_confirmation": false
}

User:
"0x1234..."

You must then reuse the USD amount present in the history.

Response:

{
  "intent": "SEND_XPL",
  "amount": null,
  "amountUSD": "2",
  "recipient": "0x1234...",
  "asset": "XPL",
  "message": "I'll convert $2 into XPL at the current rate before preparing the transaction.",
  "requires_confirmation": false
}

---

## CONFIRMATION RULE

For a transaction expressed directly in XPL:

requires_confirmation = true ONLY IF:

- amount is present
- recipient is present

For a transaction expressed in USD:

requires_confirmation = false

until the backend has converted the USD amount into XPL.

Never set requires_confirmation = true for a USD amount
before the backend has performed the conversion.

---

## CANCEL

If the user says:

"cancel"
"never mind"
"forget it"
"stop"

use:

intent = "CANCEL"

Response:

{
  "intent": "CANCEL",
  "amount": null,
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "message": "Okay, transaction cancelled.",
  "requires_confirmation": false
}

---

## ASK_CRYPTO

If the user asks an open-ended question that requires real research
or analysis, rather than a simple wallet action. Examples:

- "Is putting my USDT in [protocol] risky?"
- "What's the risk of this contract: 0x..."
- "Is my wallet eligible for [airdrop/whitelist/program]?"
- "Explain Aave staking to me"
- "What's the price of Bitcoin"
- Any general question about crypto, DeFi, a protocol, a token, or an
  address/contract to analyze.

use:

intent = "ASK_CRYPTO"

IMPORTANT:
- Do NOT answer the question yourself in "message" — leave the
  field empty ("").
- The backend will forward the question to a second agent (with
  access to real web search and to the PlasmaScan explorer) that will
  produce the real answer with real data. You, here, only route the
  question — never answer it from memory.
- Never make up a risk level, a yield, or info about a protocol or
  contract in "message" for this intent.

Example:

User:
"Is protocol XYZ safe to put my USDT in?"

Response:

{
  "intent": "ASK_CRYPTO",
  "amount": null,
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "message": "",
  "requires_confirmation": false
}

---

## CHAT

For all normal conversation:

intent = "CHAT"

---

## GET_TRANSACTIONS

If the user asks:

"show me my transactions"
"my history"
"my latest transactions"
"what have I sent"
"what have I received"
"my latest payments"
"my latest transfers"

use:

intent = "GET_TRANSACTIONS"

Don't ask the user for an address if their wallet is connected.

ABSOLUTE RULE:

If the user asks for their history or transactions:

- always return intent = "GET_TRANSACTIONS"
- give NO transaction details in "message"
- never make up an amount
- never make up an address
- never make up a date
- never make up a hash
- never claim to have direct access to the transactions
- the frontend will fetch the transactions via /api/transactions/{walletAddress}

Example:

User:

"show me my transactions"

Response:

{
  "intent": "GET_TRANSACTIONS",
  "amount": null,
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "message": "",
  "requires_confirmation": false
}


IMPORTANT:
- If the user uses the name of a saved contact, automatically use its address.
- Don't ask for the address if it already exists in contacts.
- If the name doesn't exist, ask for the address.
- Never guess an address.
---

## OPEN_CONTACTS

If the user asks to see, open, or manage their saved contacts:

"show me my contacts"
"open my contacts"
"who do I have saved"

use:

intent = "OPEN_CONTACTS"

Response:

{
  "intent": "OPEN_CONTACTS",
  "amount": null,
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "message": "Here are your saved contacts.",
  "requires_confirmation": false
}

---

## OPEN_TRANSACTION_HISTORY

If the user wants to be taken to the transaction history SCREEN
(as opposed to GET_TRANSACTIONS, which summarizes recent transactions
directly in the chat):

"show me my transaction history"
"show me my txn"
"open my history"
"take me to my transactions page"

Use OPEN_TRANSACTION_HISTORY when the user's phrasing implies
navigating to a screen/page ("show me", "open", "take me to").
Use GET_TRANSACTIONS when they just want a quick recap in the chat
("what have I sent", "my latest transfers").

intent = "OPEN_TRANSACTION_HISTORY"

Response:

{
  "intent": "OPEN_TRANSACTION_HISTORY",
  "amount": null,
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "message": "Here's your transaction history.",
  "requires_confirmation": false
}

---

## OPEN_SETTINGS

If the user asks to see or open settings:

"open settings"
"show me my settings"
"where are the wallet settings"

intent = "OPEN_SETTINGS"

Response:

{
  "intent": "OPEN_SETTINGS",
  "amount": null,
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "message": "Here are your settings.",
  "requires_confirmation": false
}

---

## SWITCH_NETWORK

If the user asks to change network:

"switch to Ethereum"
"change network to Solana"
"use the Plasma network"

use:

intent = "SWITCH_NETWORK"

Add a "network" field with the requested network in lowercase
("plasma", "ethereum", "solana", etc.) — never guess or assume a
network the user didn't name.

IMPORTANT:
Only Plasma Mainnet is actually live in the app today. You must
still return the intent honestly reflecting what the user asked for
— the frontend is responsible for telling the user if the requested
network isn't available yet. Never claim in "message" that the
switch succeeded for a network other than Plasma.

Response:

{
  "intent": "SWITCH_NETWORK",
  "amount": null,
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "network": "ethereum",
  "message": "",
  "requires_confirmation": false
}

---

## REVEAL_PRIVATE_KEY

If the user asks for their private key, seed phrase, recovery
phrase, or mnemonic:

"give me my private key"
"show me my seed phrase"
"what's my recovery phrase"

use:

intent = "REVEAL_PRIVATE_KEY"

ABSOLUTE RULE:
- NEVER produce, guess, or repeat any private key, seed phrase, or
  part of one in "message" or anywhere else. You never know it and
  never will.
- Leave "message" empty ("") — the frontend handles this entirely on
  its own, with a password re-confirmation and an explicit warning,
  before revealing anything. You only route the request.

Response:

{
  "intent": "REVEAL_PRIVATE_KEY",
  "amount": null,
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "message": "",
  "requires_confirmation": false
}

---

## SWAP_XPL / BRIDGE_XPL / STAKE_XPL / UNSTAKE_XPL

If the user asks for a swap, a token exchange, a bridge to another
chain, to put funds into staking, or to withdraw them from staking:

use the matching intent:

- "exchange", "swap", "convert my XPL to USDT" → SWAP_XPL
- "bridge", "send to another chain", "move out to Ethereum" → BRIDGE_XPL
- "stake", "staking", "deposit on Aave", "grow my funds" → STAKE_XPL
- "get my funds back", "unstake", "withdraw from staking", "exit Aave" → UNSTAKE_XPL

IMPORTANT:

- For asset, use the ERC-20 token involved in the operation — XPL,
  USDT, USDC, or EURC are the tokens currently available on Plasma
  (or "XPL" for a native XPL swap, now supported: it's automatically
  wrapped into WXPL behind the scenes). Native XPL still isn't
  supported for staking or bridging, only for sending (SEND_XPL) and
  swapping. If the user asks to stake or bridge native XPL, leave
  amount and asset as requested — the backend and the second agent
  will explain if it's not possible.
- The backend always forwards these intents to a second agent
  (Claude, with real web search) that prepares a detailed ticket —
  you only route the request, you never execute it or make up a
  rate, yield, or address.
- The final ticket is NEVER executed automatically — it always waits
  for explicit user confirmation (the "Hold to Confirm" button),
  including for UNSTAKE_XPL.
- requires_confirmation always stays false for these four intents
  (confirmation happens at the ticket level, not in the JSON).

Example:

User:
"I want to deposit 100 USDT into staking"

Response:

{
  "intent": "STAKE_XPL",
  "amount": "100",
  "amountUSD": null,
  "recipient": null,
  "asset": "USDT",
  "message": "",
  "requires_confirmation": false
}

---

## MULTI_ACTION

If the user asks for MORE THAN ONE action in the same message — a
chain of steps, not just one. Examples:

- "Swap 100 XPL to USDT and stake it"
- "Send 10 XPL to Paul, then swap 50 XPL to USDT"
- "Bridge 20 USDT to Ethereum and then stake what's left in XPL"

use:

intent = "MULTI_ACTION"

Return a "steps" array instead of a single amount/recipient/asset.
Each step uses the SAME shape as a single-action response would:

{
  "kind": "send" | "swap" | "bridge" | "stake" | "unstake",
  "amount": "...",
  "asset": "...",
  "recipient": null,
  "contactName": null,
  "tokenOutSymbol": null,
  "destinationChainKey": null
}

ORDERING — THIS IS THE IMPORTANT PART:

Steps must be returned in the order they need to actually happen for
the plan to make sense, which is NOT necessarily the order the user
typed them in. Reorder them yourself using this rule:

If one step needs an asset that another step in the same request
produces (a swap's output, a bridge's output), the step that PRODUCES
that asset must come first, even if the user mentioned it second.

Example — user says it "backwards":

"Send 10 XPL and swap it to USDT first"

This only makes sense as: swap first (produces USDT), then send the
USDT. So the steps array must be:

[
  { "kind": "swap", "amount": "10", "asset": "XPL", "tokenOutSymbol": "USDT", ... },
  { "kind": "send", "amount": null, "asset": "USDT", "recipient": ..., ... }
]

Note that the send step's amount is deliberately left null when it
depends on the swap's output — the backend fills it in with the
swap's real result once that step actually runs. Never guess a
number for a step that depends on a previous one.

If steps are independent (no shared asset dependency), keep the
user's original order.

IMPORTANT:
- Leave "message" as a short, one-sentence plain-language summary of
  the whole plan, in the final order (e.g. "I'll swap 100 XPL to
  USDT, then stake it on Aave. Check the details, then hold the
  button to confirm.").
- Never invent a rate, a received amount, or a risk level yourself —
  the backend runs the same research agent used for single-action
  DeFi requests, once per step.
- requires_confirmation always stays false — confirmation happens on
  the combined ticket itself, exactly like single actions.

---

## RESPONSE FORMAT

Respond ONLY with valid JSON.

Never use Markdown.

Never put text before or after the JSON.

Required format:

{
  "intent": "GET_BALANCE | GET_ADDRESS | RECEIVE_XPL | SEND_XPL | REFRESH_BALANCE | OPEN_WALLET | CANCEL | GET_TRANSACTIONS | SWAP_XPL | BRIDGE_XPL | STAKE_XPL | UNSTAKE_XPL | MULTI_ACTION | ASK_CRYPTO | CHAT | OPEN_CONTACTS | OPEN_TRANSACTION_HISTORY | OPEN_SETTINGS | SWITCH_NETWORK | REVEAL_PRIVATE_KEY",
  "amount": null,
  "amountUSD": null,
  "recipient": null,
  "asset": "XPL",
  "network": null,
  "message": "response to show the user",
  "requires_confirmation": false,
  "suggestedContact": null,
  "steps": null
}

For MULTI_ACTION, "steps" is the array described above and "amount",
"amountUSD", "recipient", "asset" stay null on the top-level object —
each step carries its own.

## SUGGESTED CONTACT

When a user wants to send XPL to a name that doesn't exist in
contacts and then provides an address for that name, offer to save it.

Example:

User:
"Send 3000 XPL to dad"

If "dad" doesn't exist in contacts:

{
  "intent": "SEND_XPL",
  "amount": "3000",
  "amountUSD": null,
  "recipient": null,
  "contactName": "dad",
  "suggestedContact": null,
  "asset": "XPL",
  "message": "I don't know dad's address yet. Which address would you like to use?",
  "requires_confirmation": false
}

User:
"0x40b1...5c27"

If the history shows this address matches the requested contact "dad",
then:

{
  "intent": "SEND_XPL",
  "amount": "3000",
  "amountUSD": null,
  "recipient": "0x40b1...5c27",
  "contactName": "dad",
  "suggestedContact": {
    "name": "dad",
    "address": "0x40b1...5c27"
  },
  "asset": "XPL",
  "message": "I'm ready to prepare the transfer of 3000 XPL to this address.",
  "requires_confirmation": true
}

IMPORTANT:
- suggestedContact must stay null until a new address has been provided.
- Never offer to save a contact that already exists.
- Never make up an address.
- suggestedContact must only contain an address actually provided by the user.

FINAL RULES:

- amount only ever contains an amount expressed in XPL.
- amountUSD only ever contains an amount expressed in USD.
- If "$", "USD", "dollar" or "dollars" is used → amountUSD.
- If "XPL" is used → amount.
- Never fill in amount and amountUSD at the same time.
- Never convert USD → XPL yourself.
- Never guess a price.
- Never guess an address.
- Never guess an amount.
- The USD → XPL conversion is performed by the backend.
- Signing and sending are performed only by the frontend.
- requires_confirmation = true only when an XPL transaction has
  both amount and recipient.
- For a USD transaction, requires_confirmation = false until
  the backend has performed the conversion.
`;

async function executeTool(tool, walletAddress) {
  switch (tool) {
    case "get_balance":
      if (!walletAddress) {
        throw new Error("No wallet connected.");
      }

      return await getBalance(walletAddress);

    case "get_address":
      return getAddress(walletAddress);

    default:
      throw new Error(`Tool inconnu : ${tool}`);
  }
}

// Finds the Uniswap V3 pool for a pair and returns the actual quoted
// exchange rate right now — read-only, no signing involved.
async function getRealSwapQuote(assetInSymbol, assetOutSymbol, amount) {
  const isNativeIn = assetInSymbol === "XPL";
  const isNativeOut = assetOutSymbol === "XPL";
  const tokenIn = isNativeIn ? WXPL : TOKENS[assetInSymbol];
  const tokenOut = isNativeOut ? WXPL : TOKENS[assetOutSymbol];

  if (!tokenIn?.address || !tokenOut?.address) {
    return { found: false, reason: `${assetInSymbol}/${assetOutSymbol} pair not configured.` };
  }

  const factory = new ethers.Contract(DEFI_CONTRACTS.uniswapV3.factory, UNISWAP_V3_FACTORY_ABI, SERVER_RPC);
  let pool = null, fee = null;

  for (const feeTier of UNISWAP_V3_FEE_TIERS) {
    const found = await factory.getPool(tokenIn.address, tokenOut.address, feeTier);
    if (found && found !== ethers.ZeroAddress) { pool = found; fee = feeTier; break; }
  }

  if (!pool) {
    return { found: false, reason: `No Uniswap V3 pool found for ${assetInSymbol}/${assetOutSymbol} on Plasma.` };
  }

  const amountIn = ethers.parseUnits(String(amount || "1"), tokenIn.decimals);
  const quoter = new ethers.Contract(DEFI_CONTRACTS.uniswapV3.quoter, UNISWAP_V3_QUOTER_ABI, SERVER_RPC);

  try {
    const result = await quoter.quoteExactInputSingle.staticCall({
      tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, fee,
      sqrtPriceLimitX96: 0n
    });
    const amountOut = Number(ethers.formatUnits(result[0], tokenOut.decimals));
    const rate = amountOut / Number(amount || 1);

    return {
      found: true,
      pool,
      feeTier: fee,
      rate: `1 ${assetInSymbol} = ${rate.toFixed(6)} ${assetOutSymbol}`,
      estimatedReceive: `${amountOut.toFixed(6)} ${assetOutSymbol}`
    };
  } catch (e) {
    return { found: false, reason: "Quote call reverted — pool may have insufficient liquidity." };
  }
}

// Reuses the exact same LI.FI proxy logic already used by
// /api/bridge/quote, so the AI sees the same real quote the frontend
// would eventually execute.
async function getRealBridgeQuote(fromTokenSymbol, toChainKey, amount, fromAddress) {
  const token = TOKENS[fromTokenSymbol];
  if (!token?.address) {
    return { found: false, reason: `${fromTokenSymbol} not configured on Plasma.` };
  }

  try {
    const amountWei = ethers.parseUnits(String(amount || "1"), token.decimals).toString();
    const url = new URL("https://li.quest/v1/quote");
    url.searchParams.set("fromChain", String(ACTIVE_NETWORK.chainId));
    url.searchParams.set("toChain", toChainKey);
    url.searchParams.set("fromToken", token.address);
    url.searchParams.set("toToken", token.address);
    url.searchParams.set("fromAmount", amountWei);
    // Placeholder address is fine for a quote-only lookup (no tx built for real yet).
    url.searchParams.set("fromAddress", fromAddress || "0x0000000000000000000000000000000000000001");

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.estimate) {
      return { found: false, reason: data?.message || "LI.FI couldn't quote this route." };
    }

    const received = Number(ethers.formatUnits(data.estimate.toAmount, token.decimals));
    return {
      found: true,
      route: data.toolDetails?.name || "LI.FI route",
      estimatedReceive: `${received.toFixed(6)} ${fromTokenSymbol}`,
      fees: data.estimate.feeCosts?.map(f => f.name).join(", ") || "included in route",
    };
  } catch (e) {
    console.error("Bridge quote lookup error:", e);
    return { found: false, reason: "Couldn't reach LI.FI for a live quote." };
  }
}

// Reads Aave's current on-chain liquidity rate for an asset and
// converts it to an approximate APY (simple, non-compounded — stated
// as such so the ticket never overclaims precision).
async function getRealAaveAPY(assetSymbol) {
  const token = TOKENS[assetSymbol];
  if (!token?.address) {
    return { found: false, reason: `${assetSymbol} not configured on Plasma.` };
  }

  try {
    const dataProvider = new ethers.Contract(
      DEFI_CONTRACTS.aave.protocolDataProvider,
      AAVE_RESERVE_DATA_ABI,
      SERVER_RPC
    );
    const data = await dataProvider.getReserveData(token.address);
    const liquidityRateRay = data[5]; // liquidityRate, in ray (1e27)
    const apr = Number(liquidityRateRay) / 1e27 * 100;

    return {
      found: true,
      apy: `~${apr.toFixed(2)}% APR (simple rate, not compounded)`,
      lock: false // Aave V3 supply has no lock-up period
    };
  } catch (e) {
    console.error("Aave reserve data error:", e);
    return { found: false, reason: "Couldn't read Aave's current rate on-chain." };
  }
}

const GEMINI_SWAP_QUOTE_TOOL = {
  type: "function",
  function: {
    name: "get_swap_quote",
    description: "Gets the REAL current exchange rate from the Uniswap V3 pool on Plasma for a token pair. Always call this for a SWAP ticket instead of guessing a rate.",
    parameters: {
      type: "object",
      properties: {
        assetIn: { type: "string" },
        assetOut: { type: "string" },
        amount: { type: "string" }
      },
      required: ["assetIn", "assetOut", "amount"]
    }
  }
};

const GEMINI_BRIDGE_QUOTE_TOOL = {
  type: "function",
  function: {
    name: "get_bridge_quote",
    description: "Gets the REAL current bridge quote from LI.FI for moving a token from Plasma to another chain. Always call this for a BRIDGE ticket instead of guessing fees or a route.",
    parameters: {
      type: "object",
      properties: {
        asset: { type: "string" },
        destinationChainKey: { type: "string", description: "Lowercase LI.FI chain key, e.g. 'eth', 'bas', 'arb'" },
        amount: { type: "string" }
      },
      required: ["asset", "destinationChainKey", "amount"]
    }
  }
};

const GEMINI_AAVE_APY_TOOL = {
  type: "function",
  function: {
    name: "get_aave_apy",
    description: "Gets Aave's REAL current on-chain supply rate for an asset on Plasma. Always call this for a STAKE or UNSTAKE ticket instead of guessing a yield.",
    parameters: {
      type: "object",
      properties: { asset: { type: "string" } },
      required: ["asset"]
    }
  }
};


// ========================================
// TEST DIRECT DU TOOL
// ========================================

app.get("/api/transactions/:address", async (req, res) => {
  try {
    const { address } = req.params;

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        error: "Invalid wallet address."
      });
    }

    // Native XPL transfers ("normal" transactions).
    const nativeUrl = new URL("https://api.etherscan.io/v2/api");
    nativeUrl.searchParams.set("chainid", String(ACTIVE_CHAIN_ID));
    nativeUrl.searchParams.set("module", "account");
    nativeUrl.searchParams.set("action", "txlist");
    nativeUrl.searchParams.set("address", address);
    nativeUrl.searchParams.set("startblock", "0");
    nativeUrl.searchParams.set("endblock", "99999999");
    nativeUrl.searchParams.set("page", "1");
    nativeUrl.searchParams.set("offset", "20");
    nativeUrl.searchParams.set("sort", "desc");
    nativeUrl.searchParams.set("apikey", process.env.ETHERSCAN_API_KEY);

    // ERC-20 transfers (USDT deposits/withdrawals). These never show up
    // in "txlist" — normal transactions only cover native XPL moves —
    // so without this second call, any USDT sent to or from the
    // wallet is silently missing from the history.
    const tokenUrl = new URL("https://api.etherscan.io/v2/api");
    tokenUrl.searchParams.set("chainid", String(ACTIVE_CHAIN_ID));
    tokenUrl.searchParams.set("module", "account");
    tokenUrl.searchParams.set("action", "tokentx");
    tokenUrl.searchParams.set("address", address);
    tokenUrl.searchParams.set("contractaddress", TOKENS.USDT.address);
    tokenUrl.searchParams.set("startblock", "0");
    tokenUrl.searchParams.set("endblock", "99999999");
    tokenUrl.searchParams.set("page", "1");
    tokenUrl.searchParams.set("offset", "20");
    tokenUrl.searchParams.set("sort", "desc");
    tokenUrl.searchParams.set("apikey", process.env.ETHERSCAN_API_KEY);

    // Internal transactions (value moved via a contract call rather
    // than a direct EOA-to-EOA transfer — the typical shape of a
    // withdrawal from an exchange, or of a contract forwarding funds).
    // These never show up in "txlist" either, even though the balance
    // does change on-chain, so without this third call some real
    // incoming deposits stay invisible in the history.
    const internalUrl = new URL("https://api.etherscan.io/v2/api");
    internalUrl.searchParams.set("chainid", String(ACTIVE_CHAIN_ID));
    internalUrl.searchParams.set("module", "account");
    internalUrl.searchParams.set("action", "txlistinternal");
    internalUrl.searchParams.set("address", address);
    internalUrl.searchParams.set("startblock", "0");
    internalUrl.searchParams.set("endblock", "99999999");
    internalUrl.searchParams.set("page", "1");
    internalUrl.searchParams.set("offset", "20");
    internalUrl.searchParams.set("sort", "desc");
    internalUrl.searchParams.set("apikey", process.env.ETHERSCAN_API_KEY);

    const [nativeResponse, tokenResponse, internalResponse] = await Promise.all([
      fetch(nativeUrl),
      fetch(tokenUrl),
      fetch(internalUrl)
    ]);

    const nativeData = await nativeResponse.json();
    const tokenData = await tokenResponse.json();
    const internalData = await internalResponse.json();

    // "No transactions found" (status "0") is a valid empty result for
    // any of the three calls, not necessarily an error — only bail out
    // if ALL of them genuinely failed.
    const nativeOk = nativeData.status === "1" || nativeData.message === "No transactions found";
    const tokenOk = tokenData.status === "1" || tokenData.message === "No transactions found";
    const internalOk = internalData.status === "1" || internalData.message === "No transactions found";

    if (!nativeOk && !tokenOk && !internalOk) {
      return res.status(502).json({
        error: nativeData.result || nativeData.message || "Explorer error."
      });
    }

    const nativeTxs = (nativeData.status === "1" ? nativeData.result : []).map(tx => ({
      hash: tx.hash,
      type: "native",
      symbol: "XPL",
      decimals: 18,
      blockNumber: Number(tx.blockNumber),
      timestamp: Number(tx.timeStamp),
      from: tx.from,
      to: tx.to,
      valueWei: tx.value,
      valueXPL: Number(tx.value) / 1e18,
      gasUsed: tx.gasUsed,
      gasPrice: tx.gasPrice,
      success: tx.isError === "0"
    }));

    const tokenTxs = (tokenData.status === "1" ? tokenData.result : []).map(tx => ({
      hash: tx.hash,
      type: "token",
      symbol: tx.tokenSymbol || "USDT",
      decimals: Number(tx.tokenDecimal) || 6,
      blockNumber: Number(tx.blockNumber),
      timestamp: Number(tx.timeStamp),
      from: tx.from,
      to: tx.to,
      valueWei: tx.value,
      valueXPL: Number(tx.value) / (10 ** (Number(tx.tokenDecimal) || 6)),
      gasUsed: tx.gasUsed,
      gasPrice: tx.gasPrice,
      success: true
    }));

    const internalTxs = (internalData.status === "1" ? internalData.result : []).map(tx => ({
      hash: tx.hash,
      type: "internal",
      symbol: "XPL",
      decimals: 18,
      blockNumber: Number(tx.blockNumber),
      timestamp: Number(tx.timeStamp),
      from: tx.from,
      to: tx.to,
      valueWei: tx.value,
      valueXPL: Number(tx.value) / 1e18,
      gasUsed: tx.gasUsed,
      gasPrice: "0", // internal transactions don't carry their own gas price
      success: tx.isError === "0"
    }));

    const transactions = [...nativeTxs, ...tokenTxs, ...internalTxs].sort((a, b) => b.timestamp - a.timestamp);

    res.json({
      address,
      transactions
    });

  } catch (error) {
    console.error("Transaction history error:", error);

    res.status(500).json({
      error: "Couldn't fetch the transaction history."
    });
  }
});

// Simple in-memory cache of the last successful price. CoinGecko's
// public endpoint (no API key) is rate-limited by IP, and on a host
// like Render that IP is often shared — a 429 there used to mean the
// USD line in the wallet UI just silently disappeared. Serving the
// last known price (clearly marked as stale) keeps the UI populated
// instead of going blank on a transient rate limit.
let lastKnownXplPrice = null; // { priceUSD, fetchedAt }
const XPL_PRICE_STALE_AFTER_MS = 30 * 60 * 1000; // don't serve a cache older than 30min

async function fetchXplUsdPriceFromCoingecko() {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=plasma&vs_currencies=usd"
  );

  if (!response.ok) {
    throw new Error(`CoinGecko HTTP ${response.status}`);
  }

  const data = await response.json();

  const price = Number(data?.plasma?.usd);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid XPL/USD price payload from CoinGecko.");
  }

  return price;
}

async function getXplUsdPrice() {
  const price = await fetchXplUsdPriceFromCoingecko();
  lastKnownXplPrice = { priceUSD: price, fetchedAt: Date.now() };
  return price;
}

app.get("/api/price/xpl", async (req, res) => {
  try {
    const price = await getXplUsdPrice();
    res.json({ priceUSD: price, stale: false });
  } catch (error) {
    console.error("XPL price endpoint error:", error.message);

    if (lastKnownXplPrice && Date.now() - lastKnownXplPrice.fetchedAt < XPL_PRICE_STALE_AFTER_MS) {
      return res.json({ priceUSD: lastKnownXplPrice.priceUSD, stale: true });
    }

    res.status(502).json({ error: "XPL price unavailable." });
  }
});

// Proxy to the LI.FI API: we NEVER build the bridge transaction
// ourselves, we forward the request to LI.FI which returns the exact
// transaction (to, data, value) to sign. Server-side proxy to avoid
// CORS issues in the browser.
app.get("/api/bridge/quote", async (req, res) => {
  try {
    const { fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, slippage } = req.query;

    if (!fromChain || !toChain || !fromToken || !toToken || !fromAmount || !fromAddress) {
      return res.status(400).json({ error: "Missing quote parameters." });
    }

    const url = new URL("https://li.quest/v1/quote");
    url.searchParams.set("fromChain", fromChain);
    url.searchParams.set("toChain", toChain);
    url.searchParams.set("fromToken", fromToken);
    url.searchParams.set("toToken", toToken);
    url.searchParams.set("fromAmount", fromAmount);
    url.searchParams.set("fromAddress", fromAddress);
    // Default to 0.5% if the client didn't specify one explicitly.
    url.searchParams.set("slippage", slippage || "0.005");

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error("LI.FI quote error:", data);
      return res.status(502).json({ error: "LI.FI n'a pas pu fournir de devis pour ce transfert." });
    }

    res.json(data);
  } catch (error) {
    console.error("Bridge quote proxy error:", error);
    res.status(502).json({ error: "Impossible de contacter LI.FI pour le moment." });
  }
});

async function explorerLookup(address) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address || "")) {
    return { error: "Adresse invalide." };
  }

  try {
    const url = new URL("https://api.etherscan.io/v2/api");

    url.searchParams.set("chainid", String(ACTIVE_CHAIN_ID));
    url.searchParams.set("module", "contract");
    url.searchParams.set("action", "getsourcecode");
    url.searchParams.set("address", address);
    url.searchParams.set("apikey", process.env.ETHERSCAN_API_KEY);

    const response = await fetch(url);
    const data = await response.json();
    const result = data?.result?.[0];

    if (!result) {
      return { verified: false, note: "No data found for this address on the explorer." };
    }

    return {
      address,
      contractName: result.ContractName || null,
      verified: !!result.SourceCode,
      compilerVersion: result.CompilerVersion || null,
      isProxy: result.Proxy === "1"
    };
  } catch (error) {
    console.error("Explorer lookup error:", error);
    return { error: "Couldn't query the explorer right now." };
  }
}

// ========================================
// ADDRESS SAFETY CHECK (heuristic, on-chain)
// ========================================
// Runs before the frontend reveals a send form for a NEW recipient.
// This is a heuristic check, not a verdict — it looks for a couple of
// well-known red flags and reports them plainly, but it can't prove
// an address is safe, only that nothing obvious was found. It fails
// open on its own errors (Etherscan hiccup, etc.) so a check we
// couldn't complete never blocks a legitimate transaction.
async function getAddressCode(address) {
  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", String(ACTIVE_CHAIN_ID));
  url.searchParams.set("module", "proxy");
  url.searchParams.set("action", "eth_getCode");
  url.searchParams.set("address", address);
  url.searchParams.set("tag", "latest");
  url.searchParams.set("apikey", process.env.ETHERSCAN_API_KEY);

  const response = await fetch(url);
  const data = await response.json();
  return data?.result || "0x";
}

app.get("/api/address-check/:address", async (req, res) => {
  const { address } = req.params;

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "Invalid wallet address." });
  }

  try {
    const reasons = [];

    const code = await getAddressCode(address);
    const isContract = !!code && code !== "0x" && code !== "0x0";
    let verified = null;

    if (isContract) {
      const info = await explorerLookup(address);
      verified = !!info.verified;
      if (!verified) {
        reasons.push(
          "This is an unverified smart contract, not a regular wallet address — funds sent directly here could behave unexpectedly or be unrecoverable."
        );
      }
    } else {
      // Only worth checking the transaction pattern for a plain
      // wallet address — a contract's activity shape doesn't mean
      // the same thing.
      const txUrl = new URL("https://api.etherscan.io/v2/api");
      txUrl.searchParams.set("chainid", String(ACTIVE_CHAIN_ID));
      txUrl.searchParams.set("module", "account");
      txUrl.searchParams.set("action", "txlist");
      txUrl.searchParams.set("address", address);
      txUrl.searchParams.set("startblock", "0");
      txUrl.searchParams.set("endblock", "99999999");
      txUrl.searchParams.set("page", "1");
      txUrl.searchParams.set("offset", "50");
      txUrl.searchParams.set("sort", "desc");
      txUrl.searchParams.set("apikey", process.env.ETHERSCAN_API_KEY);

      const txResponse = await fetch(txUrl);
      const txData = await txResponse.json();
      const txs = txData.status === "1" ? txData.result : [];

      const outgoing = txs.filter(t => t.from?.toLowerCase() === address.toLowerCase());
      const incoming = txs.filter(t => t.to?.toLowerCase() === address.toLowerCase());
      const distinctSenders = new Set(incoming.map(t => t.from?.toLowerCase()));

      // Zero outgoing activity ever, but several small deposits from
      // different wallets — the shape of a poisoning/drainer bot
      // address rather than someone's real, used wallet.
      if (outgoing.length === 0 && incoming.length >= 3 && distinctSenders.size >= 3) {
        reasons.push(
          "This address has received transfers from several different wallets but has never sent anything out itself — a pattern sometimes seen with address-poisoning or drainer scams."
        );
      }
    }

    res.json({
      address,
      isContract,
      verified,
      suspicious: reasons.length > 0,
      reasons
    });
  } catch (error) {
    console.error("Address check error:", error);
    // Fail open: never let our own check's failure block a
    // legitimate transaction.
    res.json({ address, isContract: null, verified: null, suspicious: false, reasons: [] });
  }
});

const CRYPTO_RESEARCH_TOOLS = [
  { type: "web_search_20250305", name: "web_search" },
  {
    name: "explorer_lookup",
    description:
      "Looks up PlasmaScan (Plasma's block explorer) for a given " +
      "contract address: reports whether the contract is verified, " +
      "its name, and whether it's a proxy. Use this before making " +
      "any claim about the reliability of a contract address on Plasma.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Contract address to check (0x...)"
        }
      },
      required: ["address"]
    }
  }
];

// Schema for the DeFi ticket Claude must produce once its research is
// done. One generic schema for swap/bridge/staking — irrelevant
// fields stay null.
const PREPARE_TICKET_TOOL = {
  name: "prepare_ticket",
  description:
    "Returns the final, structured ticket for the requested DeFi " +
    "operation (swap, bridge, or staking), once research is done. " +
    "Call this tool only once, right at the end.",
  input_schema: {
    type: "object",
    properties: {
      platform: { type: "string", description: "Name of the platform used (e.g. Aave, Uniswap V3, Jumper)" },
      riskLevel: { type: "string", enum: ["low", "moderate", "high", "unknown"] },
      riskReason: { type: "string", description: "Short explanation of the risk level" },
      fees: { type: "string", description: "Estimated fees, in plain terms (e.g. '~0.3% + network fees')" },
      apy: { type: ["string", "null"], description: "Estimated annual yield, staking only" },
      lock: { type: ["boolean", "null"], description: "Whether funds are locked (staking only)" },
      rate: { type: ["string", "null"], description: "Exchange rate, swap only (e.g. '1 XPL = 0.42 USDT')" },
      estimatedReceive: { type: ["string", "null"], description: "Estimated output amount, swap only" },
      route: { type: ["string", "null"], description: "Path taken, bridge only (e.g. 'Plasma -> Ethereum via Jumper')" },
      steps: { type: ["array", "null"], items: { type: "string" }, description: "Bridge steps, if more than one" },
      tokenOutSymbol: { type: ["string", "null"], description: "SWAP only: exact symbol of the token received. XPL, USDT, USDC, and EURC are available on Plasma (XPL is auto-wrapped into WXPL)." },
      destinationChainKey: { type: ["string", "null"], description: "BRIDGE only: lowercase LI.FI destination chain key (e.g. 'eth', 'bsc', 'arb', 'pol') based on what the user asked for" },
      dataFound: { type: "boolean", description: "false if the research didn't turn up reliable data" },
      summary: { type: "string", description: "1-2 sentences summarizing the ticket for the user, in English" }
    },
    required: ["platform", "riskLevel", "riskReason", "fees", "dataFound", "summary"]
  }
};

// ========================================
// PRÉPARATION DU TICKET DEFI — CLAUDE (fournisseur principal)
// ========================================
// Même agent que answerCryptoQuestion (recherche web + explorer_lookup),
// mais forcé de conclure par l'appel à l'outil prepare_ticket plutôt
// que par du texte libre, pour que le frontend affiche un vrai ticket
// structuré. Aucun accès à la signature ou à l'envoi de transactions.
async function prepareDefiTicketWithClaude(feature, amount, asset, userMessage, walletContext) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { dataFound: false, summary: "Deep research isn't configured yet (missing ANTHROPIC_API_KEY on the server)." };
  }

  const featureLabel = { swap: "a swap", bridge: "a bridge", staking: "a staking deposit" }[feature] || feature;

  const systemPrompt = `
You are Lyra's DeFi ticket preparation module, for a Plasma mainnet wallet.
The user is asking for ${featureLabel} of ${amount || "an amount"} ${asset || "XPL"}.

Rules:
- Use web search for anything you're not sure about or that may have changed recently.
- Use explorer_lookup to verify any contract address on Plasma before making claims about it.
- NEVER make up a rate, yield, or address.
- Always state the risk level and why.
- For a SWAP: XPL, USDT, USDC, and EURC are available on Plasma today.
- For a BRIDGE: destinationChainKey must be a lowercase LI.FI chain key (e.g. "eth", "bas", "arb").
- ALWAYS finish by calling prepare_ticket, exactly once, at the very end.

Wallet context:
${walletContext}

User's original request:
"${userMessage}"
`;

  let messages = [
    { role: "user", content: `Prepare the ticket for ${featureLabel} of ${amount || "?"} ${asset || "XPL"}.` }
  ];

  const tools = [...CRYPTO_RESEARCH_TOOLS, PREPARE_TICKET_TOOL];

  for (let turn = 0; turn < 5; turn++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1200,
        system: systemPrompt,
        messages,
        tools,
        // Sur le dernier tour autorisé, on force l'appel à prepare_ticket
        // pour ne jamais repartir bredouille.
        ...(turn === 4 ? { tool_choice: { type: "tool", name: "prepare_ticket" } } : {})
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error (ticket):", errText);
      return { dataFound: false, summary: "Something went wrong while preparing the ticket. Try again in a moment." };
    }

    const data = await response.json();
    const content = data.content || [];

    const finalCall = content.find(b => b.type === "tool_use" && b.name === "prepare_ticket");
    if (finalCall) {
      return finalCall.input;
    }

    const explorerCalls = content.filter(b => b.type === "tool_use" && b.name === "explorer_lookup");

    if (data.stop_reason === "tool_use" && explorerCalls.length > 0) {
      messages.push({ role: "assistant", content });

      const toolResults = await Promise.all(
        explorerCalls.map(async (block) => ({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(await explorerLookup(block.input?.address))
        }))
      );

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Claude a répondu (ou terminé une recherche web gérée côté
    // serveur Anthropic) sans conclure — on le relance vers prepare_ticket.
    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: "Conclude now using the prepare_ticket tool." });
  }

  return { dataFound: false, summary: "The research took too many steps — try again with a more specific request." };
}

// ========================================
// PRÉPARATION DU TICKET DEFI — GEMINI (fallback uniquement)
// ========================================
// N'est appelée que si prepareDefiTicketWithClaude échoue et que
// GEMINI_API_KEY est configurée. Ne remplace jamais Claude par défaut.
const GEMINI_EXPLORER_TOOL = {
  type: "function",
  function: {
    name: "explorer_lookup",
    description:
      "Looks up PlasmaScan (Plasma's block explorer) for a given " +
      "contract address: reports whether the contract is verified, " +
      "its name, and whether it's a proxy.",
    parameters: {
      type: "object",
      properties: { address: { type: "string", description: "Contract address to check (0x...)" } },
      required: ["address"]
    }
  }
};

const GEMINI_PREPARE_TICKET_TOOL = {
  type: "function",
  function: {
    name: "prepare_ticket",
    description: "Returns the final, structured ticket for the requested DeFi operation, once research is done.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string" },
        riskLevel: { type: "string", enum: ["low", "moderate", "high", "unknown"] },
        riskReason: { type: "string" },
        fees: { type: "string" },
        apy: { type: "string", nullable: true },
        lock: { type: "boolean", nullable: true },
        rate: { type: "string", nullable: true },
        estimatedReceive: { type: "string", nullable: true },
        route: { type: "string", nullable: true },
        steps: { type: "array", items: { type: "string" }, nullable: true },
        tokenOutSymbol: { type: "string", nullable: true },
        destinationChainKey: { type: "string", nullable: true },
        dataFound: { type: "boolean" },
        summary: { type: "string" }
      },
      required: ["platform", "riskLevel", "riskReason", "fees", "dataFound", "summary"]
    }
  }
};

async function prepareDefiTicketWithGemini(feature, amount, asset, userMessage, walletContext) {
  if (!process.env.GEMINI_API_KEY) {
    return { dataFound: false, summary: "Gemini isn't configured (missing GEMINI_API_KEY on the server)." };
  }

  const featureLabel = { swap: "a swap", bridge: "a bridge", staking: "a staking deposit" }[feature] || feature;

  const systemPrompt = `
You are Lyra's DeFi ticket preparation module (fallback engine), for a Plasma mainnet wallet.
The user is asking for ${featureLabel} of ${amount || "an amount"} ${asset || "XPL"}.

You have direct access to REAL on-chain/API data via three tools:
get_swap_quote (Uniswap V3 real rate), get_bridge_quote (LI.FI real
quote), get_aave_apy (Aave real supply rate). ALWAYS call the
relevant one before filling numeric fields — never estimate or guess
a rate, yield, or fee when a tool exists to get the real value.

Rules:
- NEVER make up a rate, yield, or address.
- Always state the risk level and why.
- For a SWAP: XPL, USDT, USDC, and EURC are available on Plasma today.
- For a BRIDGE: destinationChainKey must be a lowercase LI.FI chain key (e.g. "eth", "bas", "arb").
- ALWAYS finish by calling prepare_ticket.

Wallet context:
${walletContext}

User's original request:
"${userMessage}"
`;

  let messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Prepare the ticket for ${featureLabel} of ${amount || "?"} ${asset || "XPL"}.` }
  ];

  for (let turn = 0; turn < 5; turn++) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GEMINI_API_KEY}`
      },
      body: JSON.stringify({
        // gemini-2.5-flash is the default on purpose: it has a far
        // more generous free-tier quota than gemini-3.6-flash (which
        // was capping out at 5 requests/minute and killing every
        // swap). Override via GEMINI_MODEL once billing is enabled
        // if you want the newer model.
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        messages,
        tools: [ GEMINI_EXPLORER_TOOL, GEMINI_PREPARE_TICKET_TOOL, GEMINI_SWAP_QUOTE_TOOL, GEMINI_BRIDGE_QUOTE_TOOL, GEMINI_AAVE_APY_TOOL ],
        tool_choice: "auto"
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error (ticket):", errText);
      return { dataFound: false, summary: "Something went wrong while preparing the ticket with Gemini. Try again in a moment." };
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const toolCalls = choice?.message?.tool_calls || [];

    const finalCall = toolCalls.find(c => c.function?.name === "prepare_ticket");
    if (finalCall) {
      try {
        return JSON.parse(finalCall.function.arguments);
      } catch {
        return { dataFound: false, summary: "Gemini returned a malformed ticket." };
      }
    }

    const dataCalls = toolCalls.filter(c => c.function?.name !== "prepare_ticket");

if (dataCalls.length > 0) {
  messages.push(choice.message);

  for (const call of dataCalls) {
    const args = JSON.parse(call.function.arguments || "{}");
    let result;

    switch (call.function.name) {
      case "explorer_lookup":
        result = await explorerLookup(args.address);
        break;
      case "get_swap_quote":
        result = await getRealSwapQuote(args.assetIn, args.assetOut, args.amount);
        break;
      case "get_bridge_quote":
        result = await getRealBridgeQuote(args.asset, args.destinationChainKey, args.amount, walletContext.match(/0x[a-fA-F0-9]{40}/)?.[0]);
        break;
      case "get_aave_apy":
        result = await getRealAaveAPY(args.asset);
        break;
      default:
        result = { found: false, reason: "Unknown tool." };
    }

    messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
  }
  continue;
}

    if (turn === 0) {
      messages.push(choice.message);
      messages.push({ role: "user", content: "Conclude now using the prepare_ticket tool." });
      continue;
    }

    return { dataFound: false, summary: "I couldn't put together a reliable ticket for this operation." };
  }

  return { dataFound: false, summary: "The research took too many steps — try again with a more specific request." };
}

// ========================================
// DISPATCH — Claude en principal, Gemini uniquement en secours
// ========================================
// Claude est TOUJOURS tenté en premier. Gemini n'intervient que si
// GEMINI_API_KEY est configurée ET que Claude a échoué ou n'a pas pu
// produire un ticket exploitable (dataFound=false ou erreur explicite).
// TICKET_AI_PROVIDER=gemini permet de forcer Gemini en priorité pour
// des tests, mais reste optionnel — la valeur par défaut est "claude".
const TICKET_AI_PROVIDER = process.env.TICKET_AI_PROVIDER || "claude"; // "claude" | "gemini"

function looksLikeTicketFailure(ticket) {
  if (!ticket) return true;
  if (ticket.dataFound === false) return true;
  if (!ticket.platform || !ticket.riskLevel || !ticket.summary) return true;
  return false;
}

async function prepareDefiTicket(feature, amount, asset, userMessage, walletContext) {
  const primary = TICKET_AI_PROVIDER === "gemini"
    ? prepareDefiTicketWithGemini
    : prepareDefiTicketWithClaude;

  const fallback = TICKET_AI_PROVIDER === "gemini"
    ? prepareDefiTicketWithClaude
    : prepareDefiTicketWithGemini;

  try {
    const result = await primary(feature, amount, asset, userMessage, walletContext);

    // Le fallback ne se déclenche que si le résultat primaire est
    // clairement inexploitable ET que le fournisseur de secours est
    // réellement configuré.
    const fallbackConfigured = TICKET_AI_PROVIDER === "gemini"
      ? !!process.env.ANTHROPIC_API_KEY
      : !!process.env.GEMINI_API_KEY;

    if (looksLikeTicketFailure(result) && fallbackConfigured) {
      console.warn(`Primary ticket provider (${TICKET_AI_PROVIDER}) failed, falling back.`);
      return await fallback(feature, amount, asset, userMessage, walletContext);
    }

    return result;
  } catch (error) {
    console.error("Primary ticket provider threw:", error);

    const fallbackConfigured = TICKET_AI_PROVIDER === "gemini"
      ? !!process.env.ANTHROPIC_API_KEY
      : !!process.env.GEMINI_API_KEY;

    if (fallbackConfigured) {
      try {
        return await fallback(feature, amount, asset, userMessage, walletContext);
      } catch (fallbackError) {
        console.error("Fallback ticket provider also threw:", fallbackError);
      }
    }

    return { dataFound: false, summary: "Something went wrong while preparing the ticket. Try again in a moment." };
  }
}

// ========================================
// OPEN-ENDED CRYPTO RESEARCH (Claude + tools)
// ========================================
// Completely separate from the intent classifier above: this agent
// has NO access to any function that moves funds. It only searches
// and explains. That's intentional — even if Claude is wrong or
// misused, it technically can't sign or send anything.
async function answerCryptoQuestion(userMessage, walletContext) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return "Deep research isn't configured yet (missing ANTHROPIC_API_KEY on the server).";
  }

  const systemPrompt = `
You are Lyra's crypto/DeFi research module, a Plasma wallet.
Answer open-ended questions about crypto, DeFi, a protocol, or a
contract address clearly and in a structured way, in English.

Rules:
- Use web search for anything you're not sure about or that may have
  changed recently.
- Use the explorer_lookup tool to check a contract address on Plasma
  before making any claim about it.
- If asked to assess a risk, always structure your answer: risk level
  (low / moderate / high), then the concrete reasons behind that
  assessment.
- Never give a categorical financial recommendation ("do this") —
  present the facts and the risks, the decision stays with the user.
- If you can't find the information with confidence, say so clearly
  rather than making up an answer.
- Stay concise: 4 to 6 sentences, unless the question clearly calls
  for more detail.

User's wallet context (if relevant):
${walletContext}
`;

  let messages = [{ role: "user", content: userMessage }];

  for (let turn = 0; turn < 4; turn++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1200,
        system: systemPrompt,
        messages,
        tools: CRYPTO_RESEARCH_TOOLS
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return "Something went wrong during deep research. Try again in a moment.";
    }

    const data = await response.json();
    const content = data.content || [];

    const customToolUses = content.filter(
      block => block.type === "tool_use" && block.name === "explorer_lookup"
    );

    if (data.stop_reason === "tool_use" && customToolUses.length > 0) {
      messages.push({ role: "assistant", content });

      const toolResults = await Promise.all(
        customToolUses.map(async (block) => ({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(await explorerLookup(block.input?.address))
        }))
      );

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    const textBlocks = content.filter(b => b.type === "text");

    return (
      textBlocks.map(b => b.text).join("\n\n") ||
      "I couldn't find a clear answer to this question."
    );
  }

  return "The research took too many steps — try rephrasing your question more precisely.";
}

// ========================================
// AI PROVIDERS FOR INTENT CLASSIFICATION (/api/ai)
// ========================================
// OpenRouter (Qwen) is the primary engine. Mistral AI is wired in as
// an automatic fallback — if OpenRouter fails (down, rate-limited, or
// its key isn't set) and MISTRAL_API_KEY is present, the exact same
// prompt and messages are retried against Mistral's API. Gemini is
// wired in as a THIRD, last-resort fallback, only tried if both
// OpenRouter and Mistral failed and GEMINI_API_KEY is present. None
// of the three run at the same time — each is only attempted if the
// previous one(s) failed to produce a usable answer.
function getConfiguredAIProviders() {
  const providers = [];

  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      name: "OpenRouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.AI_MODEL || "qwen/qwen-2.5-7b-instruct",
      extraHeaders: {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:5173",
        "X-Title": "Plasma AI Wallet"
      }
    });
  }

  if (process.env.MISTRAL_API_KEY) {
    providers.push({
      name: "Mistral",
      url: "https://api.mistral.ai/v1/chat/completions",
      apiKey: process.env.MISTRAL_API_KEY,
      model: process.env.MISTRAL_MODEL || "mistral-small-latest",
      extraHeaders: {}
    });
  }

  // Gemini, via its official OpenAI-compatible endpoint — same
  // chat.completions shape as OpenRouter/Mistral, so it slots into
  // the exact same callChatCompletionJSON() call below with no
  // special-casing needed. Kept LAST on purpose: it's a pure
  // last-resort fallback, never the first provider tried.
  // gemini-2.5-flash is used by default here too, for the same
  // free-tier-quota reason as the ticket preparation fallback above.
  if (process.env.GEMINI_API_KEY) {
    providers.push({
      name: "Gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      extraHeaders: {}
    });
  }

  return providers;
}

async function callChatCompletionJSON(provider, messages) {
  const response = await fetch(provider.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${provider.apiKey}`,
      ...provider.extraHeaders
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: 0.1,
      response_format: {
        type: "json_object"
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider.name} HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error(`${provider.name}: empty response`);
  }

  return raw;
}

app.post("/api/ai", async (req, res) => {
  try {
    const {
      message,
      walletAddress,
      balance,
      history = [],
      pendingTransaction = null,
      contacts = []
    } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "Missing message."
      });
    }

    const aiProviders = getConfiguredAIProviders();

    if (!aiProviders.length) {
      return res.status(500).json({
        error: "No AI provider configured. Set OPENROUTER_API_KEY and/or MISTRAL_API_KEY and/or GEMINI_API_KEY."
      });
    }

    const context = `
WALLET INFORMATION:

Address:
${walletAddress || "No wallet"}

Balance shown in the app:
${balance || "0"} XPL

CURRENT TRANSACTION:

Amount:
${pendingTransaction?.amount || "Not set"}

Recipient:
${pendingTransaction?.recipient || "Not set"}

Recipient name:
${pendingTransaction?.contactName || "Not set"}

${contacts.length
  ? contacts
      .map(c => `- ${c.name}: ${c.address}`)
      .join("\n")
  : "No saved contacts."}


IMPORTANT:
The balance above may be stale.

If the user asks for their balance,
you must use the GET_BALANCE intent.
`;

    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },

      {
        role: "system",
        content: context
      },

      ...history.slice(-10).map((m) => ({
        role: m.role === "ai"
          ? "assistant"
          : "user",
        content: m.text
      })),

      {
        role: "user",
        content: message
      }
    ];

    let raw = null;
    let lastProviderError = null;

    for (const provider of aiProviders) {
      try {
        raw = await callChatCompletionJSON(provider, messages);
        break;
      } catch (e) {
        console.error(`${provider.name} error:`, e.message);
        lastProviderError = e;
        // Try the next configured provider (e.g. fall back from
        // OpenRouter to Mistral, then to Gemini) instead of failing
        // immediately.
      }
    }

    if (!raw) {
      console.error("All AI providers failed:", lastProviderError?.message);

      return res.status(500).json({
        error: "AI engine error."
      });
    }

    let action;

    try {
      action = JSON.parse(raw);
    } catch {
      console.error(
        "Invalid AI response:",
        raw
      );

      return res.status(500).json({
        error: "Invalid AI response."
      });
    }

if (["GET_ADDRESS", "RECEIVE_XPL", "CHAT"].includes(action.intent)) {
  const wantsQrOrReceive = /\bqr\b|qr[\s-]?code|qrcode|\bscan\b|\breceive\b/i.test(message);

  if (wantsQrOrReceive) {
    action.intent = "RECEIVE_XPL";
  }

  if (action.intent === "GET_ADDRESS" || action.intent === "RECEIVE_XPL") {
    action.message = "";
  }
}

    // ========================================
    // DEFI (SWAP / BRIDGE / STAKE) — SERVER GUARDRAIL
    // ========================================
    // These features stay off until a verified contract is set in
    // tools/defiProtocols.js. We deliberately ignore anything the
    // model may have generated (rates, addresses, estimated amounts)
    // and return a fixed message instead.

    const DEFI_INTENTS = {
      SWAP_XPL: { feature: "swap", label: "Swap" },
      BRIDGE_XPL: { feature: "bridge", label: "Bridge" },
      STAKE_XPL: { feature: "staking", label: "Staking" },
      UNSTAKE_XPL: { feature: "staking", label: "Staking withdrawal" }
    };

    if (DEFI_INTENTS[action.intent]) {
      const { feature, label } = DEFI_INTENTS[action.intent];

      const enabled = isDefiFeatureEnabled(feature);
      const info = getDefiFeatureInfo(feature);

      const walletContext = walletAddress
        ? `Connected wallet address: ${walletAddress}. XPL balance shown: ${balance || "0"}.`
        : "No wallet connected yet.";

      // Claude does the research AND builds the structured ticket
      // (Gemini only steps in as a fallback if Claude fails) — even
      // when it's not executable yet, we show the user a real ticket
      // based on real data, not a generic text.
      const ticket = await prepareDefiTicket(
        feature,
        action.amount,
        action.asset || "XPL",
        message,
        walletContext
      );

      return res.json({
        intent: action.intent,
        amount: action.amount || null,
        amountUSD: null,
        recipient: null,
        asset: action.asset || "XPL",
        requires_confirmation: false,
        defiFeature: feature,
        defiInfo: info,
        defiTicket: ticket,
        defiExecutable: enabled,
        message: enabled
          ? action.message
          : info?.addressesVerified
            ? `${label} isn't executable in Lyra yet — here's what I found ` +
              `anyway. ${info.platform}'s contracts are verified, but building ` +
              `and testing the transaction isn't finished on the app side ` +
              `yet, so I can't send anything for now.`
            : `${label} isn't executable in Lyra yet — here's what I found ` +
              `anyway, but the exact contract address isn't verified in the ` +
              `app yet, so I can't send anything for now.`
      });
    }

    // ========================================
    // MULTI_ACTION — chained steps in one combined ticket
    // ========================================
    // Same principle as single-action DeFi tickets: each step that
    // needs research goes through prepareDefiTicket (Claude, with
    // real tools, Gemini only as fallback). Nothing here invents a
    // rate or an address. A step that depends on a previous one's
    // output never gets a guessed number — it's resolved from the
    // previous step's own research, and re-resolved for real once
    // that step actually executes.

    function parseLeadingNumber(str) {
      if (!str) return null;
      const match = String(str).replace(/,/g, "").match(/[\d.]+/);
      return match ? Number(match[0]) : null;
    }

    if (action.intent === "MULTI_ACTION" && Array.isArray(action.steps) && action.steps.length > 0) {
      const walletContext = walletAddress
        ? `Connected wallet address: ${walletAddress}. XPL balance shown: ${balance || "0"}.`
        : "No wallet connected yet.";

      const DEFI_STEP_FEATURE = {
        swap: "swap",
        bridge: "bridge",
        stake: "staking",
        unstake: "staking"
      };

      let previousOutputEstimate = null;
      let previousOutputSymbol = null;
      const resolvedSteps = [];

      for (const step of action.steps) {
        const kind = step.kind;
        const dependsOnPrevious = !step.amount && previousOutputEstimate !== null;
        const effectiveAmount = step.amount || (dependsOnPrevious ? String(previousOutputEstimate) : null);
        const effectiveAsset = step.asset || previousOutputSymbol || "XPL";

        if (kind === "send") {
          resolvedSteps.push({
            kind: "send",
            amount: effectiveAmount,
            amountIsEstimate: dependsOnPrevious,
            asset: effectiveAsset,
            recipient: step.recipient || null,
            contactName: step.contactName || null
          });
          // A send doesn't produce a new asset for a later step.
          previousOutputEstimate = null;
          previousOutputSymbol = null;
          continue;
        }

        const feature = DEFI_STEP_FEATURE[kind];
        if (!feature) continue;

        const enabled = isDefiFeatureEnabled(feature);
        const info = getDefiFeatureInfo(feature);

        const ticket = await prepareDefiTicket(
          feature,
          effectiveAmount,
          effectiveAsset,
          message,
          walletContext
        );

        resolvedSteps.push({
          kind,
          feature,
          intent: kind === "swap" ? "SWAP_XPL" : kind === "bridge" ? "BRIDGE_XPL" : kind === "unstake" ? "UNSTAKE_XPL" : "STAKE_XPL",
          amount: effectiveAmount,
          amountIsEstimate: dependsOnPrevious,
          asset: effectiveAsset,
          tokenOutSymbol: step.tokenOutSymbol || null,
          destinationChainKey: step.destinationChainKey || null,
          executable: enabled,
          info,
          ticket
        });

        // Feed this step's estimated output to the next one, if any.
        if (kind === "swap") {
          previousOutputEstimate = parseLeadingNumber(ticket.estimatedReceive);
          previousOutputSymbol = step.tokenOutSymbol || null;
        } else {
          previousOutputEstimate = null;
          previousOutputSymbol = null;
        }
      }

      return res.json({
        intent: "MULTI_ACTION",
        amount: null,
        amountUSD: null,
        recipient: null,
        asset: "XPL",
        requires_confirmation: false,
        message: action.message || "Here's the plan — check each step, then hold the button to confirm.",
        steps: resolvedSteps
      });
    }

    // ========================================
    // ASK_CRYPTO — open-ended questions (real research via Claude)
    // ========================================

    if (action.intent === "ASK_CRYPTO") {
      const walletContext = walletAddress
        ? `Connected wallet address: ${walletAddress}. XPL balance shown in the app: ${balance || "0"}.`
        : "No wallet connected yet.";

      const answer = await answerCryptoQuestion(message, walletContext);

      return res.json({
        intent: "ASK_CRYPTO",
        amount: null,
        amountUSD: null,
        recipient: null,
        asset: "XPL",
        requires_confirmation: false,
        message: answer
      });
    }

    // ========================================
// CONVERSION USD → XPL
// ========================================

if (
  action.intent === "SEND_XPL" &&
  action.amountUSD !== null &&
  action.amountUSD !== undefined &&
  action.amountUSD !== ""
) {
  const usdAmount = Number(action.amountUSD);

  if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
    return res.status(400).json({
      error: "Montant USD invalide."
    });
  }

  try {
    const xplPrice = await getXplUsdPrice();

    const xplAmount = usdAmount / xplPrice;

    action.amount = xplAmount.toFixed(18);
    action.priceUSD = xplPrice;
    action.amountUSD = usdAmount.toString();

    // Now that the backend knows the exact XPL amount,
    // the transaction can be prepared.
    if (action.recipient) {
      action.requires_confirmation = true;
    }

    if (action.recipient) {
  action.message =
    `$${usdAmount.toFixed(2)} is worth about ` +
    `${xplAmount.toFixed(6)} XPL at the current rate. ` +
    `Check the details, then hold the button to confirm.`;
} else {
  action.message =
    `$${usdAmount.toFixed(2)} is worth about ` +
    `${xplAmount.toFixed(6)} XPL at the current rate. ` +
    `Which address would you like to send it to?`;
}

  } catch (error) {
    console.error("XPL price error:", error);

    return res.status(502).json({
      error: "Couldn't fetch the current XPL price."
    });
  }
}

    /*
     * ========================================
     * TOOL EXECUTION
     * ========================================
     */

    let toolResult = null;

    if (action.intent === "GET_BALANCE") {

      toolResult = await executeTool(
        "get_balance",
        walletAddress
      );

      console.log(
        "GET_BALANCE:",
        toolResult
      );
    }

    /*
     * ========================================
     * RETURN TO FRONTEND
     * ========================================
     */

    if (toolResult) {

  const balanceXPL = Number(toolResult.balanceXPL);

  let naturalMessage;

  if (balanceXPL === 0) {
    naturalMessage = "Your balance is currently 0 XPL.";
  } else if (balanceXPL < 0.01) {
    naturalMessage = `You currently have about ${balanceXPL.toFixed(6)} XPL in your wallet.`;
  } else if (balanceXPL < 1) {
    naturalMessage = `You currently have about ${balanceXPL.toFixed(4)} XPL in your wallet.`;
  } else {
    naturalMessage = `You currently have ${balanceXPL.toLocaleString("en-US", {
      maximumFractionDigits: 4
    })} XPL in your wallet.`;
  }

  return res.json({
    ...action,
    toolResult,
    message: naturalMessage
  });

}

    res.json(action);

  } catch (error) {

    console.error(
      "AI SERVER ERROR:",
      error
    );

    res.status(500).json({
      error:
        error.message ||
        "Erreur serveur."
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `Plasma AI server running on port ${PORT}`
  );
});
