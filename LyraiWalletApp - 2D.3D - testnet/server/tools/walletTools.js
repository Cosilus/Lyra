import { ethers } from "ethers";
import { getNetworkByKey } from "../../src/config.js";

// One provider per network, built lazily and reused, avoids opening
// a fresh JSON-RPC connection on every single balance/address check.
const providersByNetwork = new Map();

// network.rpcUrl reads import.meta.env.VITE_ETH_RPC_URL / VITE_BASE_RPC_URL,
// which only resolves in Vite's browser bundling. It's always undefined in
// this plain Node process, so without this override every server-side call
// silently used the hardcoded public fallback RPC instead of the paid
// Alchemy endpoint already configured in .env (dotenv doesn't care about
// the VITE_ prefix, so the same values are readable here too).
const RPC_OVERRIDE_BY_NETWORK = {
  ethereum: process.env.VITE_ETH_RPC_URL,
  base: process.env.VITE_BASE_RPC_URL,
  polygon: process.env.VITE_POLYGON_RPC_URL,
};

function getProvider(networkKey) {
  const network = getNetworkByKey(networkKey);
  if (!providersByNetwork.has(network.key)) {
    const rpcUrl = RPC_OVERRIDE_BY_NETWORK[network.key] || network.rpcUrl;
    providersByNetwork.set(network.key, new ethers.JsonRpcProvider(rpcUrl, network.chainId));
  }
  return providersByNetwork.get(network.key);
}

export async function getBalance(address, networkKey) {
  if (!address) {
    throw new Error("Missing wallet address.");
  }

  if (!ethers.isAddress(address)) {
    throw new Error("Invalid wallet address.");
  }

  const network = getNetworkByKey(networkKey);
  const provider = getProvider(networkKey);
  const balance = await provider.getBalance(address);

  return {
    address,
    network: network.key,
    nativeSymbol: network.nativeSymbol,
    balanceWei: balance.toString(),
    balanceFormatted: ethers.formatEther(balance)
  };
}

export function getAddress(address) {
  if (!address) {
    throw new Error("No wallet connected.");
  }

  if (!ethers.isAddress(address)) {
    throw new Error("Invalid wallet address.");
  }

  return {
    address
  };
}
