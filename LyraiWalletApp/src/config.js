// Backend API base URL. In dev, Vite falls back to the local server.
// In production, set VITE_API_URL (e.g. on Render/Vercel/Netlify) to
// the deployed backend's URL. Every fetch() in the app reads this
// instead of a hardcoded localhost address.
export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:3001";

export const KYBERSWAP_CLIENT_ID = "Lyra";

// ============================================================
// NETWORKS
// ============================================================
export const PLASMA_MAINNET = {
  key: "plasma",
  name: "Plasma",
  chainId: 9745,
  chainIdHex: "0x2611",
  rpcUrl: "https://rpc.plasma.to",
  nativeSymbol: "XPL",
  explorer: "https://plasmascan.to",
  color: "#007e02",
  kyberSlug: "plasma",
  coingeckoId: "plasma",
  description: "A purpose-built L1 for stablecoins, near-instant, low-fee USD₮ transfers with full EVM compatibility.",
};

export const ETHEREUM_MAINNET = {
  key: "ethereum",
  name: "Ethereum",
  chainId: 1,
  chainIdHex: "0x1",
  rpcUrl: (typeof import.meta !== "undefined" && import.meta.env?.VITE_ETH_RPC_URL) || "https://ethereum-rpc.publicnode.com",
  nativeSymbol: "ETH",
  explorer: "https://etherscan.io",
  color: "#1436be",
  kyberSlug: "ethereum",
  // Base's native gas token is also ETH, same CoinGecko market/price.
  coingeckoId: "ethereum",
  description: "The original smart-contract blockchain, the most decentralized and battle-tested, home to most of DeFi.",
};

export const BASE_MAINNET = {
  key: "base",
  name: "Base",
  chainId: 8453,
  chainIdHex: "0x2105",
  rpcUrl: (typeof import.meta !== "undefined" && import.meta.env?.VITE_BASE_RPC_URL) || "https://mainnet.base.org",
  nativeSymbol: "ETH",
  explorer: "https://basescan.org",
  color: "#0052FF",
  kyberSlug: "base",
  coingeckoId: "ethereum",
  description: "Coinbase's Ethereum L2, fast, low-cost transactions secured by Ethereum itself.",
};

export const POLYGON_MAINNET = {
  key: "polygon",
  name: "Polygon",
  chainId: 137,
  chainIdHex: "0x89",
  // polygon-rpc.com was returning 401 "tenant disabled" as of 09.09.2026
  // (a real outage on their end, not a config issue), publicnode's free
  // endpoint then took over, but it was answering "upstream overloaded"
  // on 03.10.2026, dRPC's free endpoint verified working live instead.
  rpcUrl: (typeof import.meta !== "undefined" && import.meta.env?.VITE_POLYGON_RPC_URL) || "https://polygon.drpc.org",
  nativeSymbol: "POL",
  explorer: "https://polygonscan.com",
  color: "#8247E5",
  kyberSlug: "polygon",
  // POL replaced MATIC as Polygon's native gas token in 2024; this is
  // CoinGecko's current id for it, not the legacy "matic-network" one.
  coingeckoId: "polygon-ecosystem-token",
  description: "A fast, low-cost Ethereum sidechain, home to Polymarket's prediction markets.",
};

// Circle's own L1, public mainnet went live 16.09.2026. Its gas token
// isn't a separate volatile coin, USDC itself is the native currency
// (confirmed live: eth_chainId on rpc.mainnet.arc.io returns 0x13b2 =
// 5042, and a real account's eth_getBalance came back as an
// 18-decimal wei-style value, e.g. 0x38320c900bbb5b6d590 = ~16,586,
// a plausible dollar amount, not the ~16.6 trillion it'd be under
// USDC's usual 6 decimals). So nativeSymbol "USDC" works with the
// rest of the app's existing ethers.formatEther-everywhere logic with
// no special-casing, same as any other native coin. No DEX/lending/
// bridge contracts exist for it yet anywhere (it's hours old), so it
// intentionally has no TOKENS_BY_NETWORK.arc or
// DEFI_CONTRACTS_BY_NETWORK.arc entries yet, balance/send/receive
// only for now, and it's also not in multisig.js's
// SAFE_SUPPORTED_NETWORK_KEYS (Safe's Transaction Service doesn't
// list it) or LI.FI's bridge chain list in App.jsx.
export const ARC_MAINNET = {
  key: "arc",
  name: "Arc",
  chainId: 5042,
  chainIdHex: "0x13b2",
  rpcUrl: "https://rpc.mainnet.arc.io",
  nativeSymbol: "USDC",
  explorer: "https://explorer.arc.io",
  color: "#1473E6",
  kyberSlug: null,
  // Arc's native currency already IS USDC, so its USD price tracks
  // the real usd-coin market instead of floating unpegged.
  coingeckoId: "usd-coin",
  description: "Circle's stablecoin-native L1, USDC itself pays the gas, sub-second finality, built for payments and tokenized assets.",
};

