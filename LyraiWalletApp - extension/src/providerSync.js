// Keeps the extension background (public/providerBackground.js) up to date
// with what it needs to answer websites: the wallet's address and Lyra's
// networks. The background can't read this page's localStorage itself.
import { NETWORKS } from "./config";

function hasExtensionStorage() {
  return typeof chrome !== "undefined" && !!chrome?.storage?.local;
}

export function syncNetworks() {
  if (!hasExtensionStorage()) return;
  const lyraNetworks = NETWORKS.map((n) => ({
    key: n.key,
    name: n.name,
    chainId: n.chainId,
    chainIdHex: n.chainIdHex,
    rpcUrl: n.rpcUrl,
    nativeSymbol: n.nativeSymbol,
  }));
  chrome.storage.local.set({ lyraNetworks }).catch(() => {});
}

// address: the wallet's address, or null when there is no wallet any more.
export async function syncAddress(address) {
  if (!hasExtensionStorage()) return;
  try {
    const { lyraAddress = null } = await chrome.storage.local.get("lyraAddress");
    const next = address || null;
    if ((lyraAddress || "").toLowerCase() === (next || "").toLowerCase()) return;
    // A different wallet (or none): sites connected to the old one must ask again.
    await chrome.storage.local.set({ lyraAddress: next, lyraSites: {} });
  } catch {
    // storage unavailable: websites just won't see the wallet
  }
}
