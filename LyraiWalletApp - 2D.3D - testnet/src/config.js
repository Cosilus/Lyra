// Backend API base URL. In dev, Vite falls back to the local server.
// In production, set VITE_API_URL (e.g. on Render/Vercel/Netlify) to
// the deployed backend's URL. Every fetch() in the app reads this
// instead of a hardcoded localhost address.
export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:3001";

export const KYBERSWAP_CLIENT_ID = "Lyra";

// ============================================================
// TESTNET BUILD. Every network below is the public TESTNET of the one the
// real wallet uses, with the SAME `key` ("plasma", "ethereum", ...) so the
// rest of the app (storage, SWITCH_NETWORK, the server) works unchanged.
// Test coins have no real value; get them from each network's faucet.
// Chain ids and RPC urls verified live (eth_chainId) on 02.10.2026.
// ============================================================
export const IS_TESTNET = true;

export const PLASMA_TESTNET = {
  key: "plasma",
  name: "Plasma Testnet",
  chainId: 9746,
  chainIdHex: "0x2612",
  rpcUrl: "https://testnet-rpc.plasma.to",
  nativeSymbol: "XPL",
  explorer: "https://testnet.plasmascan.to",
  color: "#007e02",
  kyberSlug: null,
  coingeckoId: "plasma",
  description: "Plasma's public testnet: test XPL and test USDT0, no real value.",
};

export const ETHEREUM_TESTNET = {
  key: "ethereum",
  name: "Ethereum Sepolia",
  chainId: 11155111,
  chainIdHex: "0xaa36a7",
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  nativeSymbol: "ETH",
  explorer: "https://sepolia.etherscan.io",
  color: "#1436be",
  kyberSlug: null,
  coingeckoId: "ethereum",
  description: "Ethereum's Sepolia testnet: test ETH and Circle's test USDC/EURC, no real value.",
};

export const BASE_TESTNET = {
  key: "base",
  name: "Base Sepolia",
  chainId: 84532,
  chainIdHex: "0x14a34",
  rpcUrl: "https://sepolia.base.org",
  nativeSymbol: "ETH",
  explorer: "https://sepolia.basescan.org",
  color: "#0052FF",
  kyberSlug: null,
  coingeckoId: "ethereum",
  description: "Base's Sepolia testnet: test ETH and Circle's test USDC/EURC, no real value.",
};

export const POLYGON_TESTNET = {
  key: "polygon",
  name: "Polygon Amoy",
  chainId: 80002,
  chainIdHex: "0x13882",
  rpcUrl: "https://polygon-amoy-bor-rpc.publicnode.com",
  nativeSymbol: "POL",
  explorer: "https://amoy.polygonscan.com",
  color: "#8247E5",
  kyberSlug: null,
  coingeckoId: "polygon-ecosystem-token",
  description: "Polygon's Amoy testnet: test POL and Circle's test USDC, no real value.",
};

// Arc testnet: USDC itself is the native (gas) coin, 18 decimals like the
// mainnet, same as ARC_MAINNET in the real wallet. Its USDC token interface
// is at 0x3600...0000 on both.
export const ARC_TESTNET = {
  key: "arc",
  name: "Arc Testnet",
  chainId: 5042002,
  chainIdHex: "0x4cef52",
  rpcUrl: "https://rpc.testnet.arc.network",
  nativeSymbol: "USDC",
  explorer: "https://explorer.testnet.arc.io",
  color: "#1473E6",
  kyberSlug: null,
  coingeckoId: "usd-coin",
  description: "Circle's Arc testnet: test USDC pays the gas, with Circle's own swap and bridge kits.",
};

export const HYPERLIQUID_TESTNET = {
  key: "hyperliquid",
  name: "Hyperliquid Testnet",
  chainId: 998,
  chainIdHex: "0x3e6",
  rpcUrl: "https://rpc.hyperliquid-testnet.xyz/evm",
  nativeSymbol: "HYPE",
  explorer: "https://testnet.purrsec.com",
  color: "#97FCE4",
  kyberSlug: null,
  coingeckoId: "hyperliquid",
  description: "HyperEVM's testnet: test HYPE, no real value.",
};

// Ordered list of supported networks, drives the network switcher UI.
export const NETWORKS = [PLASMA_TESTNET, ETHEREUM_TESTNET, BASE_TESTNET, POLYGON_TESTNET, ARC_TESTNET, HYPERLIQUID_TESTNET];

