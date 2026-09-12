/**
 * DEFI PROTOCOLS, PER-NETWORK CONFIGURATION
 * ================================================================
 *
 * Same shape as DEFI_CONTRACTS_BY_NETWORK/getDefiContracts in
 * src/config.js (one object per network key, one getter that takes
 * the network key), kept consistent so both files read the same way.
 *
 * Addresses verified on 16.08.2026 (Plasma) and 29.08.2026
 * (Ethereum/Base):
 * - Uniswap V3 & LI.FI: official Plasma "Ecosystem Contracts" page
 *   (plasma.org/docs/plasma-chain/network-information/ecosystem-contracts)
 *   for Plasma; official Uniswap deployments docs + BaseScan/Etherscan
 *   contract tags for Ethereum/Base.
 * - Aave V3: official Aave Address Book (aave-dao/aave-address-book).
 * - WXPL (Wrapped XPL): verified directly on PlasmaScan.
 *
 * The same addresses are duplicated on the frontend in src/config.js
 * (DEFI_CONTRACTS_BY_NETWORK), because the frontend, the only place
 * holding the decrypted private key, is what builds and signs
 * transactions. This file decides whether a feature is enabled per
 * network and gives context to the agent that prepares tickets.
 *
 * WHAT REMAINS INTENTIONALLY UNGUARANTEED, even once enabled:
 *   - SWAP: available for the native coin <-> that network's stable-
 *     coins (native coin is wrapped first, since Uniswap V3 only
 *     understands ERC-20 tokens).
 *   - BRIDGE: the exact transaction is fetched live from the LI.FI
 *     API (never hand-built), via a server-side proxy.
 *   - STAKING: Aave V3 is a standard, audited protocol, but double
 *     check that the asset you want to deposit is actually listed as
 *     an active reserve on that network's market before trusting it
 *     with a large amount, a deposit on an unsupported asset fails
 *     cleanly (no loss of funds), but it's worth checking beforehand
 *     at https://app.aave.com.
 */

export const DEFI_STATUS_BY_NETWORK = {
  plasma: {
    swap: {
      enabled: true,
      addressesVerified: true,
      platform: "Uniswap V3",
      network: "Plasma Mainnet",
      router: "0x807F4E281B7A3B324825C64ca53c69F0b418dE40",
      quoter: "0xaa52bB8110fE38D0d2d2AF0B85C3A3eE622CA455",
      factory: "0xcb2436774C3e191c85056d248EF4260ce5f27A9D",
      limitation: "XPL, USDT0, USDC and EURC are available (native XPL is wrapped into WXPL first).",
      riskLevel: "low",
    },
    bridge: {
      enabled: true,
      addressesVerified: true,
      platform: "LI.FI (used by Jumper Exchange)",
      network: "Plasma Mainnet",
      contract: "0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37",
      quoteApi: "https://li.quest/v1/quote",
      riskLevel: "moderate",
    },
    staking: {
      enabled: true,
      addressesVerified: true,
      platform: "Aave V3",
      network: "Plasma Mainnet",
      pool: "0x925a2A7214Ed92428B5b1B090F80b25700095e12",
      poolAddressesProvider: "0x061D8e131F26512348ee5FA42e2DF1bA9d6505E9",
      protocolDataProvider: "0xf2D6E38B407e31E7E7e4a16E6769728b76c7419F",
      lock: false,
      riskLevel: "low",
    },
  },
  ethereum: {
    swap: {
      enabled: true,
      addressesVerified: true,
      platform: "Uniswap V3",
      network: "Ethereum Mainnet",
      router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
      quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      limitation: "ETH, USDT and USDC are available (native ETH is wrapped into WETH first).",
      riskLevel: "low",
    },
    bridge: {
      enabled: true,
      addressesVerified: true,
      platform: "LI.FI (used by Jumper Exchange)",
      network: "Ethereum Mainnet",
      contract: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
      quoteApi: "https://li.quest/v1/quote",
      riskLevel: "moderate",
    },
    staking: {
      enabled: true,
      addressesVerified: true,
      platform: "Aave V3",
      network: "Ethereum Mainnet",
      pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
      poolAddressesProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
      protocolDataProvider: "0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD",
      lock: false,
      riskLevel: "low",
    },
  },
  base: {
    swap: {
      enabled: true,
      addressesVerified: true,
      platform: "Uniswap V3",
      network: "Base",
      router: "0x2626664c2603336E57B271c5C0b26F421741e481",
      quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
      factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      limitation: "ETH, USDC and EURC are available (native ETH is wrapped into WETH first).",
      riskLevel: "low",
    },
    bridge: {
      enabled: true,
      addressesVerified: true,
      platform: "LI.FI (used by Jumper Exchange)",
      network: "Base",
      contract: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
      quoteApi: "https://li.quest/v1/quote",
      riskLevel: "moderate",
    },
    staking: {
      enabled: true,
      addressesVerified: true,
      platform: "Aave V3",
      network: "Base",
      pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
      poolAddressesProvider: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
      protocolDataProvider: "0xC4Fcf9893072d61Cc2899C0054877Cb752587981",
      lock: false,
      riskLevel: "low",
    },
  },
};

export function isDefiFeatureEnabled(networkKey, feature) {
  return !!DEFI_STATUS_BY_NETWORK[networkKey]?.[feature]?.enabled;
}

export function getDefiFeatureInfo(networkKey, feature) {
  return DEFI_STATUS_BY_NETWORK[networkKey]?.[feature] || null;
}
