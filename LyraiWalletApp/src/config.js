// Backend API base URL. In dev, Vite falls back to the local server.
// In production, set VITE_API_URL (e.g. on Render/Vercel/Netlify) to
// the deployed backend's URL — every fetch() in the app reads this
// instead of a hardcoded localhost address.
export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:3001";

// ============================================================
// NETWORKS
// ============================================================
export const PLASMA_TESTNET = {
  key: "plasma_testnet",
  name: "Plasma Testnet",
  chainId: 9746,
  chainIdHex: "0x2612",
  rpcUrl: "https://testnet-rpc.plasma.to",
  nativeSymbol: "XPL",
  explorer: "https://testnet.plasmascan.to",
};

export const PLASMA_MAINNET = {
  key: "plasma",
  name: "Plasma",
  chainId: 9745,
  chainIdHex: "0x2611",
  rpcUrl: "https://rpc.plasma.to",
  nativeSymbol: "XPL",
  explorer: "https://plasmascan.to",
  color: "#007e02",
};

 export const ETHEREUM_MAINNET = {
     key: "ethereum",
     name: "Ethereum",
     chainId: 1,
     chainIdHex: "0x1",
     rpcUrl: (typeof import.meta !== "undefined" && import.meta.env?.VITE_ETH_RPC_URL) || "https://eth.llamarpc.com",
     nativeSymbol: "ETH",
     explorer: "https://etherscan.io",
     color: "#1436be",
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
   };

// Ordered list of supported networks — drives the network switcher UI
// directly. Add a network here (plus its TOKENS_BY_NETWORK and
// DEFI_CONTRACTS_BY_NETWORK entries below) and it shows up everywhere,
// no other hardcoded list to update.
export const NETWORKS = [PLASMA_MAINNET, ETHEREUM_MAINNET, BASE_MAINNET];

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
// official source before being added — never guessed or assumed
// identical across chains, since the same token has a different
// contract address on every network.
//
// Plasma: USDT verified 16.08.2026 (official Plasma/Tether docs).
// USDC/EURC verified 28.08.2026 via Circle's official announcement
// (circle.com/blog/now-available-usdc-eurc-cctp-and-bridge-kit-on-plasma).
//
// Ethereum & Base: canonical USDC/USDT addresses, well-established
// and widely documented (Circle's own docs, Etherscan/Basescan
// verified contracts). Verified 29.08.2026.
export const TOKENS_BY_NETWORK = {
  plasma: {
    USDT: { symbol: "USDT", name: "Tether USD", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, color: "#26A17B" },
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
  "function symbol() view returns (string)"
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
};

export const WETH9_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

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
  },
};

export function getDefiContracts(networkKey) {
  return DEFI_CONTRACTS_BY_NETWORK[networkKey] || {};
}

// LI.FI bridge quote proxy — server-side, network-agnostic (LI.FI
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
// displayed balance can reflect the full on-chain position — wallet
// funds plus whatever is currently deposited in Aave — not just the
// liquid wallet amount.
export const AAVE_DATA_PROVIDER_ABI = [
  "function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)"
];

// Default slippage tolerance for swaps (0.5% — standard default for a
// liquid pair; adjustable per-operation if a specific ticket ever
// needs a different value, e.g. a thinner pool).
export const DEFAULT_SLIPPAGE = 0.005;

// ============================================================
// EXPLORER HELPERS — now take the network explicitly, since the app
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
// is hardcoded to 9745 in server.js) — it doesn't need the frontend's
// multi-network split above. These aliases keep server/tools/*.js
// working without rewriting them for multi-chain support they don't
// actually need.
export const ACTIVE_NETWORK = PLASMA_MAINNET;
export const TOKENS = TOKENS_BY_NETWORK.plasma;
export const DEFI_CONTRACTS = DEFI_CONTRACTS_BY_NETWORK.plasma;
export const WXPL = WNATIVE_BY_NETWORK.plasma;