// Default network on first launch. Persisted afterward in
// localStorage under "plasma_active_network_v1".
export const DEFAULT_NETWORK = PLASMA_TESTNET;

export function getNetworkByKey(key) {
  return NETWORKS.find(n => n.key === key) || DEFAULT_NETWORK;
}

// ============================================================
// PER-NETWORK ERC-20 TOKENS (TESTNET)
// ============================================================
// Every address below has been individually verified against an
// official source before being added, never guessed or assumed
// identical across chains, since the same token has a different
// contract address on every network.
//
// Plasma: USDT0 verified 16.08.2026 (official Plasma/Tether docs).
// USDC/EURC verified 28.08.2026 via Circle's official announcement
// (circle.com/blog/now-available-usdc-eurc-cctp-and-bridge-kit-on-plasma).
//
// Ethereum & Base: canonical USDC/USDT addresses, well-established
// and widely documented (Circle's own docs, Etherscan/Basescan
// verified contracts). Verified 29.08.2026.
export const TOKENS_BY_NETWORK = {
  // All addresses below were read live from each testnet (symbol()/decimals())
  // on 02.10.2026, none assumed from the mainnet list.
  plasma: {
    USDT0: { symbol: "USDT0", name: "USDT0", address: "0x502012b361AebCE43b26Ec812B74D9a51dB4D412", decimals: 6, color: "#26A17B" },
    // Circle's USDC/EURC on Plasma testnet (addresses from @circle-fin/bridge-kit's Plasma_Testnet
    // definition, symbol()/decimals() read live): these are the ones the bridge can carry.
    USDC: { symbol: "USDC", name: "USD Coin", address: "0xE67Fb267022cBA8064Dd388CC2FED724F3120D9D", decimals: 6, color: "#2775CA" },
    EURC: { symbol: "EURC", name: "Euro Coin", address: "0x98AfA0F93Dd993B736399f9074eDcEBD1985A330", decimals: 6, color: "#0066B3" },
  },
  // Circle's own test USDC/EURC (faucet.circle.com), not the Aave test tokens.
  ethereum: {
    USDC: { symbol: "USDC", name: "USD Coin", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6, color: "#2775CA" },
    EURC: { symbol: "EURC", name: "Euro Coin", address: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4", decimals: 6, color: "#0066B3" },
  },
  base: {
    USDC: { symbol: "USDC", name: "USD Coin", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6, color: "#2775CA" },
    EURC: { symbol: "EURC", name: "Euro Coin", address: "0x808456652fdb597867f38412077A9182bf77359F", decimals: 6, color: "#0066B3" },
  },
  polygon: {
    // Amoy's USDC is native Circle USDC (there is no bridged USDC.e there).
    USDC: { symbol: "USDC", name: "USD Coin", address: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", decimals: 6, color: "#2775CA" },
  },
  // Arc: USDC is the native coin, so (as on the mainnet) it is NOT listed here
  // a second time. EURC is the only ERC-20 line.
  arc: {
    EURC: { symbol: "EURC", name: "Euro Coin", address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", decimals: 6, color: "#0066B3" },
  },
  hyperliquid: {},
};

export function getActiveTokens(networkKey) {
  const tokens = TOKENS_BY_NETWORK[networkKey] || {};
  return Object.fromEntries(
    Object.entries(tokens).filter(
      ([, t]) => t.address && t.address !== "0x0000000000000000000000000000000000000000"
    )
  );
}

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// ============================================================
// PER-NETWORK WRAPPED NATIVE TOKEN (for routing native coin through
// Uniswap V3, which only understands ERC-20 tokens)
// ============================================================
export const WNATIVE_BY_NETWORK = {
  ethereum: {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia WETH, read live on-chain
    decimals: 18,
  },
  base: {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x4200000000000000000000000000000000000006", // OP-stack predeploy, read live on-chain
    decimals: 18,
  },
  polygon: {
    symbol: "WPOL",
    name: "Wrapped Polygon Ecosystem Token",
    address: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9", // Amoy WPOL, read live on-chain
    decimals: 18,
  },
};

export const WETH9_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

export const KYBERSWAP_API_BASE = (chainSlug) =>
  `https://aggregator-api.kyberswap.com/${chainSlug}/api/v1`;

export const NATIVE_PSEUDO_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// ============================================================
// PER-NETWORK DEFI PROTOCOLS (Uniswap V3, Aave V3)
// ============================================================
// Testnet DeFi: only what was verified live on-chain (eth_getCode) on 02.10.2026.
//  - No LI.FI: it has no testnets, so there is no `lifi` entry. Bridges run
//    through Circle's Bridge Kit (CCTP, USDC/EURC) on every testnet instead.
//  - No KyberSwap: it has no testnets. Swaps work only on Arc (Circle's Swap Kit).
//  - No Aave: Aave's Sepolia pools list their OWN test tokens, not Circle's
//    USDC, so staking is simply not offered here (executeStakeTicket's existing
//    guard says "Staking isn't configured for ... yet").
//  - No Polymarket / Plasma Oku: mainnet-only services.
export const DEFI_CONTRACTS_BY_NETWORK = {
  plasma: {},
  ethereum: {
    uniswapV3: {
      router: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",   // SwapRouter02 (Sepolia)
      quoter: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",    // QuoterV2
      factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",   // UniswapV3Factory
    },
  },
  base: {
    uniswapV3: {
      router: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",   // SwapRouter02 (Base Sepolia)
      quoter: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",    // QuoterV2
      factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",   // UniswapV3Factory
    },
  },
  polygon: {},
  arc: {},
  hyperliquid: {},
};

// A deposit wallet's real trading collateral is NOT USDC.e, it's a
// separate token Polymarket calls "pUSD" (Polymarket USD), confirmed
// live from an actual settled trade's on-chain transfers: USDC.e sent to
// Polymarket's own deposit-intake address gets minted 1:1 as pUSD into
// the deposit wallet (a mint event, from the zero address), and it's
// pUSD (not USDC.e) that actually moves against the V2 exchange when an
// order fills. This is also the exact "collateral" address in
// clob-client-v2's own MATIC_CONTRACTS (src/config.ts), which was easy
// to misread as "just USDC.e" since V1's exchange really did use plain
// USDC.e directly. Only relevant for POLY_1271 (deposit wallet) makers;
// a legacy Gnosis Safe or plain EOA maker still uses USDC.e directly,
// see executePredictionTicket in App.jsx.
export const POLYMARKET_PUSD_COLLATERAL = {
  address: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
  symbol: "pUSD",
  decimals: 6,
};

// EIP-712 domain/types for a Polymarket CLOB order (V2 struct), straight
// from Polymarket/clob-client-v2's ctfExchangeV2TypedData.ts /
// exchangeOrderBuilderV2.ts (shared by both the plain and neg-risk V2
// exchange, only the domain's verifyingContract differs between them).
// Unlike V1, expiration/nonce/feeRateBps/taker are NOT part of the signed
// struct (expiration still rides along in the API payload, just unsigned;
// nonce/feeRateBps/taker are gone entirely), and timestamp/metadata/
// builder were added.
export const POLYMARKET_ORDER_DOMAIN_NAME = "Polymarket CTF Exchange";
export const POLYMARKET_ORDER_DOMAIN_VERSION = "2";
export const POLYMARKET_ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
    { name: "timestamp", type: "uint256" },
    { name: "metadata", type: "bytes32" },
    { name: "builder", type: "bytes32" },
  ],
};
// 0 = BUY, 1 = SELL (Side enum in OrderStructs.sol)
export const POLYMARKET_ORDER_SIDE_BUY = 0;
export const POLYMARKET_ORDER_SIDE_SELL = 1;
// metadata/builder are unused optional bytes32 slots in the V2 struct,
// always zero unless attaching a builder code (not used here).
export const POLYMARKET_BYTES32_ZERO = "0x" + "0".repeat(64);
// SignatureType enum in OrderStructs.sol. EOA is a plain wallet acting
// as its own maker. POLY_GNOSIS_SAFE is for a legacy Polymarket account
// still backed directly by its original Gnosis Safe (pre-migration,
// never upgraded), a standard ECDSA signature from the Safe's owner,
// just with maker (the Safe) and signer (the owner) as different
// addresses, verified directly against getSafeWalletAddress(signer) on
// the exchange contract itself. POLY_1271 is Polymarket's newer
// "deposit wallet" (mandatory since their 2026 account-upgrade flow,
// see depositWalletFactory above): maker AND signer both equal the
// deposit wallet's own address, and the signature itself is an ERC-1271
// "nested EIP-712" wrapper (Solady's ERC1271 mixin, confirmed straight
// from the deposit wallet's own verified source) rather than a plain
// ECDSA signature the exchange can ecrecover directly, see
// signPolymarketOrderERC1271 in App.jsx. POLY_PROXY (the older
// Polymarket Proxy wallet system, distinct from both of the above)
// isn't handled, not needed for any case Lyra actually supports.
export const POLYMARKET_SIGNATURE_TYPE_EOA = 0;
export const POLYMARKET_SIGNATURE_TYPE_GNOSIS_SAFE = 2;
export const POLYMARKET_SIGNATURE_TYPE_POLY_1271 = 3;
// The deposit wallet's own EIP-712 domain (distinct from the order's
// domain above), confirmed live via eip712Domain() on a real deployed
// deposit wallet: {name:"DepositWallet", version:"1", salt: bytes32(0)}.
export const POLYMARKET_DEPOSIT_WALLET_DOMAIN_NAME = "DepositWallet";
export const POLYMARKET_DEPOSIT_WALLET_DOMAIN_VERSION = "1";

export function getDefiContracts(networkKey) {
  return DEFI_CONTRACTS_BY_NETWORK[networkKey] || {};
}

// LI.FI bridge quote proxy, server-side, network-agnostic (LI.FI
// itself routes across chains; this endpoint doesn't need to be
// duplicated per network).
export const LIFI_QUOTE_API_URL = `${API_BASE_URL}/api/bridge/quote`;

export const UNISWAP_V3_FEE_TIERS = [500, 3000, 10000, 100];

export const UNISWAP_V3_FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)"
];

