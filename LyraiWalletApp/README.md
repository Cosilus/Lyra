# Plasma Wallet — Mainnet V1

Real non-custodial prototype for Plasma Mainnet.

## Network

- Network: Plasma Mainnet Beta
- RPC: https://rpc.plasma.to
- Chain ID: 9745
- Native token: XPL
- Explorer: https://plasmascan.to

These settings match the network's public information.

## Installation

Node.js 20+ recommended.

```bash
npm install
node server/server.js   # first terminal — starts the AI/DeFi backend on port 3001
npm run dev              # second terminal — starts the frontend
```

Then open the Vite URL shown in the terminal.

Fill in `.env` with your own API keys (OpenRouter and/or Mistral,
Etherscan-compatible explorer, Anthropic) before starting the server
— see the comments in that file.

### AI engine (OpenRouter + Mistral fallback)

The `/api/ai` endpoint (intent classification for the chat assistant)
tries **OpenRouter (Qwen)** first. If that call fails — provider down,
rate-limited, or `OPENROUTER_API_KEY` not set — it automatically
retries the exact same request on **Mistral AI**, using
`MISTRAL_API_KEY`. You only need to set one of the two keys for the
assistant to work; setting both gives you automatic redundancy.

## What this V1 does

- real RPC connection to Plasma Mainnet;
- EVM wallet creation;
- seed phrase import;
- password-encrypted keystore in localStorage;
- reading the real XPL and USDT balances;
- address and explorer link;
- preparing an XPL or USDT transfer;
- local signing;
- real sending on Plasma Mainnet;
- waiting for confirmation;
- displaying the hash and PlasmaScan link;
- automatic lock after 10 minutes of inactivity;
- portfolio chart (balance + DeFi performance) with 24h/7d/1m/6m/1y/YTD ranges;
- transaction history (native XPL + USDT transfers) from the hamburger menu;
- AI-prepared DeFi tickets (swap, bridge, staking) with real research via Claude;
- swap (Uniswap V3, XPL <-> USDT), staking (Aave V3), and bridge (LI.FI) execution, each gated behind a "Hold to Confirm" ticket.

## What this V1 does NOT do yet

- USDC: doesn't exist on Plasma, so it's not supported;
- swap slippage protection (currently amountOutMinimum = 0 — use small amounts);
- arbitrary contract transactions;
- automatic contact recovery;
- a production-grade backend (no rate limiting, no auth).

## Deploying the backend on Render

The backend (`server/server.js`) is ready to deploy as a Render Web
Service:

1. Push this project to a Git repository (GitHub/GitLab) — `node_modules`,
   `dist`, and `.env` are already excluded via `.gitignore`.
2. On Render: **New → Web Service**, connect the repo. Render will pick
   up `render.yaml` automatically (or set manually: build command
   `npm install`, start command `npm start`).
3. In the Render dashboard, set the environment variables listed in
   `.env.example` (`OPENROUTER_API_KEY`, `MISTRAL_API_KEY`,
   `ETHERSCAN_API_KEY`, `ANTHROPIC_API_KEY` if you use deep research,
   etc.). **Do not commit real keys** — only `.env.example`
   (placeholders) is tracked in git.
4. Render assigns the port automatically via `process.env.PORT` — the
   server already reads it, no change needed.
5. Once deployed, note the backend's public URL
   (`https://your-service.onrender.com`). Set `VITE_API_URL` to that
   URL wherever the frontend is hosted (Vercel/Netlify/Render static
   site), then rebuild the frontend — every API call in the app reads
   from `VITE_API_URL` instead of `localhost:3001`.
6. Optionally set `CORS_ORIGIN` on the backend to the frontend's exact
   URL once you know it, to restrict which origins can call the API.

Render's free tier spins down after inactivity — the first request
after a period of idling will be slow (cold start) while the AI
features (`/api/ai`, DeFi tickets, deep research) will otherwise work
exactly as they do locally.

## Security

This is a real mainnet build — every transaction moves real funds.
Test with very small amounts first. For real production use, replace
the current local storage with a hardened wallet architecture (Web
Crypto / OS keychain / hardware wallet / external wallet), and add
transaction simulation and anti-phishing protections before relying
on this for meaningful amounts.
