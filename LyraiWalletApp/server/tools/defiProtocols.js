/**
 * DEFI PROTOCOLS — MAINNET CONFIGURATION
 * ================================================================
 *
 * Addresses verified on 16.08.2026:
 * - Uniswap V3 & LI.FI: official Plasma "Ecosystem Contracts" page
 *   (plasma.org/docs/plasma-chain/network-information/ecosystem-contracts)
 * - Aave V3: official Aave Address Book file
 *   (aave-dao/aave-address-book/src/AaveV3Plasma.sol), provided by
 *   Este and cross-checked against PlasmaScan.
 * - WXPL (Wrapped XPL): verified directly on PlasmaScan.
 *
 * The same addresses are duplicated on the frontend in src/config.js
 * (DEFI_CONTRACTS), because the frontend — the only place holding the
 * decrypted private key — is what builds and signs transactions. This
 * file decides whether a feature is enabled and gives context to the
 * agent that prepares tickets.
 *
 * WHAT REMAINS INTENTIONALLY UNGUARANTEED, even once enabled:
 *   - SWAP: available for XPL <-> USDT (native XPL is wrapped into
 *     WXPL first, since Uniswap V3 only understands ERC-20 tokens).
 *     USDT <-> USDC is not possible — USDC does not exist on Plasma.
 *   - BRIDGE: the exact transaction is fetched live from the LI.FI
 *     API (never hand-built), via a server-side proxy.
 *   - STAKING: Aave V3 is a standard, audited protocol, but double
 *     check that the asset you want to deposit (XPL/USDT) is actually
 *     listed as an active reserve on the Plasma market before trusting
 *     it with a large amount — a deposit on an unsupported asset fails
 *     cleanly (no loss of funds), but it's worth checking beforehand
 *     at https://app.aave.com/?marketName=proto_plasma_v3
 */

export const SWAP = {
  enabled: true,
  addressesVerified: true,
  platform: "Uniswap V3",
  network: "Plasma Mainnet",
  router: "0x807F4E281B7A3B324825C64ca53c69F0b418dE40",
  quoter: "0xaa52bB8110fE38D0d2d2AF0B85C3A3eE622CA455",
  factory: "0xcb2436774C3e191c85056d248EF4260ce5f27A9D",
  limitation: "Only XPL <-> USDT is available (native XPL is wrapped into WXPL first). USDC does not exist on Plasma, so no other pair is possible for now.",
  riskLevel: "moderate",
};

export const BRIDGE = {
  enabled: true,
  addressesVerified: true,
  platform: "LI.FI (used by Jumper Exchange)",
  network: "Plasma Mainnet",
  contract: "0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37",
  quoteApi: "https://li.quest/v1/quote",
  riskLevel: "moderate",
};

export const STAKING = {
  enabled: true,
  addressesVerified: true,
  platform: "Aave V3",
  network: "Plasma Mainnet",
  pool: "0x925a2A7214Ed92428B5b1B090F80b25700095e12",
  poolAddressesProvider: "0x061D8e131F26512348ee5FA42e2DF1bA9d6505E9",
  protocolDataProvider: "0xf2D6E38B407e31E7E7e4a16E6769728b76c7419F",
  lock: false, // Standard Aave: withdrawal possible at any time
  riskLevel: "low", // established, widely audited protocol — never zero (smart contract risk)
};

export function isDefiFeatureEnabled(feature) {
  switch (feature) {
    case "swap":
      return SWAP.enabled;
    case "bridge":
      return BRIDGE.enabled;
    case "staking":
      return STAKING.enabled;
    default:
      return false;
  }
}

export function getDefiFeatureInfo(feature) {
  switch (feature) {
    case "swap":
      return SWAP;
    case "bridge":
      return BRIDGE;
    case "staking":
      return STAKING;
    default:
      return null;
  }
}