// Ordered list of supported networks, drives the network switcher UI
// directly. Add a network here (plus its TOKENS_BY_NETWORK and
// DEFI_CONTRACTS_BY_NETWORK entries below) and it shows up everywhere,
// no other hardcoded list to update.
export const NETWORKS = [PLASMA_MAINNET, ETHEREUM_MAINNET, BASE_MAINNET, POLYGON_MAINNET, ARC_MAINNET];

// Default network on first launch. Persisted afterward in
// localStorage under "plasma_active_network_v1".
export const DEFAULT_NETWORK = PLASMA_MAINNET;

export function getNetworkByKey(key) {
  return NETWORKS.find(n => n.key === key) || DEFAULT_NETWORK;
}

// ============================================================
// PER-NETWORK ERC-20 TOKENS
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
  plasma: {
    // Plasma's USDT deployment is technically USDT0 (LayerZero's
    // omnichain fungible USDT standard), not native/canonical Tether,
    // labeled that way everywhere in the app on purpose, so the ticket
    // a user signs matches what block explorers and other tools call
    // this exact contract.
    USDT0: { symbol: "USDT0", name: "USDT0", address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", decimals: 6, color: "#26A17B" },
    USDC: { symbol: "USDC", name: "USD Coin", address: "0x2d661C89D812261039AF9764eceaAee884f5F67F", decimals: 6, color: "#2775CA" },
    EURC: { symbol: "EURC", name: "Euro Coin", address: "0x3ee196e78d4d4248b849b8e1c7f44c5457fafd2c", decimals: 6, color: "#0066B3" },
  },
  ethereum: {
    USDT: { symbol: "USDT", name: "Tether USD", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, color: "#26A17B" },
    USDC: { symbol: "USDC", name: "USD Coin", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, color: "#2775CA" },
  },
  base: {
    USDC: { symbol: "USDC", name: "USD Coin", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, color: "#2775CA" },
    EURC: { symbol: "EURC", name: "Euro Coin", address: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", decimals: 6, color: "#0066B3" },
  },
  polygon: {
    // Bridged USDC (PoS), not native/canonical USDC, this is the one
    // Polymarket actually uses as collateral for orders/positions.
    // Verified on PolygonScan 09.09.2026.
    USDCE: { symbol: "USDC.e", name: "Bridged USDC (PoS)", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6, color: "#2775CA" },
  },
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
  plasma: {
    symbol: "WXPL",
    name: "Wrapped XPL",
    address: "0x6100E367285b01F48D07953803A2d8dCA5D19873", // verified on PlasmaScan
    decimals: 18,
  },
  ethereum: {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // canonical WETH9, verified via Uniswap docs / Aave address book
    decimals: 18,
  },
  base: {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x4200000000000000000000000000000000000006", // official Base predeploy, verified via Uniswap Base deployments docs
    decimals: 18,
  },
  polygon: {
    // Still named WMATIC on-chain (predates the MATIC -> POL rebrand),
    // verified via Etherscan-v2's multichain API against Polygon.
    symbol: "WMATIC",
    name: "Wrapped Matic",
    address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
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
// Sources:
// - Plasma: official Plasma "Ecosystem Contracts" page + Aave address
//   book (AaveV3Plasma.sol), verified 16.08.2026.
// - Ethereum: Uniswap V3 canonical deployment (developers.uniswap.org)
//   + Aave address book (AaveV3Ethereum.ts), verified 29.08.2026.
// - Base: Uniswap V3 official Base deployments page
//   (developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments)
//   + Aave address book (AaveV3Base.sol), verified 29.08.2026.

export const DEFI_CONTRACTS_BY_NETWORK = {
  plasma: {
    oku: {
      enabled: true,
    },

    // Tu peux le conserver comme fallback
    uniswapV3: {
      router: "0x807F4E281B7A3B324825C64ca53c69F0b418dE40",
      quoter: "0xaa52bB8110fE38D0d2d2AF0B85C3A3eE622CA455",
      factory: "0xcb2436774C3e191c85056d248EF4260ce5f27A9D",
    },
    aave: {
      pool: "0x925a2A7214Ed92428B5b1B090F80b25700095e12",
      poolAddressesProvider: "0x061D8e131F26512348ee5FA42e2DF1bA9d6505E9",
      protocolDataProvider: "0xf2D6E38B407e31E7E7e4a16E6769728b76c7419F",
    },
    lifi: {
      diamond: "0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37",
    },
  },
  ethereum: {
    uniswapV3: {
      router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",   // SwapRouter02
      quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",    // QuoterV2
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",   // UniswapV3Factory
    },
    aave: {
      pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
      poolAddressesProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
      protocolDataProvider: "0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD",
    },
    // Same LiFiDiamond address as Base and most LI.FI-supported chains,
    // verified via BaseScan/Etherscan's own contract name tags on
    // 04.09.2026, not just the docs' general claim (Plasma below uses a
    // different address, so per-chain addresses do genuinely vary).
    lifi: {
      diamond: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
    },
  },
  base: {
    uniswapV3: {
      router: "0x2626664c2603336E57B271c5C0b26F421741e481",   // SwapRouter02
      quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",    // QuoterV2
      factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",   // UniswapV3Factory
    },
    aave: {
      pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
      poolAddressesProvider: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
      protocolDataProvider: "0xC4Fcf9893072d61Cc2899C0054877Cb752587981",
    },
    // Verified via BaseScan's own contract name tag on 04.09.2026.
    lifi: {
      diamond: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
    },
  },
  polygon: {
    // Canonical Uniswap V3 deployment, verified via Uniswap's official
    // Polygon deployments docs 09.09.2026, identical to Ethereum's own
    // addresses (Base has its own distinct deployment, these don't).
    uniswapV3: {
      router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",   // SwapRouter02
      quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",    // QuoterV2
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",   // UniswapV3Factory
    },
    // Verified via LI.FI's own /v1/chains API 09.09.2026 (key "pol",
    // same diamond address as Ethereum/Base).
    lifi: {
      diamond: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
    },
    // Polymarket's own contracts. ctfExchange handles plain binary
    // (2-outcome) markets, negRiskExchange handles multi-outcome markets
    // (e.g. any 3-way match result, most team-sport markets), where a
    // group of yes/no markets is meant to sum to 100%.
    //
    // These are the V2 exchange deployments, confirmed live 10.09.2026
    // against Polymarket's own CLOB API (GET https://clob.polymarket.com
    // /version returned {"version":2}) and against Polymarket's official
    // clob-client-v2 source (src/config.ts MATIC_CONTRACTS.exchangeV2 /
    // negRiskExchangeV2). The original V1 addresses (still deployed, but
    // no longer accepted by the live CLOB: "invalid order version, please
    // use the latest clob-client") were 0x4bFb41d5B3570DeFd03C39a9A4D8dE6
    // Bd8B8982E / 0xC5d563A36AE78145C45a50134d48A1215220f80a. Both V1 and
    // V2 resolve the same Gnosis Safe address for a given owner (verified
    // via eth_call), just under a renamed view function: V1 exposed
    // getSafeAddress(signer), V2 exposes getSafeWalletAddress(signer).
    polymarket: {
      ctfExchange: "0xE111180000d2663C0091e4f400237545B87B996B",
      negRiskExchange: "0xe2222d279d744050d28e00520010520000310F59",
      conditionalTokens: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
      // Polymarket's newer "deposit wallet" system, mandatory since their
      // 2026 migration (a legacy Gnosis Safe account gets a one-time
      // "upgrade your account" prompt on polymarket.com; once migrated,
      // the old Safe stops being usable as maker at all). This is
      // DepositWalletFactory, confirmed live on PolygonScan: it's also
      // the "beacon" a deployed wallet proxy queries for its current
      // implementation(). factory.predictWalletAddress(anyImplementation,
      // bytes32(uint256(uint160(ownerAddress)))) deterministically
      // resolves an owner's deposit wallet address (verified against a
      // real deployed wallet's own WalletDeployed event, where the
      // indexed "id" is exactly the owner's address left-padded).
      depositWalletFactory: "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07",
    },
  },
  // Aave V4 (not V3, a genuinely different contract architecture,
  // Hub-and-Spoke rather than a single Pool), Circle's own DAO
  // proposal for Arc's launch. No REST API/SDK for this part, read
  // straight off the verified "MAIN_SPOKE" contract via Arc's own
  // Blockscout explorer (its "Read/Write proxy" tab, since the address
  // below is an EIP-1967 proxy) and cross-checked against aave-dao/
  // aave-address-book's AaveV4Arc.sol, both 16.09.2026 (launch day).
  // reserveId isn't the asset's address like Aave V3, it's a small
  // sequential per-Spoke index, confirmed live via getReserve(id).
  // underlying == USDC/EURC's own address for id 0/1 respectively.
  arc: {
    aaveV4: {
      spoke: "0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d", // MAIN_SPOKE
      hub: "0x17288dfc86205301064577b98B02b81017e6F79C", // CORE_HUB
      reserves: {
        USDC: { id: 0, address: "0x3600000000000000000000000000000000000000", decimals: 6 },
        EURC: { id: 1, address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1", decimals: 6 },
      },
    },
  },
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
// The server/ folder only ever operates on Plasma (ACTIVE_CHAIN_ID
// is hardcoded to 9745 in server.js). It doesn't need the frontend's
// multi-network split above. These aliases keep server/tools/*.js
// working without rewriting them for multi-chain support they don't
// actually need.
export const ACTIVE_NETWORK = PLASMA_MAINNET;
export const TOKENS = TOKENS_BY_NETWORK.plasma;
export const DEFI_CONTRACTS = DEFI_CONTRACTS_BY_NETWORK.plasma;
export const WXPL = WNATIVE_BY_NETWORK.plasma;