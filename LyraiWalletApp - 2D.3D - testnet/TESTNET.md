# Lyra wallet, TESTNET build

Copy of the real wallet pointed at public testnets. Test coins have no value.
Same network keys as the real wallet (plasma, ethereum, base, polygon, arc, hyperliquid),
so nothing else in the app changes. `IS_TESTNET` in `src/config.js` switches the testnet-only rules.

| Network | Chain id | Faucet |
|---|---|---|
| Plasma Testnet | 9746 | Plasma docs faucet (test XPL, USDT0) |
| Ethereum Sepolia | 11155111 | any Sepolia faucet, USDC/EURC: faucet.circle.com |
| Base Sepolia | 84532 | any Base Sepolia faucet, USDC/EURC: faucet.circle.com |
| Polygon Amoy | 80002 | Polygon faucet, USDC: faucet.circle.com |
| Arc Testnet | 5042002 | faucet.circle.com (USDC is the gas coin) |
| Hyperliquid Testnet | 998 | Hyperliquid testnet faucet (HYPE) |

## What works on testnet
- Balances, send, receive, history, contacts, Extra protection (MPC), Lyra chat.
- Bridge: USDC / EURC between all six networks, through Circle's Bridge Kit (CCTP).
- Swap: USDC <-> EURC on Arc Testnet only (Circle's Swap Kit).
- Lyra's 0.25% fee (to the treasury address) is charged the same way, in test coins.

## What is NOT available on testnet
- Swap on the other networks (KyberSwap has no testnets).
- Staking (Aave's testnet pools list their own tokens, not Circle's USDC).
- LI.FI bridges, "consolidate" sweep, Polymarket predictions, fiat on/off-ramp, x402.

## Run it locally
Backend on port 3002 (set in `.env`), site on 5194, so it never clashes with the real wallet (3001 / 5193).

    node server/server.js
    npx vite --port 5194

`.env`: `DATABASE_URL` is commented out on purpose so Extra protection uses the local file store,
not the production Neon database. Do not point this build at the production backend.
