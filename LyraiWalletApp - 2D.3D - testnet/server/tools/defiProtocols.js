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
      platform: "KyberSwap (aggregator)",
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
      platform: "KyberSwap (aggregator)",
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
      platform: "KyberSwap (aggregator)",
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
  // No staking entry: Aave isn't wired up on Polygon, not asked for.
  // Added so a user can bridge in POL and swap it to USDC.e (Polymarket's
  // collateral) entirely through Lyra instead of an external bridge/exchange.
  polygon: {
    swap: {
      enabled: true,
      addressesVerified: true,
      platform: "KyberSwap (aggregator)",
      network: "Polygon",
      router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
      quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      limitation: "POL and USDC.e are available (native POL is wrapped into WMATIC first).",
      riskLevel: "low",
    },
    bridge: {
      enabled: true,
      addressesVerified: true,
      platform: "LI.FI (used by Jumper Exchange)",
      network: "Polygon",
      contract: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
      quoteApi: "https://li.quest/v1/quote",
      riskLevel: "moderate",
    },
  },
  // Arc (Circle's own L1, mainnet launched 16.09.2026) has no
  // Uniswap/LI.FI deployment, its swap and bridge run on Circle's own
  // App Kit SDKs client-side instead (@circle-fin/swap-kit,
  // @circle-fin/bridge-kit over real CCTP), so there's no router/
  // quoteApi to record here the way the other networks have. Staking
  // is real Aave V4 (a different, Hub-and-Spoke contract architecture
  // from the Aave V3 used everywhere else), addresses cross-verified
  // 16.09.2026 against Arc's own Blockscout explorer (its "Read/Write
  // proxy" tab) and aave-dao/aave-address-book's AaveV4Arc.sol.
  arc: {
    swap: {
      enabled: true,
      addressesVerified: true,
      platform: "Circle Swap Kit (an App Kit SDK, not Uniswap)",
      network: "Arc Mainnet",
      limitation: "USDC and EURC only, converted directly through Circle's own SDK client-side.",
      riskLevel: "low",
    },
    bridge: {
      enabled: true,
      addressesVerified: true,
      platform: "Circle Bridge Kit (real CCTP v2, not LI.FI)",
      network: "Arc Mainnet",
      contract: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d", // TokenMessengerV2, CCTP domain 26
      riskLevel: "low",
    },
    staking: {
      enabled: true,
      addressesVerified: true,
      platform: "Aave V4",
      network: "Arc Mainnet",
      spoke: "0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d", // MAIN_SPOKE
      hub: "0x17288dfc86205301064577b98B02b81017e6F79C", // CORE_HUB
      lock: false,
      riskLevel: "low",
    },
  },
  // HyperEVM (Hyperliquid's own EVM, mainnet since Feb 2025, chain id 999).
  // No router/quoter/factory here on purpose: the swap runs through
  // KyberSwap client-side (kyberSlug "hyperevm" in src/config.js), same as
  // Plasma/Ethereum/Base/Polygon's own swap, not a Uniswap deployment, so
  // there's no on-chain factory/quoter pair for the server's live-quote
  // tool to read from either (see getRealSwapQuote's own Hyperliquid guard
  // in server.js). No staking entry: no Aave deployment on HyperEVM at
  // all, only unrelated third-party forks (HyperLend, HypurrFi), not
  // offered here, same reasoning as Polygon's missing staking entry above.
  // Verified 27.09.2026: KyberSwap's HyperEVM route live-tested
  // (aggregator-api.kyberswap.com/hyperevm/api/v1/routes returned a real
  // route for native HYPE -> USDT0), LI.FI's diamond address for chain id
  // 999 via its own /v1/chains API (key "hyp"), cross-checked against the
  // shared 0x1231...4EaE diamond NOT being the one used here (own address,
  // like Plasma).
  hyperliquid: {
    swap: {
      enabled: true,
      addressesVerified: true,
      platform: "KyberSwap (aggregator)",
      network: "HyperEVM",
      limitation: "HYPE and USDT0 are available (native HYPE is swapped directly, no wrapping needed for an aggregator route).",
      riskLevel: "low",
    },
    bridge: {
      enabled: true,
      addressesVerified: true,
      platform: "LI.FI (used by Jumper Exchange)",
      network: "HyperEVM",
      contract: "0x0a0758d937d1059c356D4714e57F5df0239bce1A",
      quoteApi: "https://li.quest/v1/quote",
      riskLevel: "moderate",
    },
  },
};

export function isDefiFeatureEnabled(networkKey, feature) {
  return !!DEFI_STATUS_BY_NETWORK[networkKey]?.[feature]?.enabled;
}

export function getDefiFeatureInfo(networkKey, feature) {
  return DEFI_STATUS_BY_NETWORK[networkKey]?.[feature] || null;
}
