// Ported verbatim from Lyra-iWallet's own src/config.js, where every
// address/struct here was confirmed live against Polymarket's V2 CLOB
// and its official clob-client-v2 source. See that file's comments for
// the full derivation history; kept here unmodified so this bot tracks
// the exact same, already-working contract wiring.

export const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
export const CLOB_API_BASE = "https://clob.polymarket.com";
export const DATA_API_BASE = "https://data-api.polymarket.com";

export const CHAIN_ID = 137;

export const POLYMARKET_CONTRACTS = {
  ctfExchange: "0xE111180000d2663C0091e4f400237545B87B996B",
  negRiskExchange: "0xe2222d279d744050d28e00520010520000310F59",
  conditionalTokens: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  depositWalletFactory: "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07",
};

// USDC.e (bridged USDC on Polygon). Collateral for a legacy Safe/EOA maker.
export const USDCE = {
  address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  symbol: "USDC.e",
  decimals: 6,
};

// A deposit wallet's real collateral is Polymarket's own "pUSD", not
// USDC.e (see Lyra's config.js for the on-chain proof). Only relevant
// for a POLY_1271 maker.
export const POLYMARKET_PUSD_COLLATERAL = {
  address: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
  symbol: "pUSD",
  decimals: 6,
};

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

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

export const POLYMARKET_ORDER_SIDE_BUY = 0;
export const POLYMARKET_ORDER_SIDE_SELL = 1;
export const POLYMARKET_BYTES32_ZERO = "0x" + "0".repeat(64);

export const POLYMARKET_SIGNATURE_TYPE_EOA = 0;
export const POLYMARKET_SIGNATURE_TYPE_GNOSIS_SAFE = 2;
export const POLYMARKET_SIGNATURE_TYPE_POLY_1271 = 3;

export const POLYMARKET_DEPOSIT_WALLET_DOMAIN_NAME = "DepositWallet";
export const POLYMARKET_DEPOSIT_WALLET_DOMAIN_VERSION = "1";