export const UNISWAP_V3_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"
];

export const UNISWAP_V3_QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
];

export const AAVE_POOL_ABI = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
  "function withdraw(address asset, uint256 amount, address to) returns (uint256)"
];

// Used to read a user's real staked (aToken) balance directly, so the
// displayed balance can reflect the full on-chain position, wallet
// funds plus whatever is currently deposited in Aave, not just the
// liquid wallet amount.
// getReserveData is the pool-wide reserve state (not tied to any one
// user), its liquidityRate is the same real supply APR the AI's
// get_aave_apy tool reads server-side, so the staked-balance chip can
// show the actual rate instead of a static label.
export const AAVE_DATA_PROVIDER_ABI = [
  "function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)",
  "function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)"
];

// Aave V4's Spoke (see DEFI_CONTRACTS_BY_NETWORK.arc.aaveV4 above), a
// different shape from AAVE_POOL_ABI: assets are addressed by a small
// sequential reserveId instead of their own address, there's no
// referralCode, and there's no separate data-provider contract, the
// Spoke itself exposes the user's real supplied balance directly.
// Both function signatures verified live against the real deployed
// (proxied) contract's own ABI via Arc's Blockscout explorer.
export const AAVE_V4_SPOKE_ABI = [
  "function supply(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
  "function withdraw(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
  "function getUserSuppliedAssets(uint256 reserveId, address user) view returns (uint256)"
];

// Default slippage tolerance for swaps (0.5%, standard default for a
// liquid pair; adjustable per-operation if a specific ticket ever
// needs a different value, e.g. a thinner pool).
export const DEFAULT_SLIPPAGE = 0.005;

// ============================================================
// EXPLORER HELPERS, now take the network explicitly, since the app
// can point at more than one chain at a time.
// ============================================================
export function explorerAddress(address, network) {
  return `${network.explorer}/address/${address}`;
}

export function explorerTx(hash, network) {
  return `${network.explorer}/tx/${hash}`;
}

// ============================================================
// BACKEND-ONLY BACKWARD-COMPATIBLE ALIASES
// ============================================================
// The server/ folder only ever operates on Plasma (testnet here). Aliases kept so
// server/tools/*.js keep working without being rewritten.
export const ACTIVE_NETWORK = PLASMA_TESTNET;
export const TOKENS = TOKENS_BY_NETWORK.plasma;
export const DEFI_CONTRACTS = DEFI_CONTRACTS_BY_NETWORK.plasma;
export const WXPL = WNATIVE_BY_NETWORK.plasma || null